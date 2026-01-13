-- Chat Messages Table
-- Stores lobby chat messages with history

-- Create the chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_address VARCHAR(66) NOT NULL,
  sender_name VARCHAR(50),
  message TEXT NOT NULL,
  chat_type VARCHAR(20) NOT NULL DEFAULT 'lobby', -- 'lobby' or 'game'
  game_id BIGINT, -- NULL for lobby messages, game_id for game-specific chat
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lobby message queries (most recent first)
CREATE INDEX IF NOT EXISTS idx_chat_lobby_time 
ON chat_messages(created_at DESC) 
WHERE chat_type = 'lobby';

-- Index for game-specific messages
CREATE INDEX IF NOT EXISTS idx_chat_game 
ON chat_messages(game_id, created_at DESC) 
WHERE game_id IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read chat messages
CREATE POLICY "Anyone can read chat messages"
ON chat_messages FOR SELECT
USING (true);

-- Policy: Authenticated users can insert their own messages
CREATE POLICY "Users can insert chat messages"
ON chat_messages FOR INSERT
WITH CHECK (true);

-- Auto-cleanup: Delete messages older than 24 hours (optional)
-- Uncomment if you want automatic cleanup
-- CREATE OR REPLACE FUNCTION cleanup_old_chat_messages()
-- RETURNS void AS $$
-- BEGIN
--   DELETE FROM chat_messages 
--   WHERE created_at < NOW() - INTERVAL '24 hours';
-- END;
-- $$ LANGUAGE plpgsql;
