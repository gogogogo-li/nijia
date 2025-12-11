import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import { suiClient, mistToOct, octToMist } from '../config/onechain.js';

/**
 * GameManager - Central service for managing multiplayer games
 * All game logic is handled server-side for security
 */
export class GameManager {
  constructor(io, supabase) {
    this.io = io;
    this.supabase = supabase;
    
    // In-memory game cache for active games
    this.activeGames = new Map();
    this.playerGames = new Map(); // Track active games per player
    
    // Configuration
    this.config = {
      gameTimeout: parseInt(process.env.GAME_TIMEOUT_MS) || 300000, // 5 minutes
      maxActiveGamesPerPlayer: parseInt(process.env.MAX_ACTIVE_GAMES_PER_PLAYER) || 3,
      minBetAmount: BigInt(process.env.MIN_BET_AMOUNT || 100000000), // 0.1 OCT
      maxBetAmount: BigInt(process.env.MAX_BET_AMOUNT || 10000000000), // 10 OCT
      cleanupInterval: 30000 // 30 seconds
    };
    
    // Bet tiers (in OCT)
    this.betTiers = [
      { id: 1, amount: 0.1, label: 'Casual', description: 'Perfect for beginners' },
      { id: 2, amount: 0.5, label: 'Standard', description: 'Most popular choice' },
      { id: 3, amount: 1.0, label: 'Competitive', description: 'For serious players' },
      { id: 4, amount: 5.0, label: 'High Stakes', description: 'Big risk, big reward' },
    ];
    
    // Start cleanup interval
    this.startCleanup();
    
    logger.info('GameManager initialized');
  }
  
  /**
   * Create a new multiplayer game
   * Backend validates and creates the game
   */
  async createGame({ player1Address, betTierId, transactionHash }) {
    try {
      // Validate inputs
      const tier = this.betTiers.find(t => t.id === betTierId);
      if (!tier) {
        throw new Error('Invalid bet tier');
      }
      
      // Check player's active games limit
      const playerActiveGames = this.playerGames.get(player1Address) || [];
      if (playerActiveGames.length >= this.config.maxActiveGamesPerPlayer) {
        throw new Error(`Maximum ${this.config.maxActiveGamesPerPlayer} active games allowed`);
      }
      
      // Verify transaction on-chain (optional but recommended for production)
      if (transactionHash) {
        const isValid = await this.verifyTransaction(transactionHash, player1Address);
        if (!isValid) {
          logger.warn(`Invalid transaction hash for game creation: ${transactionHash}`);
        }
      }
      
      // Generate unique game ID
      const gameId = uuidv4();
      const betAmountMist = octToMist(tier.amount);
      
      // Create game object
      const game = {
        game_id: gameId,
        bet_tier: betTierId,
        bet_amount: betAmountMist.toString(),
        bet_amount_oct: tier.amount,
        player1: player1Address,
        player2: null,
        player1_score: null,
        player2_score: null,
        winner: null,
        state: 'waiting', // waiting, in_progress, completed, cancelled
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + this.config.gameTimeout).toISOString(),
        transaction_hash: transactionHash,
        verified: !!transactionHash
      };
      
      // Store in cache
      this.activeGames.set(gameId, game);
      
      // Update player's active games
      playerActiveGames.push(gameId);
      this.playerGames.set(player1Address, playerActiveGames);
      
      // Store in database
      const { data, error } = await this.supabase
        .from('multiplayer_games')
        .insert({
          game_id: gameId,
          bet_tier: betTierId,
          bet_amount: betAmountMist.toString(),
          pool_amount: (betAmountMist * 2n).toString(),
          status: 'waiting',
          player1_address: player1Address,
          player1_tx_hash: transactionHash,
          created_at: game.created_at,
          expires_at: game.expires_at
        })
        .select()
        .single();
      
      if (error) {
        logger.error('Error storing game in database:', JSON.stringify(error, null, 2));
        logger.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        logger.warn('Database storage failed - game only exists in memory cache');
        // Continue even if database fails (cache fallback)
      } else {
        logger.info('✅ Game stored in database successfully');
      }
      
      // Broadcast to all clients
      this.io.to('games:all').emit('game:created', game);
      this.io.to(`games:tier:${betTierId}`).emit('game:created', game);
      
      logger.info(`Game created: ${gameId} by ${player1Address} (${tier.amount} OCT)`);
      
      return { success: true, game };
    } catch (error) {
      logger.error('Error creating game:', error);
      throw error;
    }
  }
  
  /**
   * Join an existing game
   * Backend validates and processes the join
   */
  async joinGame({ gameId, player2Address, transactionHash }) {
    try {
      // Get game from cache
      const game = this.activeGames.get(gameId);
      
      if (!game) {
        throw new Error('Game not found');
      }
      
      if (game.state !== 'waiting') {
        throw new Error('Game is not available');
      }
      
      // Log the comparison for debugging
      logger.info(`Join check - Player1: "${game.player1}", Player2: "${player2Address}"`);
      logger.info(`Addresses match: ${game.player1 === player2Address}`);
      
      if (game.player1 === player2Address) {
        throw new Error('Cannot join your own game');
      }
      
      // Check if game has expired
      if (new Date(game.expires_at) < new Date()) {
        await this.cancelGame(gameId, 'expired');
        throw new Error('Game has expired');
      }
      
      // Verify transaction (optional)
      if (transactionHash) {
        const isValid = await this.verifyTransaction(transactionHash, player2Address);
        if (!isValid) {
          logger.warn(`Invalid transaction hash for game join: ${transactionHash}`);
        }
      }
      
      // Update game
      game.player2 = player2Address;
      game.state = 'in_progress';
      game.started_at = new Date().toISOString();
      game.join_transaction_hash = transactionHash;
      
      // Update cache
      this.activeGames.set(gameId, game);
      
      // Update player's active games
      const player2ActiveGames = this.playerGames.get(player2Address) || [];
      player2ActiveGames.push(gameId);
      this.playerGames.set(player2Address, player2ActiveGames);
      
      // Update database
      const { error } = await this.supabase
        .from('multiplayer_games')
        .update({
          player2: player2Address,
          state: 'in_progress',
          started_at: game.started_at,
          join_transaction_hash: transactionHash
        })
        .eq('game_id', gameId);
      
      if (error) {
        logger.error('Error updating game in database:', error);
      }
      
      // Notify players
      this.io.to(`player:${game.player1}`).emit('game:joined', game);
      this.io.to(`player:${player2Address}`).emit('game:joined', game);
      
      // Remove from public game lists
      this.io.to('games:all').emit('game:started', { game_id: gameId });
      this.io.to(`games:tier:${game.bet_tier}`).emit('game:started', { game_id: gameId });
      
      logger.info(`Game joined: ${gameId} by ${player2Address}`);
      
      return { success: true, game };
    } catch (error) {
      logger.error('Error joining game:', error);
      throw error;
    }
  }
  
  /**
   * Submit game score - BACKEND VALIDATION CRITICAL
   * Frontend sends game events, backend calculates and validates score
   */
  async submitScore({ gameId, playerAddress, gameEvents, finalScore }) {
    try {
      const game = this.activeGames.get(gameId);
      
      if (!game) {
        throw new Error('Game not found');
      }
      
      if (game.state !== 'in_progress') {
        throw new Error('Game is not in progress');
      }
      
      if (playerAddress !== game.player1 && playerAddress !== game.player2) {
        throw new Error('Player not in this game');
      }
      
      // CRITICAL: Backend validates the score
      const validatedScore = await this.validateGameScore(gameEvents, finalScore);
      
      if (validatedScore === null) {
        throw new Error('Invalid game score - validation failed');
      }
      
      // Store score
      const isPlayer1 = playerAddress === game.player1;
      if (isPlayer1) {
        game.player1_score = validatedScore;
        game.player1_events = gameEvents;
        game.player1_submitted_at = new Date().toISOString();
      } else {
        game.player2_score = validatedScore;
        game.player2_events = gameEvents;
        game.player2_submitted_at = new Date().toISOString();
      }
      
      // Check if both players have submitted
      if (game.player1_score !== null && game.player2_score !== null) {
        await this.finalizeGame(gameId);
      } else {
        // Update cache and database
        this.activeGames.set(gameId, game);
        
        await this.supabase
          .from('multiplayer_games')
          .update({
            player1_score: game.player1_score,
            player2_score: game.player2_score,
            player1_submitted_at: game.player1_submitted_at,
            player2_submitted_at: game.player2_submitted_at
          })
          .eq('game_id', gameId);
        
        // Notify opponent that player has finished
        const opponentAddress = isPlayer1 ? game.player2 : game.player1;
        this.io.to(`player:${opponentAddress}`).emit('game:opponent_finished', {
          game_id: gameId,
          player: playerAddress
        });
      }
      
      logger.info(`Score submitted for game ${gameId} by ${playerAddress}: ${validatedScore}`);
      
      return { success: true, validatedScore };
    } catch (error) {
      logger.error('Error submitting score:', error);
      throw error;
    }
  }
  
  /**
   * Finalize game and determine winner
   * Backend calculates winner securely
   */
  async finalizeGame(gameId) {
    try {
      const game = this.activeGames.get(gameId);
      
      if (!game) {
        throw new Error('Game not found');
      }
      
      // Determine winner
      let winner = null;
      if (game.player1_score > game.player2_score) {
        winner = game.player1;
      } else if (game.player2_score > game.player1_score) {
        winner = game.player2;
      } // else it's a draw
      
      game.winner = winner;
      game.state = 'completed';
      game.completed_at = new Date().toISOString();
      
      // Calculate winnings (winner takes pot minus platform fee)
      const totalPot = BigInt(game.bet_amount) * 2n;
      const platformFee = totalPot * 5n / 100n; // 5% platform fee
      const winnings = totalPot - platformFee;
      
      game.winnings = winner ? winnings.toString() : '0';
      game.platform_fee = platformFee.toString();
      
      // Update cache
      this.activeGames.set(gameId, game);
      
      // Update database
      await this.supabase
        .from('multiplayer_games')
        .update({
          winner,
          state: 'completed',
          completed_at: game.completed_at,
          winnings: game.winnings,
          platform_fee: game.platform_fee
        })
        .eq('game_id', gameId);
      
      // Notify both players
      this.io.to(`player:${game.player1}`).emit('game:completed', game);
      this.io.to(`player:${game.player2}`).emit('game:completed', game);
      
      // Remove from active games
      this.removeGameFromActive(gameId);
      
      logger.info(`Game completed: ${gameId}, Winner: ${winner || 'draw'}`);
      
      return { success: true, game };
    } catch (error) {
      logger.error('Error finalizing game:', error);
      throw error;
    }
  }
  
  /**
   * Cancel a game (expired, player disconnect, etc.)
   */
  async cancelGame(gameId, reason = 'cancelled') {
    try {
      const game = this.activeGames.get(gameId);
      
      if (!game) {
        return;
      }
      
      game.state = 'cancelled';
      game.cancelled_at = new Date().toISOString();
      game.cancel_reason = reason;
      
      // Update database
      await this.supabase
        .from('multiplayer_games')
        .update({
          state: 'cancelled',
          cancelled_at: game.cancelled_at,
          cancel_reason: reason
        })
        .eq('game_id', gameId);
      
      // Notify players
      if (game.player1) {
        this.io.to(`player:${game.player1}`).emit('game:cancelled', { game_id: gameId, reason });
      }
      if (game.player2) {
        this.io.to(`player:${game.player2}`).emit('game:cancelled', { game_id: gameId, reason });
      }
      
      // Remove from active games
      this.removeGameFromActive(gameId);
      
      logger.info(`Game cancelled: ${gameId}, Reason: ${reason}`);
    } catch (error) {
      logger.error('Error cancelling game:', error);
    }
  }
  
  /**
   * Validate game score based on game events
   * CRITICAL SECURITY FUNCTION
   */
  async validateGameScore(gameEvents, claimedScore) {
    try {
      if (!gameEvents || !Array.isArray(gameEvents)) {
        logger.warn('Invalid game events format');
        return null;
      }
      
      let calculatedScore = 0;
      let combo = 0;
      let lastEventTime = 0;
      
      // Validate each game event
      for (const event of gameEvents) {
        // Event must have required fields
        if (!event.type || !event.timestamp || event.points === undefined) {
          logger.warn('Invalid event structure');
          return null;
        }
        
        // Events must be in chronological order
        if (event.timestamp < lastEventTime) {
          logger.warn('Events not in chronological order');
          return null;
        }
        lastEventTime = event.timestamp;
        
        // Validate event types
        if (event.type === 'slash') {
          // Validate points are within reasonable range
          if (event.points < 0 || event.points > 100) {
            logger.warn(`Invalid slash points: ${event.points}`);
            return null;
          }
          
          // Update combo
          combo++;
          
          // Calculate score with combo multiplier
          const comboMultiplier = Math.min(combo / 10, 3); // Max 3x multiplier
          const points = Math.floor(event.points * (1 + comboMultiplier));
          calculatedScore += points;
          
        } else if (event.type === 'miss') {
          // Reset combo on miss
          combo = 0;
          
        } else if (event.type === 'special') {
          // Validate special token points
          if (event.points < 0 || event.points > 500) {
            logger.warn(`Invalid special points: ${event.points}`);
            return null;
          }
          calculatedScore += event.points;
        }
      }
      
      // Allow small variance for timing differences (max 5%)
      const variance = Math.abs(calculatedScore - claimedScore);
      const maxAllowedVariance = calculatedScore * 0.05;
      
      if (variance > maxAllowedVariance) {
        logger.warn(`Score validation failed: calculated=${calculatedScore}, claimed=${claimedScore}`);
        return null;
      }
      
      // Return server-validated score
      return calculatedScore;
      
    } catch (error) {
      logger.error('Error validating score:', error);
      return null;
    }
  }
  
  /**
   * Verify transaction on OneChain
   */
  async verifyTransaction(txHash, expectedSender) {
    try {
      const tx = await suiClient.getTransactionBlock({
        digest: txHash,
        options: {
          showInput: true,
          showEffects: true,
          showEvents: true
        }
      });
      
      if (!tx) {
        return false;
      }
      
      // Verify sender matches
      const sender = tx.transaction?.data?.sender;
      if (sender !== expectedSender) {
        logger.warn(`Transaction sender mismatch: expected ${expectedSender}, got ${sender}`);
        return false;
      }
      
      // Verify transaction was successful
      if (tx.effects?.status?.status !== 'success') {
        logger.warn(`Transaction not successful: ${txHash}`);
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Error verifying transaction:', error);
      return false;
    }
  }
  
  /**
   * Get available games for matchmaking
   */
  getAvailableGames(betTier = null) {
    const now = new Date();
    const games = [];
    
    for (const [gameId, game] of this.activeGames) {
      // Only return waiting games that haven't expired
      if (game.state === 'waiting' && new Date(game.expires_at) > now) {
        if (!betTier || game.bet_tier === betTier) {
          // Format game for frontend (normalize property names)
          games.push({
            id: game.game_id,
            game_id: game.game_id,
            player1: game.player1,
            player1_address: game.player1,
            player2: game.player2,
            bet_tier: game.bet_tier,
            bet_amount: game.bet_amount,
            bet_amount_oct: game.bet_amount_oct,
            state: game.state,
            created_at: game.created_at,
            expires_at: game.expires_at
          });
        }
      }
    }
    
    return games;
  }
  
  /**
   * Handle player disconnect
   */
  async handlePlayerDisconnect(address) {
    const playerGames = this.playerGames.get(address) || [];
    
    for (const gameId of playerGames) {
      const game = this.activeGames.get(gameId);
      
      if (game && game.state === 'waiting') {
        // Cancel waiting games on disconnect
        await this.cancelGame(gameId, 'player_disconnect');
      }
    }
  }
  
  /**
   * Handle database changes from Supabase realtime
   */
  handleDatabaseChange(payload) {
    const { eventType, new: newRecord } = payload;
    
    if (eventType === 'UPDATE' && newRecord) {
      // Sync cache with database updates
      if (this.activeGames.has(newRecord.game_id)) {
        const game = this.activeGames.get(newRecord.game_id);
        Object.assign(game, newRecord);
      }
    }
  }
  
  /**
   * Remove game from active tracking
   */
  removeGameFromActive(gameId) {
    const game = this.activeGames.get(gameId);
    
    if (game) {
      // Remove from player tracking
      [game.player1, game.player2].forEach(address => {
        if (address) {
          const playerGames = this.playerGames.get(address) || [];
          const index = playerGames.indexOf(gameId);
          if (index > -1) {
            playerGames.splice(index, 1);
            if (playerGames.length === 0) {
              this.playerGames.delete(address);
            } else {
              this.playerGames.set(address, playerGames);
            }
          }
        }
      });
      
      // Remove from active games
      this.activeGames.delete(gameId);
    }
  }
  
  /**
   * Periodic cleanup of expired games
   */
  startCleanup() {
    setInterval(async () => {
      const now = new Date();
      const expiredGames = [];
      
      for (const [gameId, game] of this.activeGames) {
        if (new Date(game.expires_at) < now && game.state === 'waiting') {
          expiredGames.push(gameId);
        }
      }
      
      for (const gameId of expiredGames) {
        await this.cancelGame(gameId, 'expired');
      }
      
      if (expiredGames.length > 0) {
        logger.info(`Cleaned up ${expiredGames.length} expired games`);
      }
    }, this.config.cleanupInterval);
  }
  
  /**
   * Cleanup on shutdown
   */
  cleanup() {
    logger.info('GameManager cleanup...');
    this.activeGames.clear();
    this.playerGames.clear();
  }
}
