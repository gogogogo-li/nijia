-- Matchmaking Queue Table for Quick Match Feature
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS matchmaking_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_address VARCHAR(66) NOT NULL,
  bet_tier INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'waiting',
  tx_hash VARCHAR(100),
  game_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  matched_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes'),
  
  -- Ensure one player can only be in queue once
  CONSTRAINT unique_player_in_queue UNIQUE (player_address)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_queue_status_tier ON matchmaking_queue(status, bet_tier);
CREATE INDEX IF NOT EXISTS idx_queue_expires ON matchmaking_queue(expires_at);

-- Enable Row Level Security
ALTER TABLE matchmaking_queue ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Public read access for matchmaking_queue"
ON matchmaking_queue FOR SELECT
USING (true);

-- Allow inserts
CREATE POLICY "Allow matchmaking_queue inserts"
ON matchmaking_queue FOR INSERT
WITH CHECK (true);

-- Allow updates
CREATE POLICY "Allow matchmaking_queue updates"
ON matchmaking_queue FOR UPDATE
USING (true);

-- Allow deletes
CREATE POLICY "Allow matchmaking_queue deletes"
ON matchmaking_queue FOR DELETE
USING (true);

-- Auto-cleanup function to remove expired entries
CREATE OR REPLACE FUNCTION cleanup_expired_queue_entries()
RETURNS void AS $$
BEGIN
  DELETE FROM matchmaking_queue 
  WHERE expires_at < NOW() AND status = 'waiting';
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE matchmaking_queue IS 'Queue for Quick Match matchmaking - pairs players by stake tier';
