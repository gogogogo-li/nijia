-- =============================================================================
-- OneNinja — consolidated PostgreSQL schema (greenfield / new database)
-- =============================================================================
-- Merges former supabase/*.sql pieces into one baseline:
--   - Core tables + RLS + triggers (players, multiplayer_games, events, txs, solo)
--   - Multiplayer rooms (2–4), super fruit hits, room leaderboard view
--   - Matchmaking queue + chat messages
--   - Time-based leaderboard views + solo_leaderboard
--
-- Requirements: PostgreSQL 13+ (gen_random_uuid in core). For PG 12, add:
--   CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--
-- Apply once (e.g.):
--   psql "$DATABASE_URL" -f postgres/schema.sql
--
-- Optional data cleanup (NOT included): see supabase/cleanup-old-games.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Core: players
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  display_name TEXT,
  telegram_user_id TEXT,
  auth_provider TEXT DEFAULT 'wallet',
  avatar_url TEXT,
  total_games INTEGER DEFAULT 0,
  total_wins INTEGER DEFAULT 0,
  total_losses INTEGER DEFAULT 0,
  total_earnings DECIMAL(20, 9) DEFAULT 0,
  total_wagered DECIMAL(20, 9) DEFAULT 0,
  highest_score INTEGER DEFAULT 0,
  current_tier INTEGER DEFAULT 1,
  win_streak INTEGER DEFAULT 0,
  longest_win_streak INTEGER DEFAULT 0,
  rating DECIMAL(10, 2) DEFAULT 1000.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_active TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2. Core: multiplayer_games (full column set from legacy migrations)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS multiplayer_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT UNIQUE NOT NULL,
  bet_tier INTEGER NOT NULL CHECK (bet_tier BETWEEN 1 AND 4),
  bet_amount DECIMAL(20, 9) NOT NULL,
  pool_amount DECIMAL(20, 9) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('waiting', 'active', 'completed', 'cancelled', 'expired')),
  state TEXT DEFAULT 'waiting' CHECK (state IN ('waiting', 'countdown', 'in_progress', 'finalizing', 'completed', 'cancelled')),
  room_type TEXT DEFAULT 'public' CHECK (room_type IN ('public', 'private')),
  join_code TEXT,

  player1_address TEXT NOT NULL REFERENCES players(wallet_address) ON DELETE CASCADE,
  player1_tx_hash TEXT NOT NULL,
  player1_score INTEGER,
  player1_events JSONB,
  player1_finished_at TIMESTAMPTZ,
  player1_lives INTEGER DEFAULT 3,

  player2_address TEXT REFERENCES players(wallet_address) ON DELETE CASCADE,
  player2 TEXT,
  player2_tx_hash TEXT,
  join_transaction_hash TEXT,
  player2_score INTEGER,
  player2_events JSONB,
  player2_finished_at TIMESTAMPTZ,
  player2_lives INTEGER DEFAULT 3,

  winner TEXT,
  loser TEXT,
  is_draw BOOLEAN DEFAULT FALSE,
  winner_payout DECIMAL(20, 9),
  platform_fee DECIMAL(20, 9),
  payout_tx_hash TEXT,

  end_reason TEXT CHECK (end_reason IN ('life_loss', 'timeout', 'score', 'cancelled')),
  forfeit_by TEXT,
  countdown_start_at BIGINT,
  game_start_at BIGINT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,

  server_validated BOOLEAN DEFAULT FALSE,
  validation_details JSONB,
  cancellation_reason TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_games_join_code ON multiplayer_games(join_code) WHERE join_code IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. Core: game_events, game_transactions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT NOT NULL REFERENCES multiplayer_games(game_id) ON DELETE CASCADE,
  player_address TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'joined', 'started', 'score_submitted', 'completed', 'cancelled')),
  event_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT NOT NULL REFERENCES multiplayer_games(game_id) ON DELETE CASCADE,
  player_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  tx_type TEXT NOT NULL CHECK (tx_type IN ('bet', 'payout', 'refund')),
  amount DECIMAL(20, 9) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed')),
  block_height BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

-- -----------------------------------------------------------------------------
-- 4. Core: solo_games
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS solo_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id BIGINT UNIQUE NOT NULL,
  player_address TEXT NOT NULL,
  difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 0 AND 3),
  stake_amount BIGINT NOT NULL,
  target_score INTEGER NOT NULL,
  final_score INTEGER,
  won BOOLEAN,
  payout BIGINT DEFAULT 0,
  state TEXT NOT NULL CHECK (state IN ('in_progress', 'completed', 'cancelled')) DEFAULT 'in_progress',
  tx_hash TEXT,
  settlement_tx TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- -----------------------------------------------------------------------------
-- 5. Phase 2: multiplayer rooms (2–4 players)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS multiplayer_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT UNIQUE NOT NULL,
  max_players INTEGER NOT NULL CHECK (max_players BETWEEN 2 AND 4) DEFAULT 2,
  min_players INTEGER NOT NULL CHECK (min_players >= 2) DEFAULT 2,
  bet_tier INTEGER NOT NULL CHECK (bet_tier BETWEEN 1 AND 4),
  bet_amount DECIMAL(20, 9) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('waiting', 'countdown', 'active', 'completed', 'cancelled', 'expired')) DEFAULT 'waiting',
  current_player_count INTEGER DEFAULT 0,
  game_seed TEXT,
  game_duration INTEGER DEFAULT 90,
  total_pool DECIMAL(20, 9) DEFAULT 0,
  platform_fee_percent DECIMAL(5, 2) DEFAULT 2.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  countdown_started_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL REFERENCES players(wallet_address) ON DELETE CASCADE,
  winner_address TEXT,
  winner_payout DECIMAL(20, 9),
  payout_tx_hash TEXT,
  validation_details JSONB,
  cancellation_reason TEXT
);

CREATE TABLE IF NOT EXISTS room_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES multiplayer_rooms(id) ON DELETE CASCADE,
  player_address TEXT NOT NULL REFERENCES players(wallet_address) ON DELETE CASCADE,
  join_order INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('joined', 'ready', 'playing', 'finished', 'disconnected')) DEFAULT 'joined',
  is_ready BOOLEAN DEFAULT FALSE,
  score INTEGER DEFAULT 0,
  lives INTEGER DEFAULT 3,
  total_hits INTEGER DEFAULT 0,
  super_fruit_hits INTEGER DEFAULT 0,
  contribution_score INTEGER DEFAULT 0,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  ready_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  final_rank INTEGER,
  payout DECIMAL(20, 9) DEFAULT 0,
  events JSONB DEFAULT '[]'::jsonb,
  UNIQUE(room_id, player_address)
);

CREATE TABLE IF NOT EXISTS super_fruit_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES multiplayer_rooms(id) ON DELETE CASCADE,
  fruit_id TEXT NOT NULL,
  player_address TEXT NOT NULL REFERENCES players(wallet_address) ON DELETE CASCADE,
  hit_number INTEGER NOT NULL,
  damage INTEGER DEFAULT 1,
  fruit_type TEXT NOT NULL,
  fruit_max_hp INTEGER NOT NULL,
  points_awarded INTEGER NOT NULL,
  is_final_hit BOOLEAN DEFAULT FALSE,
  hit_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, fruit_id, hit_number)
);

-- -----------------------------------------------------------------------------
-- 6. Matchmaking + chat
-- -----------------------------------------------------------------------------
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
  CONSTRAINT unique_player_in_queue UNIQUE (player_address)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_address VARCHAR(66) NOT NULL,
  sender_name VARCHAR(50),
  message TEXT NOT NULL,
  chat_type VARCHAR(20) NOT NULL DEFAULT 'lobby',
  game_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 7. Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_players_wallet ON players(wallet_address);
CREATE INDEX IF NOT EXISTS idx_players_rating ON players(rating DESC);
CREATE INDEX IF NOT EXISTS idx_players_earnings ON players(total_earnings DESC);
CREATE INDEX IF NOT EXISTS idx_players_last_active ON players(last_active DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_telegram_user_id ON players(telegram_user_id) WHERE telegram_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_players_auth_provider ON players(auth_provider);

CREATE INDEX IF NOT EXISTS idx_games_game_id ON multiplayer_games(game_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON multiplayer_games(status);
CREATE INDEX IF NOT EXISTS idx_games_player1 ON multiplayer_games(player1_address);
CREATE INDEX IF NOT EXISTS idx_games_player2 ON multiplayer_games(player2_address);
CREATE INDEX IF NOT EXISTS idx_games_bet_tier ON multiplayer_games(bet_tier);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON multiplayer_games(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_expires_at ON multiplayer_games(expires_at);
CREATE INDEX IF NOT EXISTS idx_games_status_tier ON multiplayer_games(status, bet_tier);
CREATE INDEX IF NOT EXISTS idx_games_room_type ON multiplayer_games(room_type);
CREATE INDEX IF NOT EXISTS idx_games_state ON multiplayer_games(state);
CREATE INDEX IF NOT EXISTS idx_games_state_tier ON multiplayer_games(state, bet_tier) WHERE state = 'waiting';
CREATE INDEX IF NOT EXISTS idx_multiplayer_games_status_lives ON multiplayer_games(status, player1_lives, player2_lives) WHERE status IN ('waiting', 'active');
CREATE INDEX IF NOT EXISTS idx_multiplayer_games_status_lives_active ON multiplayer_games(status, player1_lives, player2_lives) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_events_game_id ON game_events(game_id);
CREATE INDEX IF NOT EXISTS idx_events_player ON game_events(player_address);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON game_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_game_id ON game_transactions(game_id);
CREATE INDEX IF NOT EXISTS idx_transactions_player ON game_transactions(player_address);
CREATE INDEX IF NOT EXISTS idx_transactions_tx_hash ON game_transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON game_transactions(status);

CREATE INDEX IF NOT EXISTS idx_solo_games_game_id ON solo_games(game_id);
CREATE INDEX IF NOT EXISTS idx_solo_games_player ON solo_games(player_address);
CREATE INDEX IF NOT EXISTS idx_solo_games_state ON solo_games(state);
CREATE INDEX IF NOT EXISTS idx_solo_games_created_at ON solo_games(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON multiplayer_rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON multiplayer_rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_bet_tier ON multiplayer_rooms(bet_tier);
CREATE INDEX IF NOT EXISTS idx_rooms_created_by ON multiplayer_rooms(created_by);
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON multiplayer_rooms(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rooms_waiting_tier ON multiplayer_rooms(status, bet_tier) WHERE status = 'waiting';

CREATE INDEX IF NOT EXISTS idx_room_players_room ON room_players(room_id);
CREATE INDEX IF NOT EXISTS idx_room_players_player ON room_players(player_address);
CREATE INDEX IF NOT EXISTS idx_room_players_status ON room_players(status);
CREATE INDEX IF NOT EXISTS idx_room_players_score ON room_players(score DESC);

CREATE INDEX IF NOT EXISTS idx_super_hits_room ON super_fruit_hits(room_id);
CREATE INDEX IF NOT EXISTS idx_super_hits_fruit ON super_fruit_hits(room_id, fruit_id);
CREATE INDEX IF NOT EXISTS idx_super_hits_player ON super_fruit_hits(player_address);

CREATE INDEX IF NOT EXISTS idx_queue_status_tier ON matchmaking_queue(status, bet_tier);
CREATE INDEX IF NOT EXISTS idx_queue_expires ON matchmaking_queue(expires_at);

CREATE INDEX IF NOT EXISTS idx_chat_lobby_time ON chat_messages(created_at DESC) WHERE chat_type = 'lobby';
CREATE INDEX IF NOT EXISTS idx_chat_game ON chat_messages(game_id, created_at DESC) WHERE game_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 8. Views
-- -----------------------------------------------------------------------------
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
  RANK() OVER (PARTITION BY rp.room_id ORDER BY rp.score DESC, rp.lives DESC) AS current_rank
FROM room_players rp
JOIN players p ON rp.player_address = p.wallet_address
ORDER BY rp.room_id, rp.score DESC;

CREATE OR REPLACE VIEW daily_leaderboard AS
SELECT
  p.wallet_address,
  p.display_name,
  COALESCE(daily_stats.games_today, 0) AS games_played,
  COALESCE(daily_stats.wins_today, 0) AS wins,
  COALESCE(daily_stats.high_score_today, 0) AS high_score,
  COALESCE(daily_stats.total_score_today, 0) AS total_score,
  p.rating
FROM players p
LEFT JOIN (
  SELECT
    CASE
      WHEN winner = player1_address THEN player1_address
      WHEN winner = player2_address THEN player2_address
      ELSE player1_address
    END AS wallet_address,
    COUNT(*) AS games_today,
    SUM(CASE WHEN winner IS NOT NULL THEN 1 ELSE 0 END) AS wins_today,
    MAX(GREATEST(COALESCE(player1_score, 0), COALESCE(player2_score, 0))) AS high_score_today,
    SUM(GREATEST(COALESCE(player1_score, 0), COALESCE(player2_score, 0))) AS total_score_today
  FROM multiplayer_games
  WHERE completed_at >= NOW() - INTERVAL '24 hours'
    AND status = 'completed'
  GROUP BY 1
) daily_stats ON p.wallet_address = daily_stats.wallet_address
WHERE daily_stats.games_today > 0
ORDER BY daily_stats.high_score_today DESC, daily_stats.total_score_today DESC;

CREATE OR REPLACE VIEW weekly_leaderboard AS
SELECT
  p.wallet_address,
  p.display_name,
  COALESCE(weekly_stats.games_week, 0) AS games_played,
  COALESCE(weekly_stats.wins_week, 0) AS wins,
  COALESCE(weekly_stats.high_score_week, 0) AS high_score,
  COALESCE(weekly_stats.total_score_week, 0) AS total_score,
  p.rating
FROM players p
LEFT JOIN (
  SELECT
    CASE
      WHEN winner = player1_address THEN player1_address
      WHEN winner = player2_address THEN player2_address
      ELSE player1_address
    END AS wallet_address,
    COUNT(*) AS games_week,
    SUM(CASE WHEN winner IS NOT NULL THEN 1 ELSE 0 END) AS wins_week,
    MAX(GREATEST(COALESCE(player1_score, 0), COALESCE(player2_score, 0))) AS high_score_week,
    SUM(GREATEST(COALESCE(player1_score, 0), COALESCE(player2_score, 0))) AS total_score_week
  FROM multiplayer_games
  WHERE completed_at >= NOW() - INTERVAL '7 days'
    AND status = 'completed'
  GROUP BY 1
) weekly_stats ON p.wallet_address = weekly_stats.wallet_address
WHERE weekly_stats.games_week > 0
ORDER BY weekly_stats.high_score_week DESC, weekly_stats.total_score_week DESC;

CREATE OR REPLACE VIEW solo_leaderboard AS
SELECT
  player_address AS wallet_address,
  NULL::TEXT AS display_name,
  COUNT(*) AS games_played,
  SUM(CASE WHEN won = true THEN 1 ELSE 0 END) AS wins,
  MAX(final_score) AS high_score,
  SUM(COALESCE(final_score, 0)) AS total_score,
  0::INTEGER AS rating
FROM solo_games
WHERE state = 'completed'
GROUP BY player_address
ORDER BY high_score DESC, total_score DESC;

CREATE OR REPLACE VIEW alltime_leaderboard AS
SELECT
  p.wallet_address,
  p.display_name,
  p.total_games AS games_played,
  p.total_wins AS wins,
  p.highest_score AS high_score,
  COALESCE(p.total_earnings, 0) AS total_earnings,
  p.rating,
  p.win_streak,
  CASE
    WHEN p.total_games > 0 THEN ROUND((p.total_wins::DECIMAL / p.total_games::DECIMAL) * 100, 2)
    ELSE 0
  END AS win_rate,
  p.last_active
FROM players p
WHERE p.total_games > 0
ORDER BY p.highest_score DESC, p.rating DESC;

-- -----------------------------------------------------------------------------
-- 9. Functions + triggers (multiplayer_games)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_player_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
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

CREATE OR REPLACE FUNCTION ensure_player_exists()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO players (wallet_address)
  VALUES (NEW.player1_address)
  ON CONFLICT (wallet_address) DO UPDATE
  SET last_active = NOW();

  IF NEW.player2_address IS NOT NULL THEN
    INSERT INTO players (wallet_address)
    VALUES (NEW.player2_address)
    ON CONFLICT (wallet_address) DO UPDATE
    SET last_active = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

DROP TRIGGER IF EXISTS trigger_update_player_stats ON multiplayer_games;
CREATE TRIGGER trigger_update_player_stats
AFTER UPDATE ON multiplayer_games
FOR EACH ROW
EXECUTE PROCEDURE update_player_stats();

DROP TRIGGER IF EXISTS trigger_ensure_player_exists ON multiplayer_games;
CREATE TRIGGER trigger_ensure_player_exists
BEFORE INSERT OR UPDATE ON multiplayer_games
FOR EACH ROW
EXECUTE PROCEDURE ensure_player_exists();

-- -----------------------------------------------------------------------------
-- 10. Room helpers + trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS TEXT AS $$
DECLARE
  code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    code := 'ROOM-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    SELECT EXISTS(SELECT 1 FROM multiplayer_rooms WHERE room_code = code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

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

DROP TRIGGER IF EXISTS room_player_count_trigger ON room_players;
CREATE TRIGGER room_player_count_trigger
AFTER INSERT OR DELETE ON room_players
FOR EACH ROW
EXECUTE PROCEDURE update_room_player_count();

-- -----------------------------------------------------------------------------
-- 11. Matchmaking cleanup helper
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cleanup_expired_queue_entries()
RETURNS void AS $$
BEGIN
  DELETE FROM matchmaking_queue
  WHERE expires_at < NOW() AND status = 'waiting';
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 12. Row Level Security + policies
-- -----------------------------------------------------------------------------
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE multiplayer_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE multiplayer_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_fruit_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchmaking_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public players read" ON players;
CREATE POLICY "Public players read" ON players FOR SELECT USING (true);

DROP POLICY IF EXISTS "Players update own profile" ON players;
CREATE POLICY "Players update own profile" ON players FOR UPDATE
  USING (wallet_address = current_setting('app.current_user', true));

DROP POLICY IF EXISTS "Public games read" ON multiplayer_games;
CREATE POLICY "Public games read" ON multiplayer_games FOR SELECT
  USING (
    status IN ('completed', 'cancelled', 'expired')
    OR player1_address = current_setting('app.current_user', true)
    OR player2_address = current_setting('app.current_user', true)
  );

DROP POLICY IF EXISTS "Players read own events" ON game_events;
CREATE POLICY "Players read own events" ON game_events FOR SELECT
  USING (player_address = current_setting('app.current_user', true));

DROP POLICY IF EXISTS "Players read own transactions" ON game_transactions;
CREATE POLICY "Players read own transactions" ON game_transactions FOR SELECT
  USING (player_address = current_setting('app.current_user', true));

DROP POLICY IF EXISTS rooms_select_policy ON multiplayer_rooms;
CREATE POLICY rooms_select_policy ON multiplayer_rooms FOR SELECT USING (true);
DROP POLICY IF EXISTS rooms_insert_policy ON multiplayer_rooms;
CREATE POLICY rooms_insert_policy ON multiplayer_rooms FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS rooms_update_policy ON multiplayer_rooms;
CREATE POLICY rooms_update_policy ON multiplayer_rooms FOR UPDATE USING (true);

DROP POLICY IF EXISTS room_players_select_policy ON room_players;
CREATE POLICY room_players_select_policy ON room_players FOR SELECT USING (true);
DROP POLICY IF EXISTS room_players_insert_policy ON room_players;
CREATE POLICY room_players_insert_policy ON room_players FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS room_players_update_policy ON room_players;
CREATE POLICY room_players_update_policy ON room_players FOR UPDATE USING (true);

DROP POLICY IF EXISTS super_hits_select_policy ON super_fruit_hits;
CREATE POLICY super_hits_select_policy ON super_fruit_hits FOR SELECT USING (true);
DROP POLICY IF EXISTS super_hits_insert_policy ON super_fruit_hits;
CREATE POLICY super_hits_insert_policy ON super_fruit_hits FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public read access for matchmaking_queue" ON matchmaking_queue;
CREATE POLICY "Public read access for matchmaking_queue" ON matchmaking_queue FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow matchmaking_queue inserts" ON matchmaking_queue;
CREATE POLICY "Allow matchmaking_queue inserts" ON matchmaking_queue FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow matchmaking_queue updates" ON matchmaking_queue;
CREATE POLICY "Allow matchmaking_queue updates" ON matchmaking_queue FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow matchmaking_queue deletes" ON matchmaking_queue;
CREATE POLICY "Allow matchmaking_queue deletes" ON matchmaking_queue FOR DELETE USING (true);

DROP POLICY IF EXISTS "Anyone can read chat messages" ON chat_messages;
CREATE POLICY "Anyone can read chat messages" ON chat_messages FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert chat messages" ON chat_messages;
CREATE POLICY "Users can insert chat messages" ON chat_messages FOR INSERT WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 13. Comments
-- -----------------------------------------------------------------------------
COMMENT ON TABLE players IS 'Player profiles and statistics for multiplayer games';
COMMENT ON TABLE multiplayer_games IS 'Multiplayer game instances with bet pools and results';
COMMENT ON TABLE game_events IS 'Audit log of all game-related events';
COMMENT ON TABLE game_transactions IS 'Blockchain transaction records for bets and payouts';
COMMENT ON TABLE multiplayer_rooms IS 'REQ-P2-004: Multi-player game rooms supporting 2-4 players';
COMMENT ON TABLE room_players IS 'REQ-P2-004: Individual player state within multiplayer rooms';
COMMENT ON TABLE super_fruit_hits IS 'REQ-P2-005: Track hits on super fruits for contribution-based scoring';
COMMENT ON TABLE matchmaking_queue IS 'Queue for Quick Match matchmaking - pairs players by stake tier';
COMMENT ON COLUMN multiplayer_games.server_validated IS 'Whether backend validated the game scores from events';
COMMENT ON COLUMN multiplayer_games.validation_details IS 'Details about score validation (anti-cheat)';
COMMENT ON COLUMN multiplayer_games.join_transaction_hash IS 'Blockchain transaction hash for player 2 joining (same as player2_tx_hash)';
COMMENT ON COLUMN multiplayer_games.player1_lives IS 'Player 1 remaining lives (starts at 3)';
COMMENT ON COLUMN multiplayer_games.player2_lives IS 'Player 2 remaining lives (starts at 3)';
COMMENT ON COLUMN multiplayer_games.end_reason IS 'How the game ended: life_loss, timeout, score, cancelled';
COMMENT ON COLUMN multiplayer_rooms.game_seed IS 'Seed for deterministic RNG - ensures all players see same fruit sequence';
COMMENT ON COLUMN room_players.contribution_score IS 'REQ-P2-005: Additional score from contribution bonuses on super fruits';
