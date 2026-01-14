/**
 * Room API Routes
 * REQ-P2-004: Multiplayer Battle Mode (2-4 players)
 * 
 * API endpoints for room management
 */

import express from 'express';
import { body, param } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticateWallet } from '../middleware/auth.js';

const router = express.Router();

// Validation helpers
const validate = (validations) => async (req, res, next) => {
    await Promise.all(validations.map(v => v.run(req)));
    const { validationResult } = await import('express-validator');
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    next();
};

// ============================================================
// ROOM MANAGEMENT
// ============================================================

/**
 * POST /api/rooms/create
 * Create a new multiplayer room
 */
router.post('/create',
    authenticateWallet,
    validate([
        body('betTierId').isInt({ min: 1, max: 4 }),
        body('maxPlayers').optional().isInt({ min: 2, max: 4 }),
        body('transactionHash').isString().notEmpty()
    ]),
    asyncHandler(async (req, res) => {
        const { betTierId, maxPlayers = 2, transactionHash } = req.body;
        const creatorAddress = req.walletAddress;

        const result = await global.roomManager.createRoom({
            creatorAddress,
            betTierId,
            maxPlayers,
            transactionHash
        });

        res.json(result);
    })
);

/**
 * POST /api/rooms/join/:roomCode
 * Join an existing room by code
 */
router.post('/join/:roomCode',
    authenticateWallet,
    validate([
        param('roomCode').isString().notEmpty(),
        body('transactionHash').isString().notEmpty()
    ]),
    asyncHandler(async (req, res) => {
        const { roomCode } = req.params;
        const { transactionHash } = req.body;
        const playerAddress = req.walletAddress;

        const result = await global.roomManager.joinRoom({
            roomCode,
            playerAddress,
            transactionHash
        });

        res.json(result);
    })
);

/**
 * POST /api/rooms/:roomId/ready
 * Player indicates they are ready
 */
router.post('/:roomId/ready',
    authenticateWallet,
    validate([
        param('roomId').isUUID()
    ]),
    asyncHandler(async (req, res) => {
        const { roomId } = req.params;
        const playerAddress = req.walletAddress;

        const result = await global.roomManager.setPlayerReady(roomId, playerAddress);

        // Emit to room via socket
        if (global.io) {
            global.io.to(`room:${roomId}`).emit('player:ready', {
                playerAddress,
                allReady: result.allReady
            });
        }

        res.json(result);
    })
);

/**
 * POST /api/rooms/:roomId/score
 * Update player score and lives
 */
router.post('/:roomId/score',
    authenticateWallet,
    validate([
        param('roomId').isUUID(),
        body('score').isInt({ min: 0 }),
        body('lives').isInt({ min: 0, max: 3 })
    ]),
    asyncHandler(async (req, res) => {
        const { roomId } = req.params;
        const { score, lives } = req.body;
        const playerAddress = req.walletAddress;

        const result = await global.roomManager.updatePlayerState(
            roomId,
            playerAddress,
            score,
            lives
        );

        // Emit score update to room
        if (global.io) {
            global.io.to(`room:${roomId}`).emit('score:update', {
                playerAddress,
                score,
                lives
            });
        }

        res.json(result);
    })
);

/**
 * POST /api/rooms/:roomId/super-fruit-hit
 * Record a super fruit hit (REQ-P2-005)
 */
router.post('/:roomId/super-fruit-hit',
    authenticateWallet,
    validate([
        param('roomId').isUUID(),
        body('fruitId').isString().notEmpty(),
        body('hitNumber').isInt({ min: 1 }),
        body('damage').optional().isInt({ min: 1 }).default(1),
        body('fruitType').isString().notEmpty(),
        body('fruitMaxHp').isInt({ min: 1 }),
        body('isFinalHit').isBoolean()
    ]),
    asyncHandler(async (req, res) => {
        const { roomId } = req.params;
        const { fruitId, hitNumber, damage, fruitType, fruitMaxHp, isFinalHit } = req.body;
        const playerAddress = req.walletAddress;

        const result = await global.roomManager.recordSuperFruitHit(
            roomId,
            fruitId,
            playerAddress,
            hitNumber,
            damage || 1,
            fruitType,
            fruitMaxHp,
            isFinalHit
        );

        // Emit hit to room
        if (global.io) {
            global.io.to(`room:${roomId}`).emit('fruit:hit', {
                fruitId,
                playerAddress,
                hitNumber,
                isFinalHit,
                points: result.points
            });

            if (isFinalHit) {
                global.io.to(`room:${roomId}`).emit('fruit:destroyed', {
                    fruitId,
                    destroyedBy: playerAddress
                });
            }
        }

        res.json(result);
    })
);

/**
 * GET /api/rooms/:roomId
 * Get room details
 */
router.get('/:roomId',
    validate([
        param('roomId').isUUID()
    ]),
    asyncHandler(async (req, res) => {
        const { roomId } = req.params;

        const room = await global.roomManager.getRoomDetails(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                error: 'Room not found'
            });
        }

        res.json({
            success: true,
            room
        });
    })
);

/**
 * GET /api/rooms/available/:betTierId
 * Get available rooms for a bet tier
 */
router.get('/available/:betTierId',
    validate([
        param('betTierId').isInt({ min: 1, max: 4 })
    ]),
    asyncHandler(async (req, res) => {
        const { betTierId } = req.params;

        const rooms = await global.roomManager.getAvailableRooms(parseInt(betTierId, 10));

        res.json({
            success: true,
            rooms,
            count: rooms.length
        });
    })
);

/**
 * GET /api/rooms/:roomId/leaderboard
 * Get real-time leaderboard for a room
 */
router.get('/:roomId/leaderboard',
    validate([
        param('roomId').isUUID()
    ]),
    asyncHandler(async (req, res) => {
        const { roomId } = req.params;

        const room = await global.roomManager.getRoomDetails(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                error: 'Room not found'
            });
        }

        // Sort players by score descending
        const leaderboard = room.room_players
            .sort((a, b) => b.score - a.score)
            .map((player, index) => ({
                rank: index + 1,
                address: player.player_address,
                score: player.score,
                lives: player.lives,
                status: player.status
            }));

        res.json({
            success: true,
            leaderboard,
            roomStatus: room.status
        });
    })
);

// ============================================================
// SYNCHRONIZED ITEM SLASHING (Shared Environment)
// ============================================================

/**
 * POST /api/rooms/:roomId/slash
 * Attempt to slash an item (first to slash wins)
 */
router.post('/:roomId/slash',
    authenticateWallet,
    validate([
        param('roomId').isUUID(),
        body('itemId').isString().notEmpty(),
        body('timestamp').isInt()
    ]),
    asyncHandler(async (req, res) => {
        const { roomId } = req.params;
        const { itemId, timestamp } = req.body;
        const playerAddress = req.walletAddress;

        // Get or create shared item manager for room
        if (!global.sharedItemManagers) {
            global.sharedItemManagers = new Map();
        }

        const manager = global.sharedItemManagers.get(roomId);
        if (!manager) {
            return res.status(400).json({
                success: false,
                error: 'Game not active'
            });
        }

        const result = manager.attemptSlash(itemId, playerAddress, timestamp);

        if (result.success) {
            // Update player score
            const room = await global.roomManager.getRoomDetails(roomId);
            const player = room?.room_players?.find(p =>
                p.player_address.toLowerCase() === playerAddress.toLowerCase()
            );

            if (player) {
                const newScore = (player.score || 0) + result.points;
                const newLives = result.isBomb ? Math.max(0, player.lives - 1) : player.lives;

                await global.roomManager.updatePlayerState(roomId, playerAddress, newScore, newLives);

                // Check milestones
                const milestones = [100, 200, 300, 400];
                const prevMilestone = milestones.filter(m => m <= (player.score || 0)).pop() || 0;
                const newMilestone = milestones.filter(m => m <= newScore).pop() || 0;

                // Emit slash to all players
                if (global.io) {
                    global.io.to(`room:${roomId}`).emit('sync:slashed', {
                        itemId,
                        slashedBy: playerAddress,
                        points: result.points,
                        isBomb: result.isBomb,
                        fruit: result.fruit
                    });

                    // Milestone announcement
                    if (newMilestone > prevMilestone) {
                        const announcements = {
                            100: '🔥 100 POINTS!',
                            200: '⚡ 200 POINTS!',
                            300: '🌟 300 POINTS!',
                            400: '👑 WINNER!'
                        };

                        global.io.to(`room:${roomId}`).emit('sync:milestone', {
                            playerAddress,
                            milestone: newMilestone,
                            message: announcements[newMilestone]
                        });

                        // Check for win at 400
                        if (newMilestone >= 400) {
                            global.io.to(`room:${roomId}`).emit('game:end', {
                                winner: playerAddress,
                                reason: 'milestone_reached',
                                finalScore: newScore
                            });
                        }
                    }

                    // Bomb hit - lose life
                    if (result.isBomb) {
                        global.io.to(`room:${roomId}`).emit('sync:bomb', {
                            playerAddress,
                            livesRemaining: newLives
                        });
                    }
                }
            }
        }

        res.json({
            success: result.success,
            ...result
        });
    })
);

/**
 * POST /api/rooms/:roomId/spawn-batch
 * Trigger a new spawn batch (server-controlled)
 */
router.post('/:roomId/spawn-batch',
    validate([
        param('roomId').isUUID()
    ]),
    asyncHandler(async (req, res) => {
        const { roomId } = req.params;

        if (!global.sharedItemManagers) {
            global.sharedItemManagers = new Map();
        }

        let manager = global.sharedItemManagers.get(roomId);
        if (!manager) {
            // Create new manager for this room
            const SharedItemManager = require('../services/sharedItemManager');
            const room = await global.roomManager.getRoomDetails(roomId);
            if (!room) {
                return res.status(404).json({ success: false, error: 'Room not found' });
            }
            manager = new SharedItemManager(roomId, room.game_seed);
            global.sharedItemManagers.set(roomId, manager);
        }

        const batch = manager.generateSpawnBatch();

        // Emit to all players in room
        if (global.io) {
            global.io.to(`room:${roomId}`).emit('sync:spawn', batch);
        }

        res.json({
            success: true,
            ...batch
        });
    })
);

export default router;

