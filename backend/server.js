import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import gamesRouter from './routes/games.js';
import playersRouter from './routes/players.js';
import BlockchainIndexer from './services/blockchainIndexer.js';
import { supabase } from './config/supabase.js';

dotenv.config();

const app = express();

// Parse multiple origins from environment variable
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Make io accessible globally for routes
global.io = io;

// Routes
app.use('/api/games', gamesRouter);
app.use('/api/players', playersRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'Aptos Ninja Backend',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      games: '/api/games',
      players: '/api/players',
      health: '/health'
    }
  });
});

// Socket.IO for real-time updates
io.on('connection', (socket) => {
  console.log('👤 Client connected:', socket.id);

  socket.on('subscribe:games', (betTier) => {
    const room = betTier ? `games:${betTier}` : 'games:all';
    socket.join(room);
    console.log(`📺 Client ${socket.id} subscribed to ${room}`);
  });

  socket.on('subscribe:player', (address) => {
    socket.join(`player:${address}`);
    console.log(`📺 Client ${socket.id} subscribed to player ${address}`);
  });

  socket.on('disconnect', () => {
    console.log('👋 Client disconnected:', socket.id);
  });
});

// Subscribe to Supabase real-time changes
const gamesChannel = supabase
  .channel('games-changes')
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'games' },
    (payload) => {
      console.log('📡 Game update:', payload.eventType, payload.new?.game_id);
      
      // Broadcast to all clients in the appropriate rooms
      io.to('games:all').emit('game:update', payload);
      
      if (payload.new?.bet_tier) {
        io.to(`games:${payload.new.bet_tier}`).emit('game:update', payload);
      }
    }
  )
  .subscribe();

const playersChannel = supabase
  .channel('players-changes')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'players' },
    (payload) => {
      console.log('📡 Player update:', payload.new?.address);
      
      if (payload.new?.address) {
        io.to(`player:${payload.new.address}`).emit('player:update', payload);
      }
    }
  )
  .subscribe();

// Start blockchain indexer
const indexer = new BlockchainIndexer();
indexer.start();

// Start server
httpServer.listen(PORT, () => {
  console.log('');
  console.log('🚀 Aptos Ninja Backend Server');
  console.log('================================');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌐 API: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: http://localhost:${PORT}`);
  console.log(`🎯 Frontend: ${process.env.FRONTEND_URL}`);
  console.log(`🔗 Contract: ${process.env.CONTRACT_ADDRESS}`);
  console.log('================================');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
