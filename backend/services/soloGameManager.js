/**
 * Solo Game Manager Service
 * Handles solo game creation, tracking, score validation, and on-chain settlement
 */

import { Transaction } from '@onelabs/sui/transactions';
import { Ed25519Keypair } from '@onelabs/sui/keypairs/ed25519';
import { suiClient, PACKAGE_ID, SOLO_GAME_LOBBY_ID, STATS_REGISTRY_ID } from '../config/onechain.js';
import logger from '../utils/logger.js';

// Contract constants
const CLOCK_OBJECT = '0x6';
const OCT_COIN_TYPE = '0x2::oct::OCT';

// Difficulty configuration
const DIFFICULTY_CONFIG = {
    0: { name: 'Easy', stake: 500000000, target: 100, speedMultiplier: 1.0 },      // 0.5 OCT
    1: { name: 'Medium', stake: 1000000000, target: 200, speedMultiplier: 1.3 },   // 1 OCT
    2: { name: 'Hard', stake: 2000000000, target: 350, speedMultiplier: 1.6 },     // 2 OCT
    3: { name: 'Extreme', stake: 5000000000, target: 500, speedMultiplier: 2.0 },  // 5 OCT
};

class SoloGameManager {
    constructor(supabase, adminKeypair) {
        this.supabase = supabase;
        this.adminKeypair = adminKeypair;
        this.activeGames = new Map(); // gameId -> game data
    }

    /**
     * Initialize admin keypair from environment variable
     */
    async initialize() {
        const privateKey = process.env.ADMIN_PRIVATE_KEY;

        if (!privateKey) {
            logger.warn('⚠️  ADMIN_PRIVATE_KEY not configured - solo payouts disabled');
            return false;
        }

        try {
            let keypair;

            if (privateKey.startsWith('suiprivkey')) {
                // Handle suiprivkey bech32 format
                const { decodeSuiPrivateKey } = await import('@onelabs/sui/cryptography');
                const decoded = decodeSuiPrivateKey(privateKey);
                keypair = Ed25519Keypair.fromSecretKey(decoded.secretKey);
                logger.info('   Parsed suiprivkey format');
            } else {
                // Handle raw hex format (with or without 0x prefix)
                const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
                const privateKeyBytes = Buffer.from(cleanKey, 'hex');
                keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
                logger.info('   Parsed hex format');
            }

            this.adminKeypair = keypair;
            const adminAddress = this.adminKeypair.getPublicKey().toSuiAddress();

            logger.info('✅ Solo Game Manager initialized with admin keypair');
            logger.info(`   Admin address: ${adminAddress}`);

            return true;
        } catch (error) {
            logger.error('❌ Failed to initialize admin keypair:', error.message);
            return false;
        }
    }

    /**
     * Get difficulty config
     */
    getDifficultyConfig(difficulty) {
        return DIFFICULTY_CONFIG[difficulty] || null;
    }

    /**
     * Validate a create solo game transaction
     * Returns the game_id from the SoloGameCreatedEvent
     */
    async verifyCreateTransaction(txHash, playerAddress, difficulty) {
        try {
            logger.info(`🔍 Verifying solo game transaction: ${txHash}`);

            // Wait a bit for transaction to be indexed
            await new Promise(resolve => setTimeout(resolve, 2000));

            const txResult = await suiClient.getTransactionBlock({
                digest: txHash,
                options: {
                    showEvents: true,
                    showEffects: true,
                }
            });

            if (!txResult || txResult.effects?.status?.status !== 'success') {
                logger.warn(`   Transaction failed or not found: ${txHash}`);
                return null;
            }

            // Look for SoloGameCreatedEvent
            const events = txResult.events || [];
            for (const event of events) {
                if (event.type?.includes('::multiplayer_game::SoloGameCreatedEvent')) {
                    const parsedJson = event.parsedJson;
                    logger.info(`   ✅ SoloGameCreatedEvent found: game_id=${parsedJson.game_id}`);
                    return {
                        gameId: parseInt(parsedJson.game_id),
                        player: parsedJson.player,
                        difficulty: parseInt(parsedJson.difficulty),
                        stakeAmount: parseInt(parsedJson.stake_amount),
                        targetScore: parseInt(parsedJson.target_score),
                    };
                }
            }

            logger.warn(`   No SoloGameCreatedEvent found in transaction`);
            return null;
        } catch (error) {
            logger.error(`   Error verifying transaction: ${error.message}`);
            return null;
        }
    }

    /**
     * Register a new solo game after frontend creates it on-chain
     */
    async registerGame({ txHash, playerAddress, difficulty }) {
        logger.info(`📝 Registering solo game for player ${playerAddress}`);

        // Verify the transaction
        const eventData = await this.verifyCreateTransaction(txHash, playerAddress, difficulty);

        if (!eventData) {
            // Allow registration without verification in development
            logger.warn('   Proceeding without transaction verification');
        }

        const gameId = eventData?.gameId || Date.now(); // Use timestamp as fallback
        const config = this.getDifficultyConfig(difficulty);

        if (!config) {
            throw new Error(`Invalid difficulty: ${difficulty}`);
        }

        const game = {
            game_id: gameId,
            player: playerAddress,
            difficulty,
            difficulty_name: config.name,
            stake_amount: config.stake,
            stake_amount_oct: config.stake / 1_000_000_000,
            target_score: config.target,
            speed_multiplier: config.speedMultiplier,
            current_score: 0,
            lives: 3,
            state: 'in_progress',
            created_at: new Date().toISOString(),
            tx_hash: txHash,
        };

        // Store in memory
        this.activeGames.set(gameId, game);

        // Store in database
        const { error } = await this.supabase
            .from('solo_games')
            .insert({
                game_id: gameId,
                player_address: playerAddress,
                difficulty,
                stake_amount: config.stake,
                target_score: config.target,
                state: 'in_progress',
                tx_hash: txHash,
                created_at: new Date().toISOString(),
            });

        if (error) {
            logger.warn(`   Database error (continuing anyway): ${error.message}`);
        }

        logger.info(`   ✅ Solo game ${gameId} registered`);
        logger.info(`   Difficulty: ${config.name}, Target: ${config.target}, Stake: ${config.stake / 1_000_000_000} OCT`);

        return game;
    }

    /**
     * Update game score (called during gameplay)
     */
    async updateScore(gameId, playerAddress, score) {
        const game = this.activeGames.get(gameId);

        if (!game) {
            throw new Error('Game not found');
        }

        if (game.player !== playerAddress) {
            throw new Error('Not your game');
        }

        if (game.state !== 'in_progress') {
            logger.info(`   Game ${gameId} already completed, ignoring score update`);
            return game;
        }

        // Basic anti-cheat: score can only increase
        if (score < game.current_score) {
            logger.warn(`   ⚠️ Score decreased (${game.current_score} -> ${score}), possible cheat attempt`);
            // Don't update but don't throw
            return game;
        }

        // Anti-cheat: score increase rate limit (max 50 per second)
        const now = Date.now();
        const elapsed = (now - new Date(game.created_at).getTime()) / 1000;
        const maxPossibleScore = elapsed * 50; // Max 50 points per second

        if (score > maxPossibleScore + 100) { // Allow some buffer
            logger.warn(`   ⚠️ Suspicious score: ${score} in ${elapsed}s (max expected: ${maxPossibleScore})`);
            // Still update but flag for review
            game.flagged = true;
        }

        game.current_score = score;
        this.activeGames.set(gameId, game);

        return game;
    }

    /**
     * Update lives (called when player loses a life)
     */
    async updateLives(gameId, playerAddress, lives) {
        const game = this.activeGames.get(gameId);

        if (!game) {
            throw new Error('Game not found');
        }

        if (game.player !== playerAddress) {
            throw new Error('Not your game');
        }

        if (game.state !== 'in_progress') {
            return game;
        }

        game.lives = lives;
        this.activeGames.set(gameId, game);

        // If player lost all lives, end the game
        if (lives <= 0) {
            logger.info(`💀 Player ${playerAddress} lost all lives in solo game ${gameId}`);
            return this.completeGame(gameId, game.current_score);
        }

        return game;
    }

    /**
     * Complete a solo game - determine winner and settle on-chain
     */
    async completeGame(gameId, finalScore) {
        const game = this.activeGames.get(gameId);

        if (!game) {
            throw new Error('Game not found');
        }

        if (game.state === 'completed') {
            logger.info(`   Game ${gameId} already completed`);
            return game;
        }

        game.final_score = finalScore || game.current_score;
        game.won = game.final_score >= game.target_score;
        game.state = 'completed';
        game.completed_at = new Date().toISOString();

        // Calculate payout
        if (game.won) {
            const totalPayout = game.stake_amount * 2;
            const platformFee = totalPayout * 2 / 100; // 2%
            game.payout = totalPayout - platformFee;
            game.payout_oct = game.payout / 1_000_000_000;
        } else {
            game.payout = 0;
            game.payout_oct = 0;
        }

        this.activeGames.set(gameId, game);

        logger.info(`🏁 Solo game ${gameId} completed`);
        logger.info(`   Player: ${game.player}`);
        logger.info(`   Final Score: ${game.final_score} / Target: ${game.target_score}`);
        logger.info(`   Result: ${game.won ? '✅ WIN' : '❌ LOSE'}`);
        logger.info(`   Payout: ${game.payout_oct} OCT`);

        // Settle via direct OCT transfer (no contract needed)
        logger.info(`   🔐 Admin keypair configured: ${!!this.adminKeypair}`);
        if (this.adminKeypair) {
            try {
                await this.settleOnChain(game);
            } catch (error) {
                logger.error(`   ❌ Payout transfer failed: ${error.message}`);
                game.settlement_error = error.message;
            }
        } else {
            logger.warn(`   ⚠️ Admin keypair not configured - cannot send payout`);
            game.settlement_error = 'Admin wallet not configured';
        }

        // Update database
        await this.supabase
            .from('solo_games')
            .update({
                final_score: game.final_score,
                won: game.won,
                payout: game.payout,
                state: 'completed',
                settlement_tx: game.settlement_tx,
                completed_at: game.completed_at,
            })
            .eq('game_id', gameId);

        // Schedule cleanup
        setTimeout(() => {
            this.activeGames.delete(gameId);
            logger.info(`🗑️ Solo game ${gameId} removed from cache`);
        }, 120000); // 2 minutes

        return game;
    }

    /**
     * Settle game by sending direct OCT transfer from admin wallet
     * Used when contract doesn't have a payout function
     */
    async settleOnChain(game) {
        logger.info(`⛓️  Settling solo game ${game.game_id} via direct transfer...`);

        // Only send payout if player won
        if (!game.won || game.payout <= 0) {
            logger.info(`   No payout needed (player lost or payout is 0)`);
            return null;
        }

        try {
            const tx = new Transaction();

            // Split the payout amount from admin's gas coin
            const [payoutCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(BigInt(game.payout))]);

            // Transfer to player
            tx.transferObjects([payoutCoin], tx.pure.address(game.player));

            logger.info(`   Sending ${game.payout_oct} OCT to ${game.player}...`);

            const result = await suiClient.signAndExecuteTransaction({
                signer: this.adminKeypair,
                transaction: tx,
                options: {
                    showEffects: true,
                },
            });

            if (result.effects?.status?.status === 'success') {
                game.settlement_tx = result.digest;
                logger.info(`   ✅ Payout sent successfully: ${result.digest}`);
                return result.digest;
            } else {
                const errorMsg = result.effects?.status?.error || 'Unknown error';
                throw new Error(errorMsg);
            }
        } catch (error) {
            logger.error(`   ❌ Payout failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get active game
     */
    getGame(gameId) {
        return this.activeGames.get(gameId);
    }

    /**
     * Get all active games for a player
     */
    getPlayerGames(playerAddress) {
        const games = [];
        for (const game of this.activeGames.values()) {
            if (game.player === playerAddress && game.state === 'in_progress') {
                games.push(game);
            }
        }
        return games;
    }
}

export default SoloGameManager;
