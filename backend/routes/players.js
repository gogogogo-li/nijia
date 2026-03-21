import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { pool } from '../config/postgres.js';

const router = express.Router();

/**
 * GET /api/players/:address/stats
 * Get player statistics
 */
router.get('/:address/stats', asyncHandler(async (req, res) => {
  const { address } = req.params;
  
  const { rows } = await pool.query(
    'select * from players where wallet_address = $1 limit 1',
    [address]
  );
  const data = rows[0] || null;

  if (!data) {
    return res.json({
      success: true,
      stats: {
        totalGames: 0,
        wins: 0,
        losses: 0,
        earnings: 0,
        winRate: 0
      }
    });
  }
  
  return res.json({
    success: true,
    stats: {
      totalGames: data?.total_games || 0,
      wins: data?.total_wins || 0,
      losses: data?.total_losses || 0,
      earnings: data?.total_earnings || 0,
      winRate: data?.total_games > 0 
        ? Math.round((data.total_wins / data.total_games) * 100) 
        : 0
    }
  });
}));

/**
 * GET /api/players/:address
 * Get player stats
 */
router.get('/:address', asyncHandler(async (req, res) => {
  const { address } = req.params;
  
  const { rows } = await pool.query(
    'select * from players where wallet_address = $1 limit 1',
    [address]
  );
  const data = rows[0] || null;
  
  res.json({
    success: true,
    player: data || null
  });
}));

/**
 * POST /api/players/register
 * Register or update player
 */
router.post('/register', asyncHandler(async (req, res) => {
  const { address, username } = req.body;
  
  if (!address) {
    return res.status(400).json({
      success: false,
      error: 'Address required'
    });
  }
  
  const { rows } = await pool.query(
    `
      insert into players (wallet_address, display_name, last_active)
      values ($1, $2, $3)
      on conflict (wallet_address)
      do update
        set display_name = excluded.display_name,
            last_active = excluded.last_active
      returning *
    `,
    [address, username || null, new Date().toISOString()]
  );
  const data = rows[0];
  
  res.json({
    success: true,
    player: data
  });
}));

export default router;
