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
import { pool } from './config/postgres.js';
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
const gameManager = new GameManager(io, pool);

// Initialize Room Manager (REQ-P2-004: 2-4 player multiplayer)
const roomManager = new RoomManager();

// Initialize Solo Game Manager
const soloGameManager = new SoloGameManager(pool, null);
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

  logger.info(`[TG-AUTH] Socket auth attempt: socketId=${socket.id}, hasToken=${!!token}, hasAddress=${!!address}, hasSignature=${!!signature}`);

  if (token) {
    try {
      const payload = verifyAccessToken(token);
      socket.walletAddress = payload.walletAddress;
      socket.authenticated = true;
      socket.authProvider = payload.provider || 'jwt';
      logger.info(`[TG-AUTH] Socket auth via JWT OK: socketId=${socket.id}, provider=${payload.provider}, walletAddress=${payload.walletAddress}`);
      return next();
    } catch (err) {
      logger.warn(`[TG-AUTH] Socket JWT auth FAILED: socketId=${socket.id}, error=${err.message}`);
      return next(new Error('Invalid token'));
    }
  }

  if (!address) {
    logger.warn(`[TG-AUTH] Socket auth REJECTED: socketId=${socket.id}, no token and no address`);
    return next(new Error('Authentication required'));
  }

  socket.walletAddress = address;
  socket.authenticated = !!signature;

  logger.info(`[TG-AUTH] Socket auth via wallet: socketId=${socket.id}, address=${address}, authenticated=${!!signature}`);
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

// Note: when using direct Postgres (pg), we don't have Supabase realtime
// subscriptions. The game state mainly lives in memory + explicit API calls.

// 404 handler (before error handler so unmatched routes get a clean 404)
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
httpServer.listen(PORT, () => {
  logger.info('╔══════════════════════════════════════════════╗');
  logger.info('║  NINJA BACKEND — 2026-03-23-v4-zklogin       ║');
  logger.info('╚══════════════════════════════════════════════╝');
  logger.info(`📡 Server running on port ${PORT}`);
  logger.info(`🌐 API: http://localhost:${PORT}`);
  logger.info(`🔌 WebSocket: http://localhost:${PORT}`);
  logger.info(`🎯 Frontend: ${process.env.FRONTEND_URL}`);
  logger.info(`🔗 Network: ${process.env.ONECHAIN_NETWORK}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
  logger.info('--- zkLogin Config ---');
  logger.info(`  ZKLOGIN_JWT_ISSUER:     ${process.env.ZKLOGIN_JWT_ISSUER || '(not set)'}`);
  logger.info(`  ZKLOGIN_JWT_AUDIENCE:   ${process.env.ZKLOGIN_JWT_AUDIENCE || '(not set)'}`);
  logger.info(`  ZKLOGIN_SALT_MASTER_KEY: ${process.env.ZKLOGIN_SALT_MASTER_KEY ? '****' + process.env.ZKLOGIN_SALT_MASTER_KEY.slice(-4) : '(not set)'}`);
  logger.info(`  ZKLOGIN_PROVER_URL:     ${process.env.ZKLOGIN_PROVER_URL || '(not set)'}`);
  logger.info(`  ZKLOGIN_RSA_PRIVATE_KEY: ${process.env.ZKLOGIN_RSA_PRIVATE_KEY ? 'SET (' + process.env.ZKLOGIN_RSA_PRIVATE_KEY.length + ' chars)' : '(not set — will auto-generate)'}`);
  logger.info('══════════════════════════════════════════════');
});

// Graceful shutdown
const gracefulShutdown = () => {
  logger.info('👋 Received shutdown signal, closing gracefully...');

  httpServer.close(() => {
    logger.info('✅ HTTP server closed');

    // Close database connections (pg pool)
    // Note: pool is handled in a service layer; if you add graceful pool.end(),
    // do it here.

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
