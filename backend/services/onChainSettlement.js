/**
 * On-Chain Settlement Service
 * Handles calling smart contract functions to settle games and transfer winnings
 */

import { Transaction } from '@onelabs/sui/transactions';
import { Ed25519Keypair } from '@onelabs/sui/keypairs/ed25519';
import { suiClient, PACKAGE_ID, GAME_LOBBY_ID, STATS_REGISTRY_ID } from '../config/onechain.js';
import logger from '../utils/logger.js';

// Contract constants
const CLOCK_OBJECT = '0x6';
const HACK_COIN_TYPE = '0x8b76fc2a2317d45118770cefed7e57171a08c477ed16283616b15f099391f120::hackathon::HACKATHON';

class OnChainSettlement {
    constructor() {
        this.adminKeypair = null;
        this.adminAddress = null;
        this.initialized = false;
    }

    /**
       * Initialize the admin keypair from environment variable
       * The admin must be the same account that deployed the contract
       * Supports both suiprivkey (bech32) and raw hex formats
       */
    async initialize() {
        const privateKey = process.env.ADMIN_PRIVATE_KEY;

        if (!privateKey) {
            logger.warn('⚠️  ADMIN_PRIVATE_KEY not configured - on-chain settlement disabled');
            logger.warn('   Games will be tracked in database only');
            logger.warn('   To enable on-chain settlement, add ADMIN_PRIVATE_KEY to .env');
            return false;
        }

        if (!PACKAGE_ID || !GAME_LOBBY_ID || !STATS_REGISTRY_ID) {
            logger.warn('⚠️  Contract addresses not configured - on-chain settlement disabled');
            return false;
        }

        try {
            let keypair;

            if (privateKey.startsWith('suiprivkey')) {
                // Handle suiprivkey bech32 format (from 'one keytool export')
                // The format is: suiprivkey + 1 (version) + q (separator) + bech32 encoded key
                // We need to use the SDK's decodeSuiPrivateKey or handle it manually

                // Import the decoder
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
            this.adminAddress = this.adminKeypair.getPublicKey().toSuiAddress();
            this.initialized = true;

            logger.info('✅ On-chain settlement initialized');
            logger.info(`   Admin address: ${this.adminAddress}`);

            return true;
        } catch (error) {
            logger.error('❌ Failed to initialize on-chain settlement:', error.message);
            logger.error('   Ensure ADMIN_PRIVATE_KEY is in suiprivkey or hex format');
            return false;
        }
    }


    /**
     * Check if settlement is available
     */
    isEnabled() {
        return this.initialized && this.adminKeypair !== null;
    }

    /**
     * Register a game on-chain (called when game starts with both players)
     * This creates the game in IN_PROGRESS state on the contract
     * @param {Object} game - Game object with player addresses and bet amount
     */
    async registerGame(game) {
        if (!this.isEnabled()) {
            logger.warn('⚠️  On-chain registration disabled, game will be off-chain only:', game.game_id);
            return { success: false, reason: 'settlement_disabled' };
        }

        try {
            logger.info(`⛓️  Registering game ${game.game_id} on-chain...`);
            logger.info(`   Player1: ${game.player1}`);
            logger.info(`   Player2: ${game.player2}`);
            logger.info(`   Bet Amount: ${game.bet_amount}`);

            const tx = new Transaction();
            tx.setSender(this.adminAddress);

            // Call admin_register_game function on the contract
            tx.moveCall({
                target: `${PACKAGE_ID}::multiplayer_game::admin_register_game`,
                typeArguments: [HACK_COIN_TYPE],
                arguments: [
                    tx.object(GAME_LOBBY_ID),           // lobby: &mut GameLobby
                    tx.pure.u64(game.game_id),          // game_id: u64
                    tx.pure.address(game.player1),      // player1: address
                    tx.pure.address(game.player2),      // player2: address
                    tx.pure.u64(game.bet_amount || 0),  // bet_amount: u64
                    tx.object(CLOCK_OBJECT),            // clock: &Clock
                ],
            });

            // Execute the transaction
            const result = await suiClient.signAndExecuteTransaction({
                transaction: tx,
                signer: this.adminKeypair,
                options: {
                    showEffects: true,
                    showEvents: true,
                }
            });

            if (result.effects?.status?.status === 'success') {
                logger.info(`✅ Game ${game.game_id} registered on-chain!`);
                logger.info(`   Transaction: ${result.digest}`);
                return {
                    success: true,
                    digest: result.digest,
                    effects: result.effects
                };
            } else {
                logger.error(`❌ Registration failed for game ${game.game_id}`);
                logger.error(`   Status: ${result.effects?.status?.status}`);
                logger.error(`   Error: ${result.effects?.status?.error}`);
                return {
                    success: false,
                    reason: result.effects?.status?.error || 'unknown_error'
                };
            }

        } catch (error) {
            logger.error(`❌ On-chain registration error for game ${game.game_id}:`, error.message);
            return { success: false, reason: error.message };
        }
    }

    /**
     * Submit game scores on-chain and transfer winnings to winner
     * @param {Object} game - Game object with player addresses and scores
     */
    async settleGame(game) {
        if (!this.isEnabled()) {
            logger.warn('⚠️  On-chain settlement disabled, skipping for game:', game.game_id);
            return { success: false, reason: 'settlement_disabled' };
        }

        try {
            logger.info(`⛓️  Settling game ${game.game_id} on-chain...`);
            logger.info(`   Player1: ${game.player1} (Score: ${game.player1_score})`);
            logger.info(`   Player2: ${game.player2} (Score: ${game.player2_score})`);
            logger.info(`   Winner: ${game.winner}`);

            const tx = new Transaction();
            tx.setSender(this.adminAddress);

            // Call submit_score function on the contract
            tx.moveCall({
                target: `${PACKAGE_ID}::multiplayer_game::submit_score`,
                typeArguments: [HACK_COIN_TYPE],
                arguments: [
                    tx.object(GAME_LOBBY_ID),           // lobby: &mut GameLobby
                    tx.object(STATS_REGISTRY_ID),       // stats_registry: &mut StatsRegistry
                    tx.pure.u64(game.game_id),          // game_id: u64
                    tx.pure.address(game.player1),      // player1_address: address
                    tx.pure.address(game.player2),      // player2_address: address
                    tx.pure.u64(game.player1_score || 0), // player1_score: u64
                    tx.pure.u64(game.player2_score || 0), // player2_score: u64
                    tx.object(CLOCK_OBJECT),            // clock: &Clock
                ],
            });

            // Execute the transaction
            const result = await suiClient.signAndExecuteTransaction({
                transaction: tx,
                signer: this.adminKeypair,
                options: {
                    showEffects: true,
                    showEvents: true,
                }
            });

            if (result.effects?.status?.status === 'success') {
                logger.info(`✅ Game ${game.game_id} settled on-chain!`);
                logger.info(`   Transaction: ${result.digest}`);
                return {
                    success: true,
                    digest: result.digest,
                    effects: result.effects
                };
            } else {
                logger.error(`❌ Settlement failed for game ${game.game_id}`);
                logger.error(`   Status: ${result.effects?.status?.status}`);
                logger.error(`   Error: ${result.effects?.status?.error}`);
                return {
                    success: false,
                    reason: result.effects?.status?.error || 'unknown_error'
                };
            }

        } catch (error) {
            logger.error(`❌ On-chain settlement error for game ${game.game_id}:`, error.message);

            // Common errors and their meanings
            if (error.message.includes('E_NOT_ADMIN')) {
                logger.error('   The configured admin key does not match the contract admin');
            } else if (error.message.includes('E_GAME_NOT_FOUND')) {
                logger.error('   Game not found on-chain (may not have been created on-chain)');
            } else if (error.message.includes('E_GAME_NOT_IN_PROGRESS')) {
                logger.error('   Game is not in progress state on-chain');
            }

            return { success: false, reason: error.message };
        }
    }

    /**
     * Forfeit a game on-chain (one player disconnected/forfeited)
     * @param {Object} game - Game object
     * @param {string} forfeiterAddress - Address of the player who forfeited
     */
    async forfeitGame(game, forfeiterAddress) {
        if (!this.isEnabled()) {
            logger.warn('⚠️  On-chain settlement disabled, skipping forfeit for game:', game.game_id);
            return { success: false, reason: 'settlement_disabled' };
        }

        try {
            logger.info(`⛓️  Recording forfeit for game ${game.game_id} on-chain...`);
            logger.info(`   Forfeiter: ${forfeiterAddress}`);

            const tx = new Transaction();
            tx.setSender(this.adminAddress);

            // Call forfeit_game function on the contract
            tx.moveCall({
                target: `${PACKAGE_ID}::multiplayer_game::forfeit_game`,
                typeArguments: [HACK_COIN_TYPE],
                arguments: [
                    tx.object(GAME_LOBBY_ID),           // lobby: &mut GameLobby
                    tx.object(STATS_REGISTRY_ID),       // stats_registry: &mut StatsRegistry
                    tx.pure.u64(game.game_id),          // game_id: u64
                    tx.pure.address(forfeiterAddress),  // forfeiter: address
                    tx.object(CLOCK_OBJECT),            // clock: &Clock
                ],
            });

            const result = await suiClient.signAndExecuteTransaction({
                transaction: tx,
                signer: this.adminKeypair,
                options: {
                    showEffects: true,
                    showEvents: true,
                }
            });

            if (result.effects?.status?.status === 'success') {
                logger.info(`✅ Forfeit recorded on-chain for game ${game.game_id}`);
                logger.info(`   Transaction: ${result.digest}`);
                return { success: true, digest: result.digest };
            } else {
                logger.error(`❌ Forfeit failed for game ${game.game_id}`);
                return { success: false, reason: result.effects?.status?.error };
            }

        } catch (error) {
            logger.error(`❌ On-chain forfeit error for game ${game.game_id}:`, error.message);
            return { success: false, reason: error.message };
        }
    }

    /**
     * Transfer HACK prize directly from admin treasury to winner
     * Used for Quick Match games where escrow isn't on-chain
     * @param {string} winnerAddress - Address of the winner
     * @param {number|string} prizeAmountMist - Prize amount in MIST (1 HACK = 1,000,000,000 MIST)
     * @param {number} gameId - Game ID for logging
     */
    async transferPrizeToWinner(winnerAddress, prizeAmountMist, gameId) {
        if (!this.isEnabled()) {
            logger.warn('⚠️  On-chain settlement disabled, cannot transfer prize');
            return { success: false, reason: 'settlement_disabled' };
        }

        try {
            const prizeAmount = BigInt(prizeAmountMist);

            // Apply 2% platform fee (same as regular games)
            const platformFee = prizeAmount * 2n / 100n;
            const winnerPrize = prizeAmount - platformFee;

            logger.info(`💰 Quick Match Prize Transfer for game ${gameId}:`);
            logger.info(`   Winner: ${winnerAddress}`);
            logger.info(`   Total Pool: ${prizeAmount} MIST (${Number(prizeAmount) / 1e9} HACK)`);
            logger.info(`   Platform Fee (2%): ${platformFee} MIST`);
            logger.info(`   Winner Gets: ${winnerPrize} MIST (${Number(winnerPrize) / 1e9} HACK)`);

            const tx = new Transaction();
            tx.setSender(this.adminAddress);

            // Get admin's HACK coins to pay the winner
            // We need to split the exact amount from admin's HACK balance
            const [winnerCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(winnerPrize)]);

            // Transfer to winner
            tx.transferObjects([winnerCoin], tx.pure.address(winnerAddress));

            // Execute the transaction
            const result = await suiClient.signAndExecuteTransaction({
                transaction: tx,
                signer: this.adminKeypair,
                options: {
                    showEffects: true,
                    showEvents: true,
                }
            });

            if (result.effects?.status?.status === 'success') {
                logger.info(`✅ Quick Match prize transferred for game ${gameId}!`);
                logger.info(`   Transaction: ${result.digest}`);
                logger.info(`   Winner ${winnerAddress.slice(0, 10)}... received ${Number(winnerPrize) / 1e9} HACK`);
                return {
                    success: true,
                    digest: result.digest,
                    prizeAmount: winnerPrize.toString(),
                    effects: result.effects
                };
            } else {
                logger.error(`❌ Prize transfer failed for game ${gameId}`);
                logger.error(`   Status: ${result.effects?.status?.status}`);
                logger.error(`   Error: ${result.effects?.status?.error}`);
                return {
                    success: false,
                    reason: result.effects?.status?.error || 'unknown_error'
                };
            }

        } catch (error) {
            logger.error(`❌ Quick Match prize transfer error for game ${gameId}:`, error.message);

            if (error.message.includes('InsufficientGas') || error.message.includes('balance')) {
                logger.error('   ⚠️  Admin wallet may have insufficient HACK balance for prize transfer');
            }

            return { success: false, reason: error.message };
        }
    }
}

// Export singleton instance
const onChainSettlement = new OnChainSettlement();
export default onChainSettlement;
