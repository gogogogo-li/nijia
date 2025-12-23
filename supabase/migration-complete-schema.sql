-- Complete Migration to Fix All Missing Columns for Multiplayer
-- Adds: join_code, room_type, state, player2, forfeit_by, and ensures all backend-required columns exist

DO $$ 
BEGIN
    -- Add join_code column for private rooms
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='multiplayer_games' AND column_name='join_code') THEN
        ALTER TABLE multiplayer_games ADD COLUMN join_code TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_games_join_code ON multiplayer_games(join_code) WHERE join_code IS NOT NULL;
    END IF;

    -- Add room_type column (public/private)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='multiplayer_games' AND column_name='room_type') THEN
        ALTER TABLE multiplayer_games ADD COLUMN room_type TEXT DEFAULT 'public' CHECK (room_type IN ('public', 'private'));
    END IF;

    -- Add state column (backend uses this instead of status in some places)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='multiplayer_games' AND column_name='state') THEN
        ALTER TABLE multiplayer_games ADD COLUMN state TEXT CHECK (state IN ('waiting', 'countdown', 'in_progress', 'finalizing', 'completed', 'cancelled'));
        -- Copy status to state for existing rows
        UPDATE multiplayer_games SET state = status WHERE state IS NULL;
    END IF;

    -- Add player2 column (alias for player2_address for backend compatibility)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='multiplayer_games' AND column_name='player2') THEN
        ALTER TABLE multiplayer_games ADD COLUMN player2 TEXT;
        -- Copy player2_address to player2 for existing rows
        UPDATE multiplayer_games SET player2 = player2_address WHERE player2 IS NULL;
    END IF;

    -- Add player1_lives if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='multiplayer_games' AND column_name='player1_lives') THEN
        ALTER TABLE multiplayer_games ADD COLUMN player1_lives INTEGER DEFAULT 3;
    END IF;

    -- Add player2_lives if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='multiplayer_games' AND column_name='player2_lives') THEN
        ALTER TABLE multiplayer_games ADD COLUMN player2_lives INTEGER DEFAULT 3;
    END IF;

    -- Add player2_tx_hash if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='multiplayer_games' AND column_name='player2_tx_hash') THEN
        ALTER TABLE multiplayer_games ADD COLUMN player2_tx_hash TEXT;
    END IF;

    -- Add end_reason if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='multiplayer_games' AND column_name='end_reason') THEN
        ALTER TABLE multiplayer_games ADD COLUMN end_reason TEXT;
    END IF;

    -- Add forfeit_by column to track who forfeited
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='multiplayer_games' AND column_name='forfeit_by') THEN
        ALTER TABLE multiplayer_games ADD COLUMN forfeit_by TEXT;
    END IF;

    -- Add countdown_start_at for client sync
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='multiplayer_games' AND column_name='countdown_start_at') THEN
        ALTER TABLE multiplayer_games ADD COLUMN countdown_start_at BIGINT;
    END IF;

    -- Add game_start_at for client sync
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='multiplayer_games' AND column_name='game_start_at') THEN
        ALTER TABLE multiplayer_games ADD COLUMN game_start_at BIGINT;
    END IF;

    -- Ensure winner_payout exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='multiplayer_games' AND column_name='winner_payout') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='multiplayer_games' AND column_name='winnings') THEN
            ALTER TABLE multiplayer_games RENAME COLUMN winnings TO winner_payout;
        ELSE
            ALTER TABLE multiplayer_games ADD COLUMN winner_payout DECIMAL(20, 9);
        END IF;
    END IF;
END $$;

-- Update existing rows to have default values
UPDATE multiplayer_games
SET player1_lives = 3
WHERE player1_lives IS NULL;

UPDATE multiplayer_games
SET player2_lives = 3
WHERE player2_lives IS NULL;

UPDATE multiplayer_games
SET room_type = 'public'
WHERE room_type IS NULL;

UPDATE multiplayer_games
SET state = status
WHERE state IS NULL;

UPDATE multiplayer_games
SET player2 = player2_address
WHERE player2 IS NULL AND player2_address IS NOT NULL;

-- Add useful indexes
CREATE INDEX IF NOT EXISTS idx_games_room_type ON multiplayer_games(room_type);
CREATE INDEX IF NOT EXISTS idx_games_state ON multiplayer_games(state);
CREATE INDEX IF NOT EXISTS idx_games_state_tier ON multiplayer_games(state, bet_tier) WHERE state = 'waiting';

-- Show final schema for verification
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'multiplayer_games'
ORDER BY ordinal_position;
