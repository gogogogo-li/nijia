import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { supabase } from '../config/supabase.js';

const router = express.Router();

/**
 * GET /api/players/:address/stats
 * Get player statistics
 */
router.get('/:address/stats', asyncHandler(async (req, res) => {
  const { address } = req.params;
  
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('wallet_address', address)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    // Not found is okay, return default stats
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
  
  res.json({
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
  
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('wallet_address', address)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  
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
  
  const { data, error } = await supabase
    .from('players')
    .upsert({
      address,
      username: username || null,
      last_seen: new Date().toISOString()
    })
    .select()
    .single();
  
  if (error) {
    throw error;
  }
  
  res.json({
    success: true,
    player: data
  });
}));

export default router;
