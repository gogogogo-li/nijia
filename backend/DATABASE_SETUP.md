# Database Setup Guide

## Quick Setup

The multiplayer system works **without a database** (uses in-memory cache), but for production and persistence, you should set up Supabase.

## Current Status

✅ Backend works without database (memory cache fallback)
✅ Games are created and managed in memory
⚠️ Data is lost on server restart (no persistence)

## To Enable Database Persistence

### 1. Create Supabase Project
- Go to https://supabase.com
- Create a new project
- Copy your project URL and keys

### 2. Update `.env` file

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### 3. Run Schema

Open Supabase SQL Editor and run the contents of:
```
../supabase/schema.sql
```

This creates:
- `players` table (stats, earnings)
- `multiplayer_games` table (game state)
- `game_events` table (audit log)
- `game_transactions` table (blockchain records)

### 4. Restart Backend

```bash
node server.js
```

You should see:
```
✅ Subscribed to multiplayer_games changes
✅ Subscribed to players changes
```

## Testing Without Database

The system works fine without Supabase! Features that work:

✅ Create multiplayer games
✅ Join games
✅ Real-time updates via Socket.IO
✅ Score validation
✅ Winner determination

Features that require database:

⏳ Persistent game history
⏳ Player statistics across sessions
⏳ Leaderboards
⏳ Transaction records

## Troubleshooting

If you see database errors in logs but games still work - **that's normal!** The system uses a fallback cache.

To verify cache is working:
1. Create a game
2. Check logs for: `Game created: [id] by [address]`
3. List available games - it should appear
