-- =============================================================================
-- Grant permissions to the application database user (ninja)
-- Run this as a superuser / database owner against the ninja database:
--   psql "$DATABASE_URL" -U <owner> -f postgres/grant-permissions.sql
-- =============================================================================

-- Tables
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  players,
  multiplayer_games,
  game_events,
  game_transactions,
  solo_games,
  multiplayer_rooms,
  room_players,
  super_fruit_hits,
  matchmaking_queue,
  chat_messages
TO ninja;

-- Views
GRANT SELECT ON
  multiplayer_leaderboard,
  room_leaderboard,
  daily_leaderboard,
  weekly_leaderboard,
  solo_leaderboard,
  alltime_leaderboard
TO ninja;

-- Sequences (needed for any SERIAL / BIGSERIAL columns, and for gen_random_uuid)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ninja;

-- Functions
GRANT EXECUTE ON FUNCTION
  cleanup_expired_games(),
  cleanup_expired_queue_entries(),
  generate_room_code()
TO ninja;

-- Future tables in public schema auto-grant
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ninja;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO ninja;
