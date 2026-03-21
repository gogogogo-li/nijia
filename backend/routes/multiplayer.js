import express from 'express';
import { param } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticateWallet, optionalAuth } from '../middleware/auth.js';
import { validate, validations } from '../middleware/validation.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/multiplayer/games/available
 * Get list of available PUBLIC games waiting for players
 */
router.get('/games/available', optionalAuth, asyncHandler(async (req, res) => {
  const { betTier } = req.query;
  const tier = betTier ? parseInt(betTier) : null;

  // Only return public games
  const allGames = global.gameManager.getAvailableGames(tier);
  const publicGames = allGames.filter(g => g.room_type !== 'private');

  res.json({
    success: true,
    games: publicGames,
    count: publicGames.length
  });
}));

/**
 * POST /api/multiplayer/games/create
 * Create a new multiplayer game (public or private)
 */
router.post('/games/create',
  authenticateWallet,
  validate([
    validations.betTier(),
    validations.transactionHash()
  ]),
  asyncHandler(async (req, res) => {
    const { betTierId, transactionHash, roomType = 'public' } = req.body;
    const player1Address = req.walletAddress;

    // Validate roomType
    if (roomType !== 'public' && roomType !== 'private') {
      return res.status(400).json({
        success: false,
        error: 'roomType must be "public" or "private"'
      });
    }

    const result = await global.gameManager.createGame({
      player1Address,
      betTierId,
      transactionHash,
      roomType
    });

    res.json(result);
  })
);

/**
 * POST /api/multiplayer/games/:gameId/join
 * Join an existing game by game ID
 */
router.post('/games/:gameId/join',
  authenticateWallet,
  validate([
    param('gameId').isString(),
    validations.transactionHash()
  ]),
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const { transactionHash } = req.body;
    const player2Address = req.walletAddress;

    logger.info(`Join game request: ${gameId} by ${player2Address}`);

    const result = await global.gameManager.joinGame({
      gameId,
      player2Address,
      transactionHash
    });

    res.json(result);
  })
);

/**
 * POST /api/multiplayer/games/join-code/:code
 * Join a private game using join code
 */
router.post('/games/join-code/:code',
  authenticateWallet,
  validate([
    param('code').isString().isLength({ min: 6, max: 6 }),
    validations.transactionHash()
  ]),
  asyncHandler(async (req, res) => {
    const { code } = req.params;
    const { transactionHash } = req.body;
    const player2Address = req.walletAddress;

    logger.info(`Join by code request: ${code} by ${player2Address}`);

    const result = await global.gameManager.joinByCode({
      joinCode: code,
      player2Address,
      transactionHash
    });

    res.json(result);
  })
);

/**
 * POST /api/multiplayer/games/:gameId/score
 * Submit game score (backend validates)
 */
router.post('/games/:gameId/score',
  authenticateWallet,
  validate([
    param('gameId').isString(),
    validations.score(),
    validations.gameEvents()
  ]),
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const { finalScore, gameEvents } = req.body;
    const playerAddress = req.walletAddress;

    const result = await global.gameManager.submitScore({
      gameId,
      playerAddress,
      gameEvents,
      finalScore
    });

    res.json(result);
  })
);

/**
 * POST /api/multiplayer/games/:gameId/lives
 * NEW: Update player lives in real-time
 */
router.post('/games/:gameId/lives',
  authenticateWallet,
  validate([
    param('gameId').isString()
  ]),
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const { lives, score } = req.body;
    const playerAddress = req.walletAddress;

    const result = await global.gameManager.updatePlayerLives({
      gameId,
      playerAddress,
      lives,
      score
    });

    res.json(result);
  })
);

/**
 * POST /api/multiplayer/games/:gameId/cancel
 * Cancel a game (only creator can cancel)
 */
router.post('/games/:gameId/cancel',
  authenticateWallet,
  validate([
    param('gameId').isString()
  ]),
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const playerAddress = req.walletAddress;

    const game = global.gameManager.activeGames.get(gameId);

    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Game not found'
      });
    }

    if (game.player1 !== playerAddress) {
      return res.status(403).json({
        success: false,
        error: 'Only game creator can cancel'
      });
    }

    if (game.state !== 'waiting') {
      return res.status(400).json({
        success: false,
        error: 'Can only cancel waiting games'
      });
    }

    await global.gameManager.cancelGame(gameId, 'player_cancelled');

    res.json({
      success: true,
      message: 'Game cancelled'
    });
  })
);

/**
 * GET /api/multiplayer/games/:gameId
 * Get game details
 */
router.get('/games/:gameId',
  validate([
    param('gameId').isString()
  ]),
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;

    const game = global.gameManager.activeGames.get(gameId);

    if (!game) {
      // Try to fetch from database
      const { rows } = await global.gameManager.supabase.query(
        'select * from multiplayer_games where game_id = $1 limit 1',
        [gameId]
      );
      const data = rows[0] || null;

      if (!data) {
        return res.status(404).json({
          success: false,
          error: 'Game not found'
        });
      }

      return res.json({
        success: true,
        game: data
      });
    }

    res.json({
      success: true,
      game
    });
  })
);

/**
 * GET /api/multiplayer/player/:address/games
 * Get player's active games
 */
router.get('/player/:address/games',
  validate([
    param('address').matches(/^0x[a-fA-F0-9]{64}$/)
  ]),
  asyncHandler(async (req, res) => {
    const { address } = req.params;

    const gameIds = global.gameManager.playerGames.get(address) || [];
    const games = gameIds
      .map(id => global.gameManager.activeGames.get(id))
      .filter(Boolean);

    res.json({
      success: true,
      games,
      count: games.length
    });
  })
);

/**
 * GET /api/multiplayer/tiers
 * Get available bet tiers
 */
router.get('/tiers', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    tiers: global.gameManager.betTiers
  });
}));

/**
 * GET /api/multiplayer/stats
 * Get multiplayer statistics
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const activeGames = global.gameManager.activeGames.size;
  const waitingGames = global.gameManager.getAvailableGames().length;
  const activePlayers = global.gameManager.playerGames.size;

  // Get completed games count from database
  const { rows } = await global.gameManager.supabase.query(
    `select count(*)::int as count
     from multiplayer_games
     where state = 'completed'`
  );
  const completedGames = rows[0]?.count || 0;

  res.json({
    success: true,
    stats: {
      activeGames,
      waitingGames,
      activePlayers,
      completedGames: completedGames || 0
    }
  });
}));

// ============================================================
// QUICK MATCH - Automatic Matchmaking Endpoints
// ============================================================

/**
 * POST /api/multiplayer/quickmatch/join
 * Join the matchmaking queue for automatic matching
 */
router.post('/quickmatch/join',
  authenticateWallet,
  validate([
    validations.betTier(),
    validations.transactionHash()
  ]),
  asyncHandler(async (req, res) => {
    const { betTierId, transactionHash } = req.body;
    const playerAddress = req.walletAddress;

    logger.info(`Quick Match join request: ${playerAddress} for tier ${betTierId}`);

    const result = await global.gameManager.joinQuickMatchQueue({
      playerAddress,
      betTierId,
      txHash: transactionHash
    });

    res.json(result);
  })
);

/**
 * POST /api/multiplayer/quickmatch/leave
 * Leave the matchmaking queue
 */
router.post('/quickmatch/leave',
  authenticateWallet,
  asyncHandler(async (req, res) => {
    const playerAddress = req.walletAddress;

    logger.info(`Quick Match leave request: ${playerAddress}`);

    const result = await global.gameManager.leaveQuickMatchQueue(playerAddress);

    res.json(result);
  })
);

/**
 * GET /api/multiplayer/quickmatch/status
 * Get player's current queue status
 */
router.get('/quickmatch/status',
  authenticateWallet,
  asyncHandler(async (req, res) => {
    const playerAddress = req.walletAddress;

    const result = await global.gameManager.getQuickMatchStatus(playerAddress);

    res.json(result);
  })
);

// ============================================================
// CHAT - Lobby and Game Chat Endpoints
// ============================================================

/**
 * GET /api/multiplayer/chat/history
 * Get lobby chat message history
 */
router.get('/chat/history',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;

    // Import chatService dynamically to avoid circular deps
    const chatService = (await import('../services/chatService.js')).default;
    const result = await chatService.getLobbyHistory(limit);

    res.json(result);
  })
);

/**
 * GET /api/multiplayer/chat/game/:gameId
 * Get chat history for a specific game
 */
router.get('/chat/game/:gameId',
  optionalAuth,
  validate([
    param('gameId').isNumeric()
  ]),
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;

    const chatService = (await import('../services/chatService.js')).default;
    const result = await chatService.getGameHistory(parseInt(gameId));

    res.json(result);
  })
);

/**
 * GET /api/multiplayer/emotes
 * Get list of available emotes
 */
router.get('/emotes',
  asyncHandler(async (req, res) => {
    const emotes = global.gameManager.getAvailableEmotes();
    res.json({
      success: true,
      emotes
    });
  })
);

export default router;
