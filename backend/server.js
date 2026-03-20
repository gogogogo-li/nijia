import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import logger from './utils/logger.js';
import gamesRouter from './routes/games.js';
import playersRouter from './routes/players.js';
import multiplayerRouter from './routes/multiplayer.js';
import roomsRouter from './routes/rooms.js';
import rpcRouter from './routes/rpc.js';
import createSoloRouter from './routes/solo.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authenticateWallet } from './middleware/auth.js';
import { verifyAccessToken } from './utils/jwt.js';
import authRouter from './routes/auth.js';
import { GameManager } from './services/gameManager.js';
import SoloGameManager from './services/soloGameManager.js';
import RoomManager from './services/roomManager.js';
import chatService from './services/chatService.js';
import { supabase } from './config/supabase.js';
import { validateContractConfig } from './config/onechain.js';

dotenv.config();

// Validate contract configuration on startup
validateContractConfig();

const app = express();
const httpServer = createServer(app);

// Trust proxy for Render deployment (required for rate limiting)
app.set('trust proxy', 1);

// Allowed CORS origins: code defaults + FRONTEND_URL env (comma-separated)
const defaultOrigins = [
  'http://localhost:3000',
  'http://localhost:3002',
  'https://ninja.onechainops.com'
];
const envOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

// Socket.IO setup with enhanced security
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", ...allowedOrigins],
    }
  }
}));

app.use(compression());

// CORS configuration: set CORS_ALLOW_ALL=true to allow any origin; otherwise use FRONTEND_URL whitelist
const corsAllowAll = process.env.CORS_ALLOW_ALL === 'true';
app.use(cors({
  origin: corsAllowAll
    ? true
    : (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn(`Blocked CORS request from: ${origin}`);
          callback(new Error('Not allowed by CORS'));
        }
      },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Wallet-Address', 'X-Wallet-Signature', 'X-Wallet-Message', 'client-sdk-version', 'client-sdk-type', 'client-target-api-version', 'client-request-method']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check (no rate limit)
app.get('/api/health', (req, res) => res.status(200).end());

app.use('/api/', limiter);

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Initialize Game Manager
const gameManager = new GameManager(io, supabase);

// Initialize Room Manager (REQ-P2-004: 2-4 player multiplayer)
const roomManager = new RoomManager();

// Initialize Solo Game Manager
const soloGameManager = new SoloGameManager(supabase, null);
// Initialize admin keypair for payouts
soloGameManager.initialize().then(success => {
  if (success) {
    logger.info('✅ Solo Game Manager ready for payouts');
  } else {
    logger.warn('⚠️ Solo Game Manager running without payout capability');
  }
});

// Initialize Chat Service
chatService.initialize(io);

// Make gameManager, roomManager and io accessible globally
global.gameManager = gameManager;
global.roomManager = roomManager;
global.soloGameManager = soloGameManager;
global.io = io;

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'OneChain Ninja Backend',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      games: '/api/games',
      players: '/api/players',
      multiplayer: '/api/multiplayer',
      solo: '/api/solo',
      rpc: '/api/rpc',
      health: '/health'
    }
  });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/games', gamesRouter);
app.use('/api/players', playersRouter);
app.use('/api/multiplayer', multiplayerRouter);
app.use('/api/rooms', roomsRouter);  // REQ-P2-004: Multi-player room routes
app.use('/api/rpc', rpcRouter);
app.use('/api/solo', createSoloRouter(soloGameManager));

// Socket.IO authentication and event handling
io.use(async (socket, next) => {
  const { address, signature, token } = socket.handshake.auth;

  if (token) {
    try {
      const payload = verifyAccessToken(token);
      socket.walletAddress = payload.walletAddress;
      socket.authenticated = true;
      socket.authProvider = payload.provider || 'jwt';
      logger.info(`Socket connected via JWT: ${socket.id} (${payload.walletAddress})`);
      return next();
    } catch {
      return next(new Error('Invalid token'));
    }
  }

  if (!address) {
    return next(new Error('Authentication required'));
  }

  socket.walletAddress = address;
  socket.authenticated = !!signature;

  logger.info(`Socket connected: ${socket.id} (${address})`);
  next();
});

io.on('connection', (socket) => {
  const address = socket.walletAddress;

  // Join player's personal room
  socket.join(`player:${address}`);

  // Setup chat handlers
  chatService.setupSocketHandlers(socket);

  // Setup emote handlers
  gameManager.setupEmoteHandlers(socket, address);

  // Subscribe to available games
  socket.on('subscribe:games', (betTier) => {
    const room = betTier ? `games:tier:${betTier}` : 'games:all';
    socket.join(room);
    logger.info(`Socket ${socket.id} subscribed to ${room}`);

    // Send current available games
    const games = gameManager.getAvailableGames(betTier);
    socket.emit('games:list', games);
  });

  // Unsubscribe from games
  socket.on('unsubscribe:games', (betTier) => {
    const room = betTier ? `games:tier:${betTier}` : 'games:all';
    socket.leave(room);
    logger.info(`Socket ${socket.id} unsubscribed from ${room}`);
  });

  // Player status updates
  socket.on('player:status', (status) => {
    socket.broadcast.to(`player:${address}`).emit('player:status', status);
  });

  // Join game room for chat
  socket.on('join:game', (data) => {
    if (data.gameId) {
      socket.join(`game:${data.gameId}`);
      logger.info(`Socket ${socket.id} joined game chat: game:${data.gameId}`);
    }
  });

  // Disconnect handling
  socket.on('disconnect', (reason) => {
    logger.info(`Socket disconnected: ${socket.id} (${address}) - ${reason}`);

    // Handle any cleanup for active games
    gameManager.handlePlayerDisconnect(address);
  });

  // Error handling
  socket.on('error', (error) => {
    logger.error(`Socket error for ${socket.id}:`, error);
  });
});

// Realtime database changes subscription
const gamesChannel = supabase
  .channel('games-realtime')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'multiplayer_games' },
    (payload) => {
      logger.info(`Database change: ${payload.eventType}`, {
        table: 'multiplayer_games',
        gameId: payload.new?.game_id
      });

      gameManager.handleDatabaseChange(payload);
    }
  )
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      logger.info('Subscribed to multiplayer_games changes');
    }
  });

const playersChannel = supabase
  .channel('players-realtime')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'players' },
    (payload) => {
      logger.info(`Database change: ${payload.eventType}`, {
        table: 'players',
        address: payload.new?.address
      });

      if (payload.new?.address) {
        io.to(`player:${payload.new.address}`).emit('player:update', payload.new);
      }
    }
  )
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      logger.info('Subscribed to players changes');
    }
  });

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`
  });
});

// Start server
httpServer.listen(PORT, () => {
  logger.info('=====================================');
  logger.info('🚀 OneChain Ninja Backend Server');
  logger.info('=====================================');
  logger.info(`📡 Server running on port ${PORT}`);
  logger.info(`🌐 API: http://localhost:${PORT}`);
  logger.info(`🔌 WebSocket: http://localhost:${PORT}`);
  logger.info(`🎯 Frontend: ${process.env.FRONTEND_URL}`);
  logger.info(`🔗 Network: ${process.env.ONECHAIN_NETWORK}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
  logger.info('=====================================');
});

// Graceful shutdown
const gracefulShutdown = () => {
  logger.info('👋 Received shutdown signal, closing gracefully...');

  httpServer.close(() => {
    logger.info('✅ HTTP server closed');

    // Close database connections
    gamesChannel.unsubscribe();
    playersChannel.unsubscribe();

    // Cleanup game manager
    gameManager.cleanup();

    logger.info('✅ Cleanup complete');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('⚠️  Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown();
});

export default app;
