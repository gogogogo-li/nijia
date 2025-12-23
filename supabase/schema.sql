-- OneNinja Multiplayer Database Schema
-- This schema supports secure backend-driven multiplayer gaming with bet pools

-- Players table
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  display_name TEXT,
  total_games INTEGER DEFAULT 0,
  total_wins INTEGER DEFAULT 0,
  total_losses INTEGER DEFAULT 0,
  total_earnings DECIMAL(20, 9) DEFAULT 0,
  total_wagered DECIMAL(20, 9) DEFAULT 0,
  highest_score INTEGER DEFAULT 0,
  current_tier INTEGER DEFAULT 1,
  win_streak INTEGER DEFAULT 0,
  longest_win_streak INTEGER DEFAULT 0,
  rating DECIMAL(10, 2) DEFAULT 1000.0, -- ELO-style rating
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Multiplayer games table
CREATE TABLE IF NOT EXISTS multiplayer_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT UNIQUE NOT NULL,
  bet_tier INTEGER NOT NULL CHECK (bet_tier BETWEEN 1 AND 4),
  bet_amount DECIMAL(20, 9) NOT NULL,
  pool_amount DECIMAL(20, 9) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('waiting', 'active', 'completed', 'cancelled', 'expired')),
  
  -- Player 1 (creator)
  player1_address TEXT NOT NULL REFERENCES players(wallet_address) ON DELETE CASCADE,
  player1_tx_hash TEXT NOT NULL,
  player1_score INTEGER,
  player1_events JSONB,
  player1_finished_at TIMESTAMP WITH TIME ZONE,
  
  -- Player 2 (joiner)
  player2_address TEXT REFERENCES players(wallet_address) ON DELETE CASCADE,
  player2_tx_hash TEXT,
  join_transaction_hash TEXT,
  player2_score INTEGER,
  player2_events JSONB,
  player2_finished_at TIMESTAMP WITH TIME ZONE,
  
  -- Game results
  winner TEXT,
  loser TEXT,
  is_draw BOOLEAN DEFAULT FALSE,
  winner_payout DECIMAL(20, 9),
  platform_fee DECIMAL(20, 9),
  payout_tx_hash TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Metadata
  server_validated BOOLEAN DEFAULT FALSE,
  validation_details JSONB,
  cancellation_reason TEXT
);

-- Game events log (for audit and validation)
CREATE TABLE IF NOT EXISTS game_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT NOT NULL REFERENCES multiplayer_games(game_id) ON DELETE CASCADE,
  player_address TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'joined', 'started', 'score_submitted', 'completed', 'cancelled')),
  event_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transaction records
CREATE TABLE IF NOT EXISTS game_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT NOT NULL REFERENCES multiplayer_games(game_id) ON DELETE CASCADE,
  player_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  tx_type TEXT NOT NULL CHECK (tx_type IN ('bet', 'payout', 'refund')),
  amount DECIMAL(20, 9) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed')),
  block_height BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  confirmed_at TIMESTAMP WITH TIME ZONE
);

-- Leaderboard view (for quick queries)
CREATE OR REPLACE VIEW multiplayer_leaderboard AS
SELECT 
  p.wallet_address,
  p.display_name,
  p.total_games,
  p.total_wins,
  p.total_losses,
  p.total_earnings,
  p.total_wagered,
  p.highest_score,
  p.win_streak,
  p.rating,
  CASE 
    WHEN p.total_games > 0 THEN ROUND((p.total_wins::DECIMAL / p.total_games::DECIMAL) * 100, 2)
    ELSE 0
  END AS win_rate,
  p.last_active
FROM players p
ORDER BY p.rating DESC, p.total_earnings DESC;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_players_wallet ON players(wallet_address);
CREATE INDEX IF NOT EXISTS idx_players_rating ON players(rating DESC);
CREATE INDEX IF NOT EXISTS idx_players_earnings ON players(total_earnings DESC);
CREATE INDEX IF NOT EXISTS idx_players_last_active ON players(last_active DESC);

CREATE INDEX IF NOT EXISTS idx_games_game_id ON multiplayer_games(game_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON multiplayer_games(status);
CREATE INDEX IF NOT EXISTS idx_games_player1 ON multiplayer_games(player1_address);
CREATE INDEX IF NOT EXISTS idx_games_player2 ON multiplayer_games(player2_address);
CREATE INDEX IF NOT EXISTS idx_games_bet_tier ON multiplayer_games(bet_tier);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON multiplayer_games(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_expires_at ON multiplayer_games(expires_at);
CREATE INDEX IF NOT EXISTS idx_games_status_tier ON multiplayer_games(status, bet_tier);

CREATE INDEX IF NOT EXISTS idx_events_game_id ON game_events(game_id);
CREATE INDEX IF NOT EXISTS idx_events_player ON game_events(player_address);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON game_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_game_id ON game_transactions(game_id);
CREATE INDEX IF NOT EXISTS idx_transactions_player ON game_transactions(player_address);
CREATE INDEX IF NOT EXISTS idx_transactions_tx_hash ON game_transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON game_transactions(status);

-- Trigger to update player stats when game completes
CREATE OR REPLACE FUNCTION update_player_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Update player 1 stats
    UPDATE players
    SET 
      total_games = total_games + 1,
      total_wins = CASE WHEN NEW.winner = NEW.player1_address THEN total_wins + 1 ELSE total_wins END,
      total_losses = CASE WHEN NEW.loser = NEW.player1_address THEN total_losses + 1 ELSE total_losses END,
      total_earnings = CASE 
        WHEN NEW.winner = NEW.player1_address THEN total_earnings + COALESCE(NEW.winner_payout, 0)
        ELSE total_earnings - NEW.bet_amount
      END,
      total_wagered = total_wagered + NEW.bet_amount,
      highest_score = GREATEST(highest_score, COALESCE(NEW.player1_score, 0)),
      win_streak = CASE 
        WHEN NEW.winner = NEW.player1_address THEN win_streak + 1
        ELSE 0
      END,
      longest_win_streak = CASE
        WHEN NEW.winner = NEW.player1_address THEN GREATEST(longest_win_streak, win_streak + 1)
        ELSE longest_win_streak
      END,
      updated_at = NOW(),
      last_active = NOW()
    WHERE wallet_address = NEW.player1_address;
    
    -- Update player 2 stats
    IF NEW.player2_address IS NOT NULL THEN
      UPDATE players
      SET 
        total_games = total_games + 1,
        total_wins = CASE WHEN NEW.winner = NEW.player2_address THEN total_wins + 1 ELSE total_wins END,
        total_losses = CASE WHEN NEW.loser = NEW.player2_address THEN total_losses + 1 ELSE total_losses END,
        total_earnings = CASE 
          WHEN NEW.winner = NEW.player2_address THEN total_earnings + COALESCE(NEW.winner_payout, 0)
          ELSE total_earnings - NEW.bet_amount
        END,
        total_wagered = total_wagered + NEW.bet_amount,
        highest_score = GREATEST(highest_score, COALESCE(NEW.player2_score, 0)),
        win_streak = CASE 
          WHEN NEW.winner = NEW.player2_address THEN win_streak + 1
          ELSE 0
        END,
        longest_win_streak = CASE
          WHEN NEW.winner = NEW.player2_address THEN GREATEST(longest_win_streak, win_streak + 1)
          ELSE longest_win_streak
        END,
        updated_at = NOW(),
        last_active = NOW()
      WHERE wallet_address = NEW.player2_address;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_player_stats
AFTER UPDATE ON multiplayer_games
FOR EACH ROW
EXECUTE FUNCTION update_player_stats();

-- Trigger to automatically insert players
CREATE OR REPLACE FUNCTION ensure_player_exists()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert player1 if not exists
  INSERT INTO players (wallet_address)
  VALUES (NEW.player1_address)
  ON CONFLICT (wallet_address) DO UPDATE
  SET last_active = NOW();
  
  -- Insert player2 if not exists
  IF NEW.player2_address IS NOT NULL THEN
    INSERT INTO players (wallet_address)
    VALUES (NEW.player2_address)
    ON CONFLICT (wallet_address) DO UPDATE
    SET last_active = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ensure_player_exists
BEFORE INSERT OR UPDATE ON multiplayer_games
FOR EACH ROW
EXECUTE FUNCTION ensure_player_exists();

-- Function to clean up expired games
CREATE OR REPLACE FUNCTION cleanup_expired_games()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE multiplayer_games
  SET 
    status = 'expired',
    cancellation_reason = 'Game expired - no opponent joined or game not completed in time'
  WHERE 
    status IN ('waiting', 'active')
    AND expires_at < NOW();
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Row Level Security (RLS) policies
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE multiplayer_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_transactions ENABLE ROW LEVEL SECURITY;

-- Public read access for leaderboard
CREATE POLICY "Public players read" ON players FOR SELECT USING (true);

-- Players can update their own profile
CREATE POLICY "Players update own profile" ON players FOR UPDATE
USING (wallet_address = current_setting('app.current_user', true));

-- Public read for completed games
CREATE POLICY "Public games read" ON multiplayer_games FOR SELECT
USING (status IN ('completed', 'cancelled', 'expired') OR player1_address = current_setting('app.current_user', true) OR player2_address = current_setting('app.current_user', true));

-- Server can do anything (backend uses service role)
-- Players can only read their own events
CREATE POLICY "Players read own events" ON game_events FOR SELECT
USING (player_address = current_setting('app.current_user', true));

CREATE POLICY "Players read own transactions" ON game_transactions FOR SELECT
USING (player_address = current_setting('app.current_user', true));

-- Comments for documentation
COMMENT ON TABLE players IS 'Player profiles and statistics for multiplayer games';
COMMENT ON TABLE multiplayer_games IS 'Multiplayer game instances with bet pools and results';
COMMENT ON TABLE game_events IS 'Audit log of all game-related events';
COMMENT ON TABLE game_transactions IS 'Blockchain transaction records for bets and payouts';
COMMENT ON COLUMN multiplayer_games.server_validated IS 'Whether backend validated the game scores from events';
COMMENT ON COLUMN multiplayer_games.validation_details IS 'Details about score validation (anti-cheat)';
