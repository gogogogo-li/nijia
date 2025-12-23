-- Clean up old UUID-based games from database
-- This will remove all games with non-numeric game_ids

-- Delete old games where game_id is a UUID string (contains hyphens)
DELETE FROM multiplayer_games WHERE game_id LIKE '%-%';

-- Show remaining games
SELECT game_id, bet_tier, state, player1, player2, created_at 
FROM multiplayer_games 
ORDER BY created_at DESC 
LIMIT 10;
