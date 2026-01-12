-- Fruit Ninja-Style Leaderboard Views
-- Time-filtered and mode-filtered leaderboards

-- Daily leaderboard (games from last 24 hours)
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

-- Weekly leaderboard (games from last 7 days)
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

-- Solo games leaderboard (all-time)
-- NOTE: Uncomment this view when the solo_games table is created
-- CREATE OR REPLACE VIEW solo_leaderboard AS
-- SELECT 
--   player_address AS wallet_address,
--   NULL AS display_name,
--   COUNT(*) AS games_played,
--   SUM(CASE WHEN won = true THEN 1 ELSE 0 END) AS wins,
--   MAX(final_score) AS high_score,
--   SUM(COALESCE(final_score, 0)) AS total_score,
--   0 AS rating
-- FROM solo_games
-- WHERE state = 'completed'
-- GROUP BY player_address
-- ORDER BY high_score DESC, total_score DESC;

-- Combined all-time leaderboard (enhanced)
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
