# Aptos Ninja Backend (Node.js + npm)

## Setup

1. **Install dependencies**
```bash
cd backend
npm install
```

2. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

3. **Deploy Supabase schema** (if not done already)
- Go to Supabase Dashboard → SQL Editor
- Run the SQL from `../supabase/schema.sql`

4. **Start the server**
```bash
# Development mode (auto-restart)
npm run dev

# Production mode
npm start

# Run indexer only
npm run indexer
```

## What It Does

- ✅ **Blockchain Indexer**: Uses proper Aptos SDK to index events every 10 seconds
- ✅ **REST API**: Express server with game and player endpoints
- ✅ **Real-time**: Socket.IO + Supabase subscriptions for live updates
- ✅ **npm packages**: Full access to all npm packages (no Deno restrictions)

## API Endpoints

### Games
- `GET /api/games/available` - Get available games
- `GET /api/games/available?betTier=2` - Filter by bet tier
- `GET /api/games/player/:address` - Get player's games
- `GET /api/games/:gameId` - Get specific game
- `GET /api/games/history/all` - Get match history

### Players
- `GET /api/players/:address` - Get player stats
- `GET /api/players/leaderboard/top` - Get leaderboard

### Health
- `GET /health` - Health check

## Architecture

```
Frontend (React)
    ↓
Backend (Node.js + Express)
    ├─ REST API (games, players)
    ├─ Socket.IO (real-time)
    ├─ Blockchain Indexer (Aptos SDK)
    └─ Supabase Client
          ↓
    Supabase Database
    (PostgreSQL)
```

## Benefits over Deno Edge Function

✅ **Full npm support** - Use any npm package  
✅ **Real Aptos SDK** - No import issues  
✅ **Easier debugging** - Standard Node.js tools  
✅ **More control** - Custom server configuration  
✅ **Socket.IO** - Better real-time than just Supabase  
✅ **Development** - Hot reload with nodemon  

## Deployment

### Local
```bash
npm start
```

### Production (Railway, Heroku, Render, etc.)
```bash
# Set environment variables
# Deploy with: npm start
```

Server runs on port 5000 by default.
