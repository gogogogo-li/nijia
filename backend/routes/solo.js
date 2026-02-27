/**
 * Solo Game API Routes
 * Handles solo game creation, score updates, and completion
 */

import express from 'express';
import { authenticateWallet } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

export default function createSoloRouter(soloGameManager) {

    /**
     * GET /api/solo/config
     * Get solo game difficulty configuration
     */
    router.get('/config', (req, res) => {
        const config = {
            difficulties: [
                { id: 0, name: 'Easy', stake: 0.5, stakeDisplay: '0.5 HACK', target: 100, speed: 1.0 },
                { id: 1, name: 'Medium', stake: 1, stakeDisplay: '1 HACK', target: 200, speed: 1.3 },
                { id: 2, name: 'Hard', stake: 2, stakeDisplay: '2 HACK', target: 350, speed: 1.6 },
                { id: 3, name: 'Extreme', stake: 5, stakeDisplay: '5 HACK', target: 500, speed: 2.0 },
            ],
            lives: 3,
            platformFee: 2, // 2%
        };
        res.json(config);
    });

    /**
     * POST /api/solo/games/create
     * Register a new solo game after frontend creates it on-chain
     */
    router.post('/games/create', authenticateWallet, async (req, res) => {
        try {
            const { txHash, difficulty } = req.body;
            const playerAddress = req.walletAddress;

            logger.info(`POST /api/solo/games/create`);
            logger.info(`   Player: ${playerAddress}, Difficulty: ${difficulty}`);

            if (!txHash || difficulty === undefined) {
                return res.status(400).json({
                    error: 'Missing required fields: txHash, difficulty'
                });
            }

            const game = await soloGameManager.registerGame({
                txHash,
                playerAddress,
                difficulty: parseInt(difficulty),
            });

            res.json({
                success: true,
                game,
            });
        } catch (error) {
            logger.error('Error creating solo game:', error);
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * POST /api/solo/games/:id/score
     * Update game score during gameplay
     */
    router.post('/games/:id/score', authenticateWallet, async (req, res) => {
        try {
            const gameId = parseInt(req.params.id);
            const playerAddress = req.walletAddress;
            const { score } = req.body;

            const game = await soloGameManager.updateScore(gameId, playerAddress, parseInt(score));

            res.json({
                success: true,
                game: {
                    game_id: game.game_id,
                    current_score: game.current_score,
                    target_score: game.target_score,
                    state: game.state,
                }
            });
        } catch (error) {
            logger.error('Error updating solo game score:', error);
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * POST /api/solo/games/:id/lives
     * Update lives during gameplay
     */
    router.post('/games/:id/lives', authenticateWallet, async (req, res) => {
        try {
            const gameId = parseInt(req.params.id);
            const playerAddress = req.walletAddress;
            const { lives, score } = req.body;

            logger.info(`POST /api/solo/games/${gameId}/lives`);
            logger.info(`   Player: ${playerAddress}, Lives: ${lives}, Score: ${score}`);

            // Update score first
            if (score !== undefined) {
                await soloGameManager.updateScore(gameId, playerAddress, parseInt(score));
            }

            // Update lives (may trigger game completion if lives = 0)
            const game = await soloGameManager.updateLives(gameId, playerAddress, parseInt(lives));

            res.json({
                success: true,
                game: {
                    game_id: game.game_id,
                    current_score: game.current_score,
                    target_score: game.target_score,
                    lives: game.lives,
                    state: game.state,
                    won: game.won,
                    payout: game.payout_oct,
                }
            });
        } catch (error) {
            logger.error('Error updating solo game lives:', error);
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * POST /api/solo/games/:id/complete
     * Manually complete a solo game (called when time runs out or player wins)
     */
    router.post('/games/:id/complete', authenticateWallet, async (req, res) => {
        try {
            const gameId = parseInt(req.params.id);
            const playerAddress = req.walletAddress;

            logger.info(`POST /api/solo/games/${gameId}/complete`);
            logger.info(`   Player: ${playerAddress}`);

            const game = soloGameManager.getGame(gameId);

            if (!game) {
                return res.status(404).json({ error: 'Game not found' });
            }

            if (game.player !== playerAddress) {
                return res.status(403).json({ error: 'Not your game' });
            }

            // Use backend-tracked score only — ignore client-reported finalScore
            const completedGame = await soloGameManager.completeGame(gameId);

            res.json({
                success: true,
                game: completedGame,
            });
        } catch (error) {
            logger.error('Error completing solo game:', error);
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * GET /api/solo/games/:id
     * Get solo game status
     */
    router.get('/games/:id', async (req, res) => {
        try {
            const gameId = parseInt(req.params.id);
            const game = soloGameManager.getGame(gameId);

            if (!game) {
                return res.status(404).json({ error: 'Game not found' });
            }

            res.json({ success: true, game });
        } catch (error) {
            logger.error('Error getting solo game:', error);
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * GET /api/solo/games/player/:address
     * Get active solo games for a player
     */
    router.get('/games/player/:address', async (req, res) => {
        try {
            const { address } = req.params;
            const games = soloGameManager.getPlayerGames(address);

            res.json({ success: true, games });
        } catch (error) {
            logger.error('Error getting player solo games:', error);
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}
