import express from 'express';
import { supabase } from '../config/supabase.js';
import { onechainClient, ONECHAIN_CONFIG } from '../config/onechain.js';

const router = express.Router();

// In-memory game storage (fallback when blockchain is rate-limited)
let gamesCache = [];

// Clean up expired games (older than 1 minute and not joined)
setInterval(() => {
  const oneMinuteAgo = Date.now() - 60000;
  const beforeCount = gamesCache.length;
  
  gamesCache = gamesCache.filter(game => {
    // Remove if joined/finished (state !== 0)
    if (game.state !== 0) return false;
    
    // Remove if older than 1 minute and still waiting
    const createdAt = new Date(game.created_at).getTime();
    if (createdAt < oneMinuteAgo) return false;
    
    return true;
  });
  
  const removed = beforeCount - gamesCache.length;
  if (removed > 0) {
    console.log(`🧹 Cleaned up ${removed} expired games`);
    // Broadcast update to all clients
    if (global.io) {
      global.io.emit('games_updated', gamesCache.filter(g => g.state === 0));
    }
  }
}, 10000); // Check every 10 seconds

// Get all available games (waiting for player 2)
router.get('/available', async (req, res) => {
  try {
    // Return only active games (state === 0 and not expired)
    const oneMinuteAgo = Date.now() - 60000;
    const availableGames = gamesCache.filter(g => {
      if (g.state !== 0) return false;
      const createdAt = new Date(g.created_at).getTime();
      return createdAt >= oneMinuteAgo;
    });
    res.json(availableGames);
  } catch (error) {
    console.error('Error fetching games:', error.message);
    res.json([]);
  }
});

// Create game (called by frontend after transaction)
router.post('/', async (req, res) => {
  try {
    const { game_id, bet_amount, player1, transactionHash } = req.body;
    
    const newGame = {
      game_id,
      bet_amount,
      player1,
      player2: null,
      state: 0,
      created_at: new Date().toISOString(),
      transactionHash
    };
    
    // Add to cache
    gamesCache.push(newGame);
    
    // Broadcast to all connected WebSocket clients
    if (global.io) {
      global.io.emit('game_created', newGame);
    }
    
    res.json({ success: true, game: newGame });
  } catch (error) {
    console.error('Error creating game:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Join game (called by frontend after transaction)
router.post('/:gameId/join', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { player2, transactionHash } = req.body;
    
    // Update game in cache
    const gameIndex = gamesCache.findIndex(g => g.game_id.toString() === gameId.toString());
    if (gameIndex !== -1) {
      gamesCache[gameIndex].player2 = player2;
      gamesCache[gameIndex].state = 1; // IN_PROGRESS
      gamesCache[gameIndex].joined_at = new Date().toISOString();
      gamesCache[gameIndex].joinTransactionHash = transactionHash;
      
      // Broadcast game joined event
      if (global.io) {
        global.io.emit('game_joined', gamesCache[gameIndex]);
      }
      
      // Remove from available games list after 2 seconds
      setTimeout(() => {
        const idx = gamesCache.findIndex(g => g.game_id.toString() === gameId.toString());
        if (idx !== -1 && gamesCache[idx].state !== 0) {
          gamesCache.splice(idx, 1);
          console.log(`🗑️  Removed started game ${gameId} from cache`);
          // Broadcast updated games list
          if (global.io) {
            global.io.emit('games_updated', gamesCache.filter(g => g.state === 0));
          }
        }
      }, 2000);
      
      res.json({ success: true, game: gamesCache[gameIndex] });
    } else {
      res.status(404).json({ success: false, error: 'Game not found' });
    }
  } catch (error) {
    console.error('Error joining game:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Finish game (called when game completes)
router.post('/:gameId/finish', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { winner, transactionHash } = req.body;
    
    // Remove game from cache
    const gameIndex = gamesCache.findIndex(g => g.game_id.toString() === gameId.toString());
    if (gameIndex !== -1) {
      gamesCache.splice(gameIndex, 1);
      console.log(`✅ Game ${gameId} finished and removed from cache`);
      
      // Broadcast update
      if (global.io) {
        global.io.emit('game_finished', { game_id: gameId, winner });
        global.io.emit('games_updated', gamesCache.filter(g => g.state === 0));
      }
      
      res.json({ success: true });
    } else {
      res.json({ success: true, message: 'Game already removed' });
    }
  } catch (error) {
    console.error('Error finishing game:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get games for a specific player
router.get('/player/:address', async (req, res) => {
  try {
    const { address } = req.params;

    const { data, error } = await supabase
      .from('games')
      .select('*')
      .or(`player1_address.eq.${address},player2_address.eq.${address}`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    res.json({ success: true, games: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get specific game by game_id
router.get('/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;

    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('game_id', parseInt(gameId))
      .single();

    if (error) throw error;

    res.json({ success: true, game: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get match history (finished games)
router.get('/history/all', async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('state', 2)
      .not('winner_address', 'is', null)
      .order('finished_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    res.json({ success: true, matches: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
