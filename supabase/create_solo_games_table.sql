-- Create solo_games table for solo stakes game mode
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS solo_games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Player info
    player_address VARCHAR(66) NOT NULL,
    
    -- Stake info
    stake_amount DECIMAL(18, 8) DEFAULT 0,
    target_score INTEGER NOT NULL DEFAULT 100,
    
    -- Game state: 'pending', 'active', 'completed', 'forfeited'
    state VARCHAR(20) DEFAULT 'pending',
    
    -- Scores and results
    final_score INTEGER DEFAULT 0,
    won BOOLEAN DEFAULT false,
    
    -- Transaction hashes
    create_tx_hash VARCHAR(100),
    settle_tx_hash VARCHAR(100),
    
    -- Payout info
    payout_amount DECIMAL(18, 8) DEFAULT 0,
    payout_multiplier DECIMAL(5, 2) DEFAULT 1.0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Metadata
    game_duration_seconds INTEGER DEFAULT 60,
    lives_remaining INTEGER DEFAULT 3
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_solo_games_player ON solo_games(player_address);
CREATE INDEX IF NOT EXISTS idx_solo_games_state ON solo_games(state);
CREATE INDEX IF NOT EXISTS idx_solo_games_created_at ON solo_games(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_solo_games_completed_at ON solo_games(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_solo_games_final_score ON solo_games(final_score DESC);

-- Enable Row Level Security
ALTER TABLE solo_games ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Public read access for solo_games"
ON solo_games FOR SELECT
USING (true);

-- Allow inserts from authenticated or anon users
CREATE POLICY "Allow solo_games inserts"
ON solo_games FOR INSERT
WITH CHECK (true);

-- Allow updates from authenticated or anon users
CREATE POLICY "Allow solo_games updates"
ON solo_games FOR UPDATE
USING (true);

-- Comment on table
COMMENT ON TABLE solo_games IS 'Solo stakes game sessions where players bet on reaching a target score';
