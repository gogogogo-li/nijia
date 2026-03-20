-- Add Telegram login support to players table
ALTER TABLE players ADD COLUMN IF NOT EXISTS telegram_user_id TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'wallet';
ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_players_telegram_user_id
  ON players(telegram_user_id) WHERE telegram_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_players_auth_provider ON players(auth_provider);
