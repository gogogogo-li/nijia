-- Migration: Add join_transaction_hash column to multiplayer_games table
-- This column tracks the blockchain transaction hash when player 2 joins the game

ALTER TABLE multiplayer_games
ADD COLUMN IF NOT EXISTS join_transaction_hash TEXT;

-- Add comment for documentation
COMMENT ON COLUMN multiplayer_games.join_transaction_hash IS 'Blockchain transaction hash for player 2 joining (same as player2_tx_hash)';
