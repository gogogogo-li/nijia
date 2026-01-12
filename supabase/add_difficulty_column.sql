-- Add missing difficulty column to solo_games table
-- Run this in Supabase SQL Editor

ALTER TABLE solo_games 
ADD COLUMN IF NOT EXISTS difficulty INTEGER DEFAULT 0;

-- Add comment for the column
COMMENT ON COLUMN solo_games.difficulty IS '0 = Easy, 1 = Medium, 2 = Hard';

-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'solo_games' AND column_name = 'difficulty';
