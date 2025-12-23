-- Migration to add missing columns required by the backend code
-- Backend uses: player2, state, player2_tx_hash, player1_lives, player2_lives, end_reason

DO $$ 
BEGIN
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

    -- Add player2_tx_hash if not exists (backend uses this, not join_transaction_hash)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='multiplayer_games' AND column_name='player2_tx_hash') THEN
        ALTER TABLE multiplayer_games ADD COLUMN player2_tx_hash TEXT;
    END IF;

    -- Add end_reason if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='multiplayer_games' AND column_name='end_reason') THEN
        ALTER TABLE multiplayer_games ADD COLUMN end_reason TEXT;
    END IF;

    -- Ensure winner_payout exists (rename winnings if needed)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='multiplayer_games' AND column_name='winner_payout') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='multiplayer_games' AND column_name='winnings') THEN
            ALTER TABLE multiplayer_games RENAME COLUMN winnings TO winner_payout;
        END IF;
    END IF;
END $$;

-- Update existing rows to have default lives
UPDATE multiplayer_games
SET player1_lives = 3
WHERE player1_lives IS NULL;

UPDATE multiplayer_games
SET player2_lives = 3
WHERE player2_lives IS NULL;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_multiplayer_games_status_lives
ON multiplayer_games(status, player1_lives, player2_lives)
WHERE status IN ('waiting', 'active');

-- Show updated schema
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'multiplayer_games'
ORDER BY ordinal_position;
