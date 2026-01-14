-- One Ninja Phase 2: Multiplayer Room Support (2-4 players)
-- REQ-P2-004: Multiplayer Battle Mode
-- Migration: Add multiplayer_rooms and room_players tables

-- ============================================================================
-- NEW TABLE: multiplayer_rooms
-- Supports 2-4 player game rooms with shared fruit sequences
-- ============================================================================
CREATE TABLE IF NOT EXISTS multiplayer_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT UNIQUE NOT NULL, -- Short code for joining (e.g., "NINJA-1234")
  
  -- Room configuration
  max_players INTEGER NOT NULL CHECK (max_players BETWEEN 2 AND 4) DEFAULT 2,
  min_players INTEGER NOT NULL CHECK (min_players >= 2) DEFAULT 2,
  bet_tier INTEGER NOT NULL CHECK (bet_tier BETWEEN 1 AND 4),
  bet_amount DECIMAL(20, 9) NOT NULL,
  
  -- Room state
  status TEXT NOT NULL CHECK (status IN ('waiting', 'countdown', 'active', 'completed', 'cancelled', 'expired')) DEFAULT 'waiting',
  current_player_count INTEGER DEFAULT 0,
  
  -- Game synchronization
  game_seed TEXT, -- Seed for deterministic fruit sequence generation
  game_duration INTEGER DEFAULT 90, -- Game duration in seconds
  
  -- Pool & Payouts
  total_pool DECIMAL(20, 9) DEFAULT 0,
  platform_fee_percent DECIMAL(5, 2) DEFAULT 2.0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  countdown_started_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Creator
  created_by TEXT NOT NULL REFERENCES players(wallet_address) ON DELETE CASCADE,
  
  -- Results
  winner_address TEXT,
  winner_payout DECIMAL(20, 9),
  payout_tx_hash TEXT,
  
  -- Metadata
  validation_details JSONB,
  cancellation_reason TEXT
);

-- ============================================================================
-- NEW TABLE: room_players
-- Track each player in a room with their state and scores
-- ============================================================================
CREATE TABLE IF NOT EXISTS room_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES multiplayer_rooms(id) ON DELETE CASCADE,
  player_address TEXT NOT NULL REFERENCES players(wallet_address) ON DELETE CASCADE,
  
  -- Join info
  join_order INTEGER NOT NULL, -- 1, 2, 3, or 4 (order of joining)
  tx_hash TEXT NOT NULL, -- Transaction hash for their bet
  
  -- Player state
  status TEXT NOT NULL CHECK (status IN ('joined', 'ready', 'playing', 'finished', 'disconnected')) DEFAULT 'joined',
  is_ready BOOLEAN DEFAULT FALSE,
  
  -- Game stats
  score INTEGER DEFAULT 0,
  lives INTEGER DEFAULT 3,
  
  -- Super fruit contribution tracking
  total_hits INTEGER DEFAULT 0,
  super_fruit_hits INTEGER DEFAULT 0,
  contribution_score INTEGER DEFAULT 0, -- Score from contribution bonuses
  
  -- Timing
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ready_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE,
  
  -- Results
  final_rank INTEGER, -- 1st, 2nd, 3rd, 4th
  payout DECIMAL(20, 9) DEFAULT 0,
  
  -- Events log
  events JSONB DEFAULT '[]'::jsonb,
  
  -- Unique constraint: one player per room
  UNIQUE(room_id, player_address)
);

-- ============================================================================
-- NEW TABLE: super_fruit_hits
-- Track individual hits on super fruits for contribution scoring (REQ-P2-005)
-- ============================================================================
CREATE TABLE IF NOT EXISTS super_fruit_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES multiplayer_rooms(id) ON DELETE CASCADE,
  fruit_id TEXT NOT NULL, -- Unique ID of the super fruit instance
  
  -- Hit info
  player_address TEXT NOT NULL REFERENCES players(wallet_address) ON DELETE CASCADE,
  hit_number INTEGER NOT NULL, -- 1st hit, 2nd hit, etc.
  damage INTEGER DEFAULT 1,
  
  -- Super fruit info
  fruit_type TEXT NOT NULL, -- Dragon Fruit, Mango, etc.
  fruit_max_hp INTEGER NOT NULL,
  
  -- Scoring
  points_awarded INTEGER NOT NULL,
  is_final_hit BOOLEAN DEFAULT FALSE, -- Did this hit destroy the fruit?
  
  -- Timing
  hit_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Index for quick lookups per fruit
  UNIQUE(room_id, fruit_id, hit_number)
);

-- ============================================================================
-- INDEXES for performance
-- ============================================================================

-- multiplayer_rooms indexes
CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON multiplayer_rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON multiplayer_rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_bet_tier ON multiplayer_rooms(bet_tier);
CREATE INDEX IF NOT EXISTS idx_rooms_created_by ON multiplayer_rooms(created_by);
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON multiplayer_rooms(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rooms_waiting_tier ON multiplayer_rooms(status, bet_tier) WHERE status = 'waiting';

-- room_players indexes
CREATE INDEX IF NOT EXISTS idx_room_players_room ON room_players(room_id);
CREATE INDEX IF NOT EXISTS idx_room_players_player ON room_players(player_address);
CREATE INDEX IF NOT EXISTS idx_room_players_status ON room_players(status);
CREATE INDEX IF NOT EXISTS idx_room_players_score ON room_players(score DESC);

-- super_fruit_hits indexes
CREATE INDEX IF NOT EXISTS idx_super_hits_room ON super_fruit_hits(room_id);
CREATE INDEX IF NOT EXISTS idx_super_hits_fruit ON super_fruit_hits(room_id, fruit_id);
CREATE INDEX IF NOT EXISTS idx_super_hits_player ON super_fruit_hits(player_address);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE multiplayer_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_fruit_hits ENABLE ROW LEVEL SECURITY;

-- Policies for multiplayer_rooms
CREATE POLICY rooms_select_policy ON multiplayer_rooms
  FOR SELECT USING (true); -- Anyone can view rooms

CREATE POLICY rooms_insert_policy ON multiplayer_rooms
  FOR INSERT WITH CHECK (true); -- Backend handles insertion

CREATE POLICY rooms_update_policy ON multiplayer_rooms
  FOR UPDATE USING (true); -- Backend handles updates

-- Policies for room_players
CREATE POLICY room_players_select_policy ON room_players
  FOR SELECT USING (true); -- Anyone can view players in rooms

CREATE POLICY room_players_insert_policy ON room_players
  FOR INSERT WITH CHECK (true); -- Backend handles insertion

CREATE POLICY room_players_update_policy ON room_players
  FOR UPDATE USING (true); -- Backend handles updates

-- Policies for super_fruit_hits  
CREATE POLICY super_hits_select_policy ON super_fruit_hits
  FOR SELECT USING (true);

CREATE POLICY super_hits_insert_policy ON super_fruit_hits
  FOR INSERT WITH CHECK (true);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Generate unique room code
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS TEXT AS $$
DECLARE
  code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate format: XXXX-1234
    code := 'ROOM-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM multiplayer_rooms WHERE room_code = code) INTO code_exists;
    
    -- Exit loop if code is unique
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Function to update room player count
CREATE OR REPLACE FUNCTION update_room_player_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE multiplayer_rooms 
    SET current_player_count = current_player_count + 1
    WHERE id = NEW.room_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE multiplayer_rooms 
    SET current_player_count = current_player_count - 1
    WHERE id = OLD.room_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update player count
CREATE TRIGGER room_player_count_trigger
AFTER INSERT OR DELETE ON room_players
FOR EACH ROW EXECUTE FUNCTION update_room_player_count();

-- ============================================================================
-- VIEW: Room Leaderboard (for active room ranking)
-- ============================================================================
CREATE OR REPLACE VIEW room_leaderboard AS
SELECT 
  rp.room_id,
  rp.player_address,
  p.display_name,
  rp.score,
  rp.lives,
  rp.total_hits,
  rp.super_fruit_hits,
  rp.contribution_score,
  rp.status,
  rp.join_order,
  RANK() OVER (PARTITION BY rp.room_id ORDER BY rp.score DESC, rp.lives DESC) as current_rank
FROM room_players rp
JOIN players p ON rp.player_address = p.wallet_address
ORDER BY rp.room_id, rp.score DESC;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE multiplayer_rooms IS 'REQ-P2-004: Multi-player game rooms supporting 2-4 players';
COMMENT ON TABLE room_players IS 'REQ-P2-004: Individual player state within multiplayer rooms';
COMMENT ON TABLE super_fruit_hits IS 'REQ-P2-005: Track hits on super fruits for contribution-based scoring';
COMMENT ON COLUMN multiplayer_rooms.game_seed IS 'Seed for deterministic RNG - ensures all players see same fruit sequence';
COMMENT ON COLUMN room_players.contribution_score IS 'REQ-P2-005: Additional score from contribution bonuses on super fruits';
