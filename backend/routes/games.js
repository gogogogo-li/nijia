import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { pool } from '../config/postgres.js';

const router = express.Router();

/**
 * GET /api/games/leaderboard
 * Get leaderboard with time period and game mode filters
 * 
 * Query params:
 *   - period: 'daily' | 'weekly' | 'all-time' (default: 'all-time')
 *   - mode: 'all' | 'multiplayer' | 'solo' (default: 'all')
 *   - limit: number (default: 100)
 */
router.get('/leaderboard', asyncHandler(async (req, res) => {
  const { period = 'all-time', mode = 'all', limit = 100 } = req.query;
  const limitNum = Math.min(parseInt(limit) || 100, 500);

  let leaderboardData = [];

  try {
    const timeFilter = getTimeFilter(period);
    const playerScores = {};

    // Helper function to add/update player scores
    const addPlayerScore = (addr, score, won) => {
      if (!addr || score === null || score === undefined) return;
      if (!playerScores[addr]) {
        playerScores[addr] = {
          wallet_address: addr,
          high_score: 0,
          games_played: 0,
          wins: 0,
          total_score: 0
        };
      }
      playerScores[addr].games_played++;
      playerScores[addr].total_score += score || 0;
      if (won) playerScores[addr].wins++;
      if (score > playerScores[addr].high_score) {
        playerScores[addr].high_score = score;
      }
    };

    // Fetch solo games if mode is 'solo' or 'all'
    if (mode === 'solo' || mode === 'all') {
      try {
        const soloParams = [];
        let soloSql = `
          select player_address, final_score, won, completed_at
          from solo_games
          where state = 'completed'
            and final_score is not null
        `;
        if (timeFilter) {
          soloParams.push(timeFilter);
          soloSql += ' and completed_at >= $1';
        }
        const { rows: soloGames } = await pool.query(soloSql, soloParams);

        soloGames.forEach(game => {
          addPlayerScore(game.player_address, game.final_score, game.won);
        });
      } catch (soloErr) {
        // solo_games table might not exist - that's ok, continue without it
        console.log('Note: solo_games table not available, skipping');
      }
    }

    // Fetch multiplayer games if mode is 'multiplayer' or 'all'
    if (mode === 'multiplayer' || mode === 'all') {
      const mpParams = [];
      let mpSql = `
        select player1_address, player2_address, player1_score, player2_score, winner, completed_at
        from multiplayer_games
        where status = 'completed'
          and completed_at is not null
      `;
      if (timeFilter) {
        mpParams.push(timeFilter);
        mpSql += ' and completed_at >= $1';
      }
      const { rows: mpGames } = await pool.query(mpSql, mpParams);

      mpGames?.forEach(game => {
        // Process player 1
        addPlayerScore(
          game.player1_address,
          game.player1_score,
          game.winner === game.player1_address
        );

        // Process player 2
        addPlayerScore(
          game.player2_address,
          game.player2_score,
          game.winner === game.player2_address
        );
      });
    }

    leaderboardData = Object.values(playerScores)
      .sort((a, b) => b.high_score - a.high_score)
      .slice(0, limitNum);

    // Add rank to each entry
    leaderboardData = leaderboardData.map((entry, index) => ({
      ...entry,
      rank: index + 1,
      win_rate: entry.games_played > 0
        ? Math.round((entry.wins / entry.games_played) * 100)
        : 0
    }));

    res.json({
      success: true,
      period,
      mode,
      count: leaderboardData.length,
      leaderboard: leaderboardData
    });

  } catch (error) {
    console.error('Leaderboard error:', error);
    throw error;
  }
}));

/**
 * GET /api/games/leaderboard/player/:address
 * Get a specific player's rank and stats
 */
router.get('/leaderboard/player/:address', asyncHandler(async (req, res) => {
  const { address } = req.params;
  const { period = 'all-time', mode = 'all' } = req.query;

  // Get full leaderboard to find player's rank
  const timeFilter = getTimeFilter(period);

  // Simplified approach - get player stats directly
  const { rows: playerRows } = await pool.query(
    'select * from players where wallet_address = $1 limit 1',
    [address]
  );
  const playerData = playerRows[0] || null;

  // Get player's recent games count
  let recentGames = 0;
  if (timeFilter) {
    const { rows } = await pool.query(
      `
        select count(*)::int as count
        from multiplayer_games
        where status = 'completed'
          and completed_at >= $1
          and (player1_address = $2 or player2_address = $2)
      `,
      [timeFilter, address]
    );
    recentGames = rows[0]?.count || 0;
  }

  res.json({
    success: true,
    player: {
      wallet_address: address,
      display_name: playerData?.display_name || null,
      high_score: playerData?.highest_score || 0,
      total_games: playerData?.total_games || 0,
      total_wins: playerData?.total_wins || 0,
      total_earnings: playerData?.total_earnings || 0,
      rating: playerData?.rating || 1000,
      win_rate: playerData?.total_games > 0
        ? Math.round((playerData.total_wins / playerData.total_games) * 100)
        : 0,
      recent_games: recentGames
    }
  });
}));

/**
 * GET /api/games/recent
 * Get recent completed games
 */
router.get('/recent', asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;

  const { rows: data } = await pool.query(
    `
      select *
      from multiplayer_games
      where status = 'completed'
      order by completed_at desc
      limit $1
    `,
    [parseInt(limit)]
  );

  res.json({
    success: true,
    games: data
  });
}));

/**
 * Helper: Get time filter based on period
 */
function getTimeFilter(period) {
  const now = new Date();

  switch (period) {
    case 'daily':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    case 'weekly':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    case 'all-time':
    default:
      return null;
  }
}

export default router;
