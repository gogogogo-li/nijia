-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Games table
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id BIGINT UNIQUE NOT NULL,
  bet_amount BIGINT NOT NULL,
  bet_tier INTEGER NOT NULL,
  player1_address TEXT NOT NULL,
  player2_address TEXT,
  player1_score INTEGER DEFAULT 0,
  player2_score INTEGER DEFAULT 0,
  player1_finished BOOLEAN DEFAULT FALSE,
  player2_finished BOOLEAN DEFAULT FALSE,
  winner_address TEXT,
  state INTEGER DEFAULT 0, -- 0=WAITING, 1=IN_PROGRESS, 2=FINISHED, 3=CANCELLED
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  joined_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE,
  creation_tx_hash TEXT,
  join_tx_hash TEXT,
  finish_tx_hash TEXT
);

-- Indexes for games
CREATE INDEX idx_games_state ON games(state);
CREATE INDEX idx_games_player1 ON games(player1_address);
CREATE INDEX idx_games_player2 ON games(player2_address);
CREATE INDEX idx_games_game_id ON games(game_id);
CREATE INDEX idx_games_created_at ON games(created_at DESC);

-- Players table
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  address TEXT UNIQUE NOT NULL,
  games_played INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  total_wagered BIGINT DEFAULT 0,
  total_winnings BIGINT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for players
CREATE INDEX idx_players_address ON players(address);
CREATE INDEX idx_players_winnings ON players(total_winnings DESC);

-- Player game stats (detailed per-game stats)
CREATE TABLE player_game_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_address TEXT NOT NULL,
  game_id BIGINT NOT NULL,
  final_score INTEGER NOT NULL,
  max_combo INTEGER DEFAULT 0,
  tokens_slashed INTEGER DEFAULT 0,
  tokens_missed INTEGER DEFAULT 0,
  game_duration INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (game_id) REFERENCES games(game_id)
);

-- Index for player stats
CREATE INDEX idx_player_game_stats_player ON player_game_stats(player_address);
CREATE INDEX idx_player_game_stats_game ON player_game_stats(game_id);

-- Event log for blockchain events
CREATE TABLE event_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  game_id BIGINT,
  player_address TEXT,
  data JSONB,
  transaction_hash TEXT,
  transaction_version BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for event log
CREATE INDEX idx_event_log_type ON event_log(event_type);
CREATE INDEX idx_event_log_game ON event_log(game_id);
CREATE INDEX idx_event_log_tx ON event_log(transaction_hash);
CREATE INDEX idx_event_log_version ON event_log(transaction_version);

-- Indexer state (track last processed transaction)
CREATE TABLE indexer_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  last_processed_version BIGINT DEFAULT 0,
  last_sync_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_syncing BOOLEAN DEFAULT FALSE
);

-- Insert initial indexer state
INSERT INTO indexer_state (last_processed_version) VALUES (0);

-- Enable Row Level Security (RLS)
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_game_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Games are viewable by everyone" 
  ON games FOR SELECT 
  USING (true);

CREATE POLICY "Players are viewable by everyone" 
  ON players FOR SELECT 
  USING (true);

CREATE POLICY "Player stats are viewable by everyone" 
  ON player_game_stats FOR SELECT 
  USING (true);

CREATE POLICY "Event log is viewable by everyone" 
  ON event_log FOR SELECT 
  USING (true);

-- Create views for common queries

-- Available games view
CREATE OR REPLACE VIEW available_games AS
SELECT 
  game_id,
  bet_amount,
  bet_tier,
  player1_address,
  created_at,
  creation_tx_hash
FROM games
WHERE state = 0
ORDER BY created_at DESC;

-- Leaderboard view
CREATE OR REPLACE VIEW leaderboard AS
SELECT 
  address,
  games_played,
  games_won,
  total_wagered,
  total_winnings,
  CASE 
    WHEN games_played > 0 THEN ROUND((games_won::NUMERIC / games_played::NUMERIC) * 100, 1)
    ELSE 0 
  END as win_rate,
  last_active
FROM players
WHERE games_played > 0
ORDER BY total_winnings DESC, games_won DESC
LIMIT 100;

-- Recent matches view
CREATE OR REPLACE VIEW recent_matches AS
SELECT 
  g.game_id,
  g.bet_amount,
  g.bet_tier,
  g.player1_address,
  g.player2_address,
  g.player1_score,
  g.player2_score,
  g.winner_address,
  g.created_at,
  g.finished_at
FROM games g
WHERE g.state = 2
ORDER BY g.finished_at DESC
LIMIT 50;

-- Function to update player stats
CREATE OR REPLACE FUNCTION update_player_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update or insert player stats
  INSERT INTO players (address, games_played, games_won, total_wagered, total_winnings, last_active)
  VALUES (
    COALESCE(NEW.player1_address, NEW.player2_address),
    0,
    0,
    0,
    0,
    NOW()
  )
  ON CONFLICT (address) DO UPDATE
  SET last_active = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update player stats
CREATE TRIGGER update_player_stats_trigger
AFTER INSERT OR UPDATE ON games
FOR EACH ROW
EXECUTE FUNCTION update_player_stats();

-- Function to get player statistics
CREATE OR REPLACE FUNCTION get_player_stats(player_addr TEXT)
RETURNS TABLE (
  address TEXT,
  games_played INTEGER,
  games_won INTEGER,
  total_wagered BIGINT,
  total_winnings BIGINT,
  win_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.address,
    p.games_played,
    p.games_won,
    p.total_wagered,
    p.total_winnings,
    CASE 
      WHEN p.games_played > 0 THEN ROUND((p.games_won::NUMERIC / p.games_played::NUMERIC) * 100, 1)
      ELSE 0 
    END as win_rate
  FROM players p
  WHERE LOWER(p.address) = LOWER(player_addr);
  
  -- Return default values if player doesn't exist
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      player_addr,
      0::INTEGER,
      0::INTEGER,
      0::BIGINT,
      0::BIGINT,
      0::NUMERIC;
  END IF;
END;
$$ LANGUAGE plpgsql;
