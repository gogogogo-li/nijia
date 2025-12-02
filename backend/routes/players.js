import express from 'express';
import { supabase } from '../config/supabase.js';

const router = express.Router();

// Get player stats
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;

    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('address', address)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    res.json({ 
      success: true, 
      stats: data || {
        address,
        games_played: 0,
        games_won: 0,
        total_wagered: '0',
        total_winnings: '0'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get leaderboard
router.get('/leaderboard/top', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const { data, error } = await supabase
      .from('players')
      .select('*')
      .order('total_winnings', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    res.json({ success: true, leaderboard: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
