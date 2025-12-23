-- Migration: Add lives tracking and game timer fields
-- New multiplayer flow: Instant win when opponent loses all lives, 60-second max duration

-- Add lives tracking columns
ALTER TABLE multiplayer_games
ADD COLUMN IF NOT EXISTS player1_lives INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS player2_lives INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS end_reason TEXT CHECK (end_reason IN ('life_loss', 'timeout', 'score', 'cancelled'));

-- Update existing rows to have default lives
UPDATE multiplayer_games
SET player1_lives = 3, player2_lives = 3
WHERE player1_lives IS NULL OR player2_lives IS NULL;

-- Add comment to document the new fields
COMMENT ON COLUMN multiplayer_games.player1_lives IS 'Player 1 remaining lives (starts at 3)';
COMMENT ON COLUMN multiplayer_games.player2_lives IS 'Player 2 remaining lives (starts at 3)';
COMMENT ON COLUMN multiplayer_games.end_reason IS 'How the game ended: life_loss (player hit 0 lives), timeout (60s expired), score (both finished), cancelled';

-- Create index for faster queries on active games
CREATE INDEX IF NOT EXISTS idx_multiplayer_games_status_lives
ON multiplayer_games(status, player1_lives, player2_lives)
WHERE status = 'active';
