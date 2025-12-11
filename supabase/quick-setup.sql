-- Quick Database Setup for OneNinja Multiplayer
-- Copy and paste this entire file into Supabase SQL Editor

-- 1. Create players table
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  display_name TEXT,
  total_games INTEGER DEFAULT 0,
  total_wins INTEGER DEFAULT 0,
  total_losses INTEGER DEFAULT 0,
  total_earnings DECIMAL(20, 9) DEFAULT 0,
  total_wagered DECIMAL(20, 9) DEFAULT 0,
  highest_score INTEGER DEFAULT 0,
  current_tier INTEGER DEFAULT 1,
  win_streak INTEGER DEFAULT 0,
  longest_win_streak INTEGER DEFAULT 0,
  rating DECIMAL(10, 2) DEFAULT 1000.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create multiplayer_games table
CREATE TABLE IF NOT EXISTS multiplayer_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT UNIQUE NOT NULL,
  bet_tier INTEGER NOT NULL CHECK (bet_tier BETWEEN 1 AND 4),
  bet_amount DECIMAL(20, 9) NOT NULL,
  pool_amount DECIMAL(20, 9) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('waiting', 'active', 'completed', 'cancelled', 'expired')),
  
  player1_address TEXT NOT NULL,
  player1_tx_hash TEXT,
  player1_score INTEGER,
  player1_events JSONB,
  player1_finished_at TIMESTAMP WITH TIME ZONE,
  
  player2_address TEXT,
  player2_tx_hash TEXT,
  player2_score INTEGER,
  player2_events JSONB,
  player2_finished_at TIMESTAMP WITH TIME ZONE,
  
  winner TEXT,
  loser TEXT,
  is_draw BOOLEAN DEFAULT FALSE,
  winner_payout DECIMAL(20, 9),
  platform_fee DECIMAL(20, 9),
  payout_tx_hash TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  server_validated BOOLEAN DEFAULT FALSE,
  validation_details JSONB,
  cancellation_reason TEXT
);

-- 3. Create indexes
CREATE INDEX IF NOT EXISTS idx_players_wallet ON players(wallet_address);
CREATE INDEX IF NOT EXISTS idx_games_game_id ON multiplayer_games(game_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON multiplayer_games(status);
CREATE INDEX IF NOT EXISTS idx_games_player1 ON multiplayer_games(player1_address);
CREATE INDEX IF NOT EXISTS idx_games_expires_at ON multiplayer_games(expires_at);

-- 4. Enable Row Level Security (optional for now, can be configured later)
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE multiplayer_games ENABLE ROW LEVEL SECURITY;

-- 5. Create permissive policies for development
CREATE POLICY "Allow all for players" ON players FOR ALL USING (true);
CREATE POLICY "Allow all for games" ON multiplayer_games FOR ALL USING (true);

-- Done! Your database is ready.
