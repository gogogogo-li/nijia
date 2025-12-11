import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { supabase } from '../config/supabase.js';

const router = express.Router();

/**
 * GET /api/games/leaderboard
 * Get top players leaderboard
 */
router.get('/leaderboard', asyncHandler(async (req, res) => {
  const { limit = 100 } = req.query;
  
  const { data, error } = await supabase
    .from('players')
    .select('address, total_score, games_played, games_won')
    .order('total_score', { ascending: false })
    .limit(parseInt(limit));
  
  if (error) {
    throw error;
  }
  
  res.json({
    success: true,
    leaderboard: data
  });
}));

/**
 * GET /api/games/recent
 * Get recent completed games
 */
router.get('/recent', asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;
  
  const { data, error } = await supabase
    .from('multiplayer_games')
    .select('*')
    .eq('state', 'completed')
    .order('completed_at', { ascending: false })
    .limit(parseInt(limit));
  
  if (error) {
    throw error;
  }
  
  res.json({
    success: true,
    games: data
  });
}));

export default router;
