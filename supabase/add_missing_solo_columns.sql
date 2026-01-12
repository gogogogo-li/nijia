-- Add ALL missing columns to solo_games table
-- Run this in Supabase SQL Editor

-- Core columns
ALTER TABLE solo_games ADD COLUMN IF NOT EXISTS game_id INTEGER;
ALTER TABLE solo_games ADD COLUMN IF NOT EXISTS difficulty INTEGER DEFAULT 0;

-- Transaction columns  
ALTER TABLE solo_games ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(100);
ALTER TABLE solo_games ADD COLUMN IF NOT EXISTS settlement_tx VARCHAR(100);

-- Payout column
ALTER TABLE solo_games ADD COLUMN IF NOT EXISTS payout DECIMAL(18,8) DEFAULT 0;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_solo_games_game_id ON solo_games(game_id);

-- Verify all columns exist now
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'solo_games' 
ORDER BY ordinal_position;
