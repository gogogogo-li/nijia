import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import { suiClient, mistToToken, tokenToMist } from '../config/onechain.js';
import onChainSettlement from './onChainSettlement.js';

/**
 * GameManager - Central service for managing multiplayer games
 * All game logic is handled server-side for security
 */
export class GameManager {
  constructor(io, supabase) {
    this.io = io;
    this.supabase = supabase;
    this.suiClient = suiClient; // Add suiClient to instance

    // In-memory game cache for active games
    this.activeGames = new Map();
    this.playerGames = new Map(); // Track active games per player
    this.joinCodes = new Map(); // Map join codes to game IDs
    this.playerConnections = new Map(); // Track player socket connections for disconnect handling

    // Configuration
    this.config = {
      gameTimeout: parseInt(process.env.GAME_TIMEOUT_MS) || 300000, // 5 minutes
      maxActiveGamesPerPlayer: parseInt(process.env.MAX_ACTIVE_GAMES_PER_PLAYER) || 3,
      minBetAmount: BigInt(process.env.MIN_BET_AMOUNT || 100000000), // 0.1 HACK
      maxBetAmount: BigInt(process.env.MAX_BET_AMOUNT || 10000000000), // 10 HACK
      cleanupInterval: 30000, // 30 seconds
      disconnectGracePeriod: 5000, // 5 seconds grace window for reconnection
      countdownDuration: 3000 // 3 second countdown before game start
    };

    // Bet tiers (in HACK)
    this.betTiers = [
      { id: 1, amount: 0.1, label: 'Casual', description: 'Perfect for beginners' },
      { id: 2, amount: 0.5, label: 'Standard', description: 'Most popular choice' },
      { id: 3, amount: 1.0, label: 'Competitive', description: 'For serious players' },
      { id: 4, amount: 5.0, label: 'High Stakes', description: 'Big risk, big reward' },
    ];

    // Start cleanup interval
    this.startCleanup();

    // Initialize on-chain settlement (async, runs in background)
    onChainSettlement.initialize().then(enabled => {
      if (enabled) {
        logger.info('✅ On-chain settlement is ENABLED');
      } else {
        logger.info('ℹ️  On-chain settlement is DISABLED (database only)');
      }
    });

    logger.info('GameManager initialized');
  }

  /**
   * Generate a unique 6-character join code for private rooms
   */
  generateJoinCode() {
    let code;
    do {
      code = Math.random().toString(36).substring(2, 8).toUpperCase();
    } while (this.joinCodes.has(code)); // Ensure uniqueness
    return code;
  }

  /**
   * Track player connection for disconnect handling
   */
  trackPlayerConnection(address, socketId) {
    this.playerConnections.set(address, {
      socketId,
      connected: true,
      lastSeen: Date.now()
    });
    logger.info(`📡 Player ${address.slice(0, 10)}... connected (socket: ${socketId})`);
  }

  /**
   * Handle player disconnect with grace period
   */
  handlePlayerDisconnectWithGrace(address, gameId) {
    const connection = this.playerConnections.get(address);
    if (connection) {
      connection.connected = false;
      connection.disconnectedAt = Date.now();
      this.playerConnections.set(address, connection);
    }

    const game = this.activeGames.get(gameId);
    if (!game || game.state !== 'in_progress') return;

    logger.info(`⚠️ Player ${address.slice(0, 10)}... disconnected from game ${gameId}`);
    logger.info(`   Starting ${this.config.disconnectGracePeriod / 1000}s grace period...`);

    // Notify opponent about disconnect
    const opponent = game.player1 === address ? game.player2 : game.player1;
    this.io.to(`player:${opponent}`).emit('game:opponent_disconnected', {
      game_id: gameId,
      gracePeriodMs: this.config.disconnectGracePeriod
    });

    // Start grace period timer
    setTimeout(async () => {
      const currentConnection = this.playerConnections.get(address);
      const currentGame = this.activeGames.get(gameId);

      // Check if player reconnected or game already ended
      if (!currentGame || currentGame.state === 'completed') return;
      if (currentConnection && currentConnection.connected) {
        logger.info(`✅ Player ${address.slice(0, 10)}... reconnected within grace period`);
        this.io.to(`player:${opponent}`).emit('game:opponent_reconnected', { game_id: gameId });
        return;
      }

      // Player did not reconnect - forfeit
      logger.info(`❌ Player ${address.slice(0, 10)}... did not reconnect - FORFEIT`);
      currentGame.winner = opponent;
      currentGame.forfeit_by = address;
      this.activeGames.set(gameId, currentGame);

      await this.finalizeGameInstant(gameId, 'forfeit');
    }, this.config.disconnectGracePeriod);
  }

  /**
   * Create a new multiplayer game
   * Backend validates and creates the game
   * @param {Object} params
   * @param {string} params.player1Address - Creator's wallet address
   * @param {number} params.betTierId - Bet tier ID (1-4)
   * @param {string} params.transactionHash - On-chain transaction hash
   * @param {string} params.roomType - 'public' or 'private' (default: 'public')
   */
  async createGame({ player1Address, betTierId, transactionHash, roomType = 'public' }) {
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
      let gameId = null;

      // Check if this is a development/mock transaction
      // Development transactions have the prefix 0xDEV
      const isMockTransaction = transactionHash && transactionHash.startsWith('0xDEV');

      if (transactionHash && !isMockTransaction) {
        logger.info(`🔍 Verifying transaction: ${transactionHash}`);

        // Retry mechanism - wait for transaction to be indexed
        const maxRetries = 3;
        const retryDelay = 2000; // 2 seconds between retries

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            logger.info(`   Attempt ${attempt}/${maxRetries}...`);

            // Get transaction details to extract game_id from GameCreatedEvent or object changes
            const txDetails = await this.suiClient.getTransactionBlock({
              digest: transactionHash,
              options: { showEvents: true, showObjectChanges: true }
            });

            logger.info(`   Transaction events count: ${txDetails.events?.length || 0}`);

            // Log all events for debugging
            if (txDetails.events) {
              txDetails.events.forEach((event, idx) => {
                logger.info(`   Event ${idx}: ${event.type}`);
              });
            }

            // Find GameCreatedEvent to get the contract's game_id
            // Check for multiple possible event type formats
            const gameCreatedEvent = txDetails.events?.find(event => {
              const eventType = event.type.toLowerCase();
              return eventType.includes('gamecreatedevent') ||
                eventType.includes('game_created') ||
                eventType.includes('multiplayer_game') && eventType.includes('create');
            });

            if (gameCreatedEvent) {
              logger.info(`   GameCreatedEvent found:`, JSON.stringify(gameCreatedEvent));
              // Try different possible field names for game_id
              const parsedJson = gameCreatedEvent.parsedJson || {};
              const gameIdValue = parsedJson.game_id || parsedJson.gameId || parsedJson.id;
              if (gameIdValue !== undefined) {
                gameId = parseInt(gameIdValue);
                logger.info(`✅ Extracted game_id from contract: ${gameId}`);
                break; // Success! Exit retry loop
              } else {
                logger.warn(`⚠️  GameCreatedEvent found but no game_id field. Fields: ${Object.keys(parsedJson).join(', ')}`);
              }
            } else {
              logger.warn('⚠️  Could not find GameCreatedEvent in transaction events');
              logger.warn(`   Available event types: ${txDetails.events?.map(e => e.type).join(', ') || 'none'}`);
              if (attempt < maxRetries) {
                logger.info(`   Waiting ${retryDelay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
              }
            }

            const isValid = await this.verifyTransaction(transactionHash, player1Address);
            if (!isValid) {
              logger.warn(`⚠️ Transaction verification failed for: ${transactionHash}`);
              logger.warn('   Continuing anyway (verification is optional in current mode)');
            } else {
              logger.info(`✅ Transaction verified successfully`);
            }

            break; // Transaction found, exit retry loop
          } catch (err) {
            // Handle transaction not found gracefully
            if (err.message && err.message.includes('Could not find the referenced transaction')) {
              if (attempt < maxRetries) {
                logger.info(`   Transaction not indexed yet, waiting ${retryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
              } else {
                logger.warn(`⚠️  Transaction not found after ${maxRetries} attempts: ${transactionHash}`);
                logger.warn(`   Using fallback game ID.`);
              }
            } else {
              // Log other errors with more detail
              logger.error(`Transaction verification error:`, err.message);
              break;
            }
          }
        }
      } else if (isMockTransaction) {
        logger.info(`🧪 Development Mode: Skipping verification for mock transaction`);
        logger.info(`   Transaction hash: ${transactionHash}`);
        logger.info(`   Note: Deploy smart contract and use real transactions for production`);
      }


      // Fallback if game ID couldn't be extracted
      if (gameId === null) {
        // Use timestamp-based numeric ID as fallback
        gameId = Date.now() % 1000000000;
        logger.warn(`⚠️  Using fallback numeric game_id: ${gameId}`);
      }

      const betAmountMist = tokenToMist(tier.amount);

      // Create game object
      const isPrivate = roomType === 'private';
      const joinCode = isPrivate ? this.generateJoinCode() : null;

      const game = {
        game_id: gameId,
        bet_tier: betTierId,
        bet_amount: betAmountMist.toString(),
        bet_amount_token: tier.amount,
        player1: player1Address,
        player2: null,
        player1_score: null,
        player2_score: null,
        player1_lives: 3,
        player2_lives: 3,
        winner: null,
        state: 'waiting', // waiting, countdown, in_progress, completed, cancelled
        room_type: roomType, // 'public' or 'private'
        join_code: joinCode, // 6-char code for private rooms
        join_code_expires_at: isPrivate ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null, // 5-minute expiry for private codes
        countdown_start_at: null, // Server time when countdown begins (set on join)
        game_start_at: null, // Server time when game actually starts
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + this.config.gameTimeout).toISOString(),
        transaction_hash: transactionHash,
        verified: !!transactionHash,
        game_timer: null,
        forfeit_by: null // Track who forfeited if applicable
      };

      // Store in cache
      this.activeGames.set(gameId, game);

      // Store join code mapping for private rooms
      if (joinCode) {
        this.joinCodes.set(joinCode, gameId);
        logger.info(`🔐 Private room created with join code: ${joinCode}`);
      }

      // Update player's active games
      playerActiveGames.push(gameId);
      this.playerGames.set(player1Address, playerActiveGames);

      // Store in database
      try {
        await this.supabase.query(
          `
            insert into multiplayer_games (
              game_id, bet_tier, bet_amount, pool_amount, status,
              room_type, join_code,
              player1_address, player1_tx_hash,
              created_at, expires_at
            )
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          `,
          [
            gameId,
            betTierId,
            betAmountMist.toString(),
            (betAmountMist * 2n).toString(),
            'waiting',
            roomType,
            joinCode,
            player1Address,
            transactionHash,
            game.created_at,
            game.expires_at,
          ]
        );
        logger.info('✅ Game stored in database successfully');
      } catch (error) {
        logger.error('Error storing game in database:', error.message);
        logger.warn('Database storage failed - game only exists in memory cache');
        // Continue even if database fails (cache fallback)
      }

      // Only broadcast PUBLIC games to the game list
      // Private games should only be joinable via code
      if (roomType === 'public') {
        this.io.to('games:all').emit('game:created', game);
        this.io.to(`games:tier:${betTierId}`).emit('game:created', game);
      }

      logger.info(`Game created: ${gameId} by ${player1Address.slice(0, 10)}... (${tier.amount} HACK, ${roomType})${joinCode ? ` [Code: ${joinCode}]` : ''}`);

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
      // Convert gameId to number (comes as string from URL params)
      const numericGameId = typeof gameId === 'string' ? parseInt(gameId) : gameId;

      // Get game from cache
      const game = this.activeGames.get(numericGameId);

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
        await this.cancelGame(numericGameId, 'expired');
        throw new Error('Game has expired');
      }

      // Verify transaction (optional)
      const isMockTransaction = transactionHash && transactionHash.startsWith('0xDEV');

      if (transactionHash && !isMockTransaction) {
        logger.info(`🔍 Verifying join transaction: ${transactionHash}`);
        const isValid = await this.verifyTransaction(transactionHash, player2Address);
        if (!isValid) {
          logger.warn(`⚠️ Join transaction verification failed for: ${transactionHash}`);
          logger.warn('   Continuing anyway (verification is optional in current mode)');
          // In production, you might want to reject the join here
          // throw new Error('Invalid transaction hash');
        } else {
          logger.info(`✅ Join transaction verified successfully`);
        }
      } else if (isMockTransaction) {
        logger.info(`🧪 Development Mode: Skipping verification for mock join transaction`);
      }

      // Update game with countdown sync
      const countdownStartAt = Date.now();
      const gameStartAt = countdownStartAt + this.config.countdownDuration; // 3 seconds later

      game.player2 = player2Address;
      game.state = 'countdown'; // First enter countdown state
      game.countdown_start_at = countdownStartAt;
      game.game_start_at = gameStartAt;
      game.started_at = new Date().toISOString();
      game.join_transaction_hash = transactionHash;

      // Remove join code from lookup (no longer needed)
      if (game.join_code) {
        this.joinCodes.delete(game.join_code);
      }

      // Start the game after countdown completes
      const self = this;
      setTimeout(() => {
        const g = self.activeGames.get(numericGameId);
        if (g && g.state === 'countdown') {
          g.state = 'in_progress';
          self.activeGames.set(numericGameId, g);
          logger.info(`▶️ Game ${numericGameId} now IN PROGRESS`);

          // Notify both players game has started
          self.io.to(`player:${g.player1}`).emit('game:started', { game_id: numericGameId });
          self.io.to(`player:${g.player2}`).emit('game:started', { game_id: numericGameId });
        }
      }, this.config.countdownDuration);

      // Start 60-second game timer (starts after countdown)
      setTimeout(() => {
        game.game_timer = setTimeout(async () => {
          logger.info(`⏰ 60-second timer expired for game ${numericGameId}`);
          await self.finalizeGameByTimeout(numericGameId);
        }, 60000); // 60 seconds
      }, this.config.countdownDuration);

      // Update cache
      this.activeGames.set(numericGameId, game);

      // Update player's active games
      const player2ActiveGames = this.playerGames.get(player2Address) || [];
      player2ActiveGames.push(numericGameId);
      this.playerGames.set(player2Address, player2ActiveGames);

      // Update database - use 'player2', 'state', and 'player2_tx_hash' to match current schema
      try {
        await this.supabase.query(
          `
            update multiplayer_games
            set player2 = $1,
                player2_tx_hash = $2,
                state = $3,
                started_at = $4,
                player2_lives = $5
            where game_id = $6
          `,
          [player2Address, transactionHash, 'in_progress', game.started_at, 3, numericGameId]
        );
      } catch (error) {
        logger.error('Error updating game in database:', error.message);
        // Don't fail the join if database update fails - game is in memory
        logger.warn('   Game joined in memory but database update failed');
      }

      // ⛓️ ON-CHAIN: Register game on-chain so it can be settled later
      // This creates the game in IN_PROGRESS state on the contract
      logger.info(`⛓️  Registering game ${numericGameId} on-chain...`);
      const registrationResult = await onChainSettlement.registerGame(game);
      if (registrationResult.success) {
        game.onchain_tx = registrationResult.digest;
        logger.info(`   ✅ Game registered on-chain: ${registrationResult.digest}`);
        this.activeGames.set(numericGameId, game);
      } else {
        logger.warn(`   ⚠️  On-chain registration failed: ${registrationResult.reason}`);
        logger.warn(`      Game will proceed off-chain only`);
        game.onchain_registration_error = registrationResult.reason;
        this.activeGames.set(numericGameId, game);
      }

      // Notify both players directly
      logger.info(`Notifying players - Player1: ${game.player1}, Player2: ${player2Address}`);

      // Create a clean game object without circular references (remove timer)
      const gameData = {
        game_id: game.game_id,
        bet_tier: game.bet_tier,
        bet_amount: game.bet_amount,
        bet_amount_token: game.bet_amount_token,
        player1: game.player1,
        player2: game.player2,
        player1_score: game.player1_score,
        player2_score: game.player2_score,
        player1_lives: game.player1_lives,
        player2_lives: game.player2_lives,
        winner: game.winner,
        state: game.state,
        room_type: game.room_type,
        countdown_start_at: game.countdown_start_at,
        game_start_at: game.game_start_at,
        countdown_duration: this.config.countdownDuration,
        created_at: game.created_at,
        started_at: game.started_at,
        expires_at: game.expires_at,
        transaction_hash: game.transaction_hash,
        join_transaction_hash: game.join_transaction_hash,
        verified: game.verified
      };

      this.io.to(`player:${game.player1}`).emit('game:joined', gameData);
      this.io.to(`player:${player2Address}`).emit('game:joined', gameData);

      // Also broadcast to global listeners (for MultiplayerLobby)
      this.io.emit('game_joined', gameData);

      // Remove from public game lists
      this.io.to('games:all').emit('game:started', { game_id: numericGameId });
      this.io.to(`games:tier:${game.bet_tier}`).emit('game:started', { game_id: numericGameId });

      logger.info(`Game joined: ${numericGameId} by ${player2Address}`);

      return { success: true, game: gameData };
    } catch (error) {
      logger.error('Error joining game:', error);
      throw error;
    }
  }

  /**
   * Join a game using a private room join code
   * @param {Object} params
   * @param {string} params.joinCode - 6-char join code
   * @param {string} params.player2Address - Joining player's wallet address  
   * @param {string} params.transactionHash - On-chain transaction hash
   */
  async joinByCode({ joinCode, player2Address, transactionHash }) {
    const code = joinCode.toUpperCase();

    if (!this.joinCodes.has(code)) {
      throw new Error('Invalid or expired join code');
    }

    const gameId = this.joinCodes.get(code);
    const game = this.activeGames.get(gameId);

    // Check if join code has expired (5 minutes since creation)
    if (game && game.join_code_expires_at && new Date(game.join_code_expires_at) < new Date()) {
      this.joinCodes.delete(code);
      logger.info(`⏰ Join code ${code} expired for game ${gameId}`);
      throw new Error('Join code has expired (5-minute limit)');
    }

    logger.info(`🔑 Join by code: ${code} → Game ${gameId}`);

    // Delegate to regular joinGame
    return this.joinGame({ gameId, player2Address, transactionHash });
  }

  /**
   * Submit game score - BACKEND VALIDATION CRITICAL
   * Frontend sends game events, backend calculates and validates score
   * RACE MODE: First player to finish ends the game for both players
   */
  async submitScore({ gameId, playerAddress, gameEvents, finalScore }) {
    try {
      // Convert gameId to number (comes as string from URL params)
      const numericGameId = typeof gameId === 'string' ? parseInt(gameId) : gameId;

      const game = this.activeGames.get(numericGameId);

      logger.info(`📊 ═══════════════════════════════════════════════════════`);
      logger.info(`📊 SCORE SUBMISSION - Game: ${numericGameId}`);
      logger.info(`📊 Player: ${playerAddress}`);

      if (!game) {
        logger.error(`❌ Game ${numericGameId} not found in cache (may have been removed already)`);
        logger.error(`   This usually means the game completed >2 minutes ago`);
        throw new Error('Game not found');
      }

      logger.info(`📊 Current game state: ${game.state}`);
      logger.info(`📊 Player1 (${game.player1}): ${game.player1_score === null ? 'not submitted' : game.player1_score}`);
      logger.info(`📊 Player2 (${game.player2}): ${game.player2_score === null ? 'not submitted' : game.player2_score}`);
      logger.info(`📊 Claimed score: ${finalScore}`);

      // Allow submissions during 'in_progress' or 'finalizing' states
      // For 'completed' games, gracefully ignore (game may have ended due to life_loss)
      if (game.state === 'completed') {
        logger.info(`ℹ️ Game already completed - ignoring score submission`);
        return {
          success: true,
          gameId: numericGameId,
          score: finalScore,
          validated: false,
          message: 'Game already completed',
          alreadyCompleted: true,
          game
        };
      }

      if (game.state !== 'in_progress' && game.state !== 'finalizing') {
        logger.error(`❌ Game state invalid for submission: ${game.state}`);
        throw new Error(`Game is not in progress (current state: ${game.state})`);
      }

      if (playerAddress !== game.player1 && playerAddress !== game.player2) {
        logger.error(`❌ Player ${playerAddress} not in game (Player1: ${game.player1}, Player2: ${game.player2})`);
        throw new Error('Player not in this game');
      }

      // Check if this player already submitted
      const isPlayer1 = playerAddress === game.player1;
      if ((isPlayer1 && game.player1_score !== null) || (!isPlayer1 && game.player2_score !== null)) {
        logger.info(`ℹ️ Player ${playerAddress} already submitted score, ignoring duplicate`);
        logger.info(`📊 ═══════════════════════════════════════════════════════`);
        return { success: true, validatedScore: isPlayer1 ? game.player1_score : game.player2_score };
      }

      // CRITICAL: Backend validates the score
      const validatedScore = await this.validateGameScore(gameEvents, finalScore);

      if (validatedScore === null) {
        throw new Error('Invalid game score - validation failed');
      }

      // Store score
      if (isPlayer1) {
        game.player1_score = validatedScore;
        game.player1_events = gameEvents;
        game.player1_submitted_at = new Date().toISOString();
      } else {
        game.player2_score = validatedScore;
        game.player2_events = gameEvents;
        game.player2_submitted_at = new Date().toISOString();
      }

      // Update cache immediately
      this.activeGames.set(gameId, game);

      logger.info(`✅ Score stored: ${validatedScore} (claimed: ${finalScore})`);

      // Check if both players have now submitted
      const bothSubmitted = game.player1_score !== null && game.player2_score !== null;

      if (bothSubmitted) {
        // Both players submitted, finalize immediately
        logger.info(`🏁 Both players finished! Finalizing game NOW.`);
        logger.info(`📊 ═══════════════════════════════════════════════════════`);
        await this.finalizeGame(gameId);
      } else {
        // This is the first player to finish
        logger.info(`🏁 ${playerAddress} finished FIRST! Ending game immediately for both players.`);

        // Mark game as finalizing to indicate race is over
        if (game.state === 'in_progress') {
          game.state = 'finalizing';
          this.activeGames.set(gameId, game);
          logger.info(`   Game state changed: in_progress → finalizing`);
        }

        // Notify opponent that they lost (first to finish wins)
        const opponentAddress = isPlayer1 ? game.player2 : game.player1;

        logger.info(`📡 Broadcasting opponent_finished_first to: ${opponentAddress}`);

        // Broadcast to both socket rooms and global
        this.io.to(`player:${opponentAddress}`).emit('game:opponent_finished_first', {
          game_id: gameId,
          opponent: playerAddress,
          opponentScore: validatedScore,
          message: 'Opponent finished! Game ending...'
        });

        this.io.emit('game:opponent_finished_first', {
          game_id: gameId,
          opponent: playerAddress,
          opponentScore: validatedScore,
          message: 'Opponent finished! Game ending...'
        });

        logger.info(`   Waiting 5 seconds for opponent submission...`);
        logger.info(`📊 ═══════════════════════════════════════════════════════`);

        // Give opponent 5 seconds to submit their current score, then finalize
        setTimeout(async () => {
          const currentGame = this.activeGames.get(gameId);
          if (!currentGame) {
            logger.warn(`⚠️ Game ${gameId} no longer exists, skipping timeout finalization`);
            return;
          }

          // Check if game already completed (both players submitted)
          if (currentGame.state === 'completed') {
            logger.info(`ℹ️ Game ${gameId} already completed by both players, skipping timeout finalization`);
            return;
          }

          logger.info(`⏰ 5-second grace period expired for game ${gameId}`);

          // If opponent still hasn't submitted, use score of 0
          if (isPlayer1 && currentGame.player2_score === null) {
            currentGame.player2_score = 0;
            logger.info(`   Player2 did not submit in time, using score 0`);
          } else if (!isPlayer1 && currentGame.player1_score === null) {
            currentGame.player1_score = 0;
            logger.info(`   Player1 did not submit in time, using score 0`);
          }

          this.activeGames.set(gameId, currentGame);
          await this.finalizeGame(gameId);
        }, 5000);
      }

      return { success: true, validatedScore };
    } catch (error) {
      logger.error('Error submitting score:', error);
      throw error;
    }
  }

  /**
   * NEW: Update player lives in real-time
   * Called when a player loses a life (hits bomb or misses fruit)
   * Ends game immediately if a player reaches 0 lives
   */
  async updatePlayerLives({ gameId, playerAddress, lives, score }) {
    try {
      // Convert gameId to number (comes as string from URL params)
      const numericGameId = typeof gameId === 'string' ? parseInt(gameId) : gameId;

      const game = this.activeGames.get(numericGameId);

      if (!game) {
        throw new Error('Game not found');
      }

      // Gracefully ignore updates for completed games (may happen due to race conditions)
      if (game.state === 'completed') {
        logger.info(`ℹ️ Game ${numericGameId} already completed - ignoring lives update`);
        return {
          success: true,
          lives: game.player1_lives,
          player2_lives: game.player2_lives,
          alreadyCompleted: true
        };
      }

      if (game.state !== 'in_progress') {
        throw new Error('Game is not in progress');
      }

      const isPlayer1 = game.player1 === playerAddress;
      const isPlayer2 = game.player2 === playerAddress;

      if (!isPlayer1 && !isPlayer2) {
        throw new Error('Player not in this game');
      }

      // Update lives and score
      if (isPlayer1) {
        game.player1_lives = lives;
        game.player1_score = score;
      } else {
        game.player2_lives = lives;
        game.player2_score = score;
      }

      this.activeGames.set(numericGameId, game);

      // Broadcast life update to both players
      this.io.to(`player:${game.player1}`).emit('game:lives_update', {
        game_id: numericGameId,
        player1_lives: game.player1_lives,
        player2_lives: game.player2_lives,
        player1_score: game.player1_score,
        player2_score: game.player2_score
      });

      this.io.to(`player:${game.player2}`).emit('game:lives_update', {
        game_id: numericGameId,
        player1_lives: game.player1_lives,
        player2_lives: game.player2_lives,
        player1_score: game.player1_score,
        player2_score: game.player2_score
      });

      logger.info(`💚 Lives updated for ${numericGameId}: P1=${game.player1_lives}, P2=${game.player2_lives}, Scores: P1=${game.player1_score}, P2=${game.player2_score}`);

      // Check if THIS specific player reached 0 lives - INSTANT GAME END
      // IMPORTANT: Only end when ONE player hits 0, not when both have lost some lives
      if (lives === 0) {
        logger.info(`💀 Player ${playerAddress} lost ALL 3 lives! Ending game immediately.`);
        logger.info(`   Loser: ${playerAddress} (0 lives)`);
        logger.info(`   Winner: ${isPlayer1 ? game.player2 : game.player1} (${isPlayer1 ? game.player2_lives : game.player1_lives} lives)`);

        // Prevent game from ending twice
        if (game.state === 'completed') {
          logger.warn(`   Game already completed, skipping instant end`);
          return { success: true, lives: game.player1_lives, player2_lives: game.player2_lives };
        }

        // Clear the 60-second timer
        if (game.game_timer) {
          clearTimeout(game.game_timer);
          game.game_timer = null;
          logger.info(`   60-second timer cleared`);
        }

        // Determine winner (the other player who still has lives)
        const winner = isPlayer1 ? game.player2 : game.player1;
        game.winner = winner;
        game.state = 'completed'; // Mark as completed to prevent double finalization
        this.activeGames.set(numericGameId, game);

        logger.info(`   Finalizing game with instant loss...`);

        // Finalize game with instant loss condition
        await this.finalizeGameInstant(numericGameId, 'life_loss');
      }

      return { success: true, lives: game.player1_lives, player2_lives: game.player2_lives };
    } catch (error) {
      logger.error('Error updating player lives:', error);
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
        logger.warn(`⚠️ Game ${gameId} not found for finalization (already removed?)`);
        return { success: false, error: 'Game not found' };
      }

      // Check if already finalized
      if (game.state === 'completed') {
        logger.info(`ℹ️ Game ${gameId} already completed, skipping finalization`);
        return { success: true, game };
      }

      logger.info(`🏁 Finalizing game ${gameId}...`);
      logger.info(`   Player1 (${game.player1}): ${game.player1_score}`);
      logger.info(`   Player2 (${game.player2}): ${game.player2_score}`);

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
      const platformFee = totalPot * 2n / 100n; // 2% platform fee (as specified)
      const winnings = totalPot - platformFee;

      game.winnings = winner ? winnings.toString() : '0';
      game.platform_fee = platformFee.toString();

      // Update cache
      this.activeGames.set(gameId, game);

      // Update database
      await this.supabase.query(
        `
          update multiplayer_games
          set winner = $1,
              status = 'completed',
              state = 'completed',
              completed_at = $2,
              winner_payout = $3,
              platform_fee = $4,
              player1_score = $5,
              player2_score = $6
          where game_id = $7
        `,
        [
          winner,
          game.completed_at,
          game.winnings,
          game.platform_fee,
          game.player1_score,
          game.player2_score,
          gameId,
        ]
      );

      // Notify both players via their rooms
      this.io.to(`player:${game.player1}`).emit('game:completed', game);
      this.io.to(`player:${game.player2}`).emit('game:completed', game);

      // Also broadcast globally to ensure both clients receive it
      this.io.emit('game_completed', game);

      // Keep game in cache for 2 minutes so both players can query final results
      // This prevents "Game not found" errors from delayed score submissions
      setTimeout(() => {
        this.removeGameFromActive(gameId);
        logger.info(`🗑️ Game ${gameId} removed from cache after 2-minute grace period`);
      }, 120000);

      logger.info(`✅ Game completed: ${gameId}, Winner: ${winner || 'draw'}, Player1: ${game.player1_score}, Player2: ${game.player2_score}`);

      return { success: true, game };
    } catch (error) {
      logger.error('Error finalizing game:', error);
      throw error;
    }
  }

  /**
   * NEW: Finalize game instantly when a player loses all lives
   * Winner is automatically the opponent
   */
  async finalizeGameInstant(gameId, reason = 'life_loss') {
    try {
      const game = this.activeGames.get(gameId);

      if (!game) {
        logger.warn(`Game ${gameId} not found for instant finalization`);
        throw new Error('Game not found');
      }

      // Prevent double finalization
      if (game.finalized) {
        logger.warn(`Game ${gameId} already finalized, skipping duplicate`);
        return { success: true, game };
      }

      logger.info(`🏁 Instant finalization for ${gameId} - Reason: ${reason}`);
      logger.info(`   Winner: ${game.winner}`);
      logger.info(`   Player 1 lives: ${game.player1_lives}, Player 2 lives: ${game.player2_lives}`);

      game.state = 'completed';
      game.completed_at = new Date().toISOString();
      game.end_reason = reason; // 'forfeit', 'life_loss', 'timeout', 'disconnect'
      game.finalized = true; // Mark as finalized to prevent duplicate calls

      // Calculate winnings based on end reason
      // Forfeit/Disconnect: Winner gets 1.6x stake (80%), Platform gets 0.4x (20%)
      // Normal win (life_loss/timeout): Winner gets 98% of pot, Platform gets 2%
      const stake = BigInt(game.bet_amount);
      const totalPot = stake * 2n;

      let winnings, platformFee;

      if (reason === 'forfeit' || reason === 'disconnect') {
        // Forfeit payout: Winner gets 1.6x their stake, platform keeps 0.4x
        winnings = stake * 160n / 100n; // 1.6x stake = 80% of pot
        platformFee = stake * 40n / 100n; // 0.4x stake = 20% of pot
        logger.info(`   FORFEIT PAYOUT (80/20 split)`);
      } else {
        // Normal win (life_loss, timeout): 98% winner, 2% platform
        platformFee = totalPot * 2n / 100n; // 2%
        winnings = totalPot - platformFee; // 98%
        logger.info(`   NORMAL PAYOUT (98/2 split)`);
      }

      game.winnings = game.winner ? winnings.toString() : '0';
      game.platform_fee = platformFee.toString();

      logger.info(`   Total Pot: ${mistToToken(totalPot)} HACK`);
      logger.info(`   Platform Fee: ${mistToToken(platformFee)} HACK`);
      logger.info(`   Winner Gets: ${game.winner ? mistToToken(winnings) : '0'} HACK`);

      // Update cache
      this.activeGames.set(gameId, game);

      // Update database
      await this.supabase.query(
        `
          update multiplayer_games
          set winner = $1,
              status = 'completed',
              state = 'completed',
              completed_at = $2,
              winner_payout = $3,
              platform_fee = $4,
              player1_score = $5,
              player2_score = $6
          where game_id = $7
        `,
        [
          game.winner,
          game.completed_at,
          game.winnings,
          game.platform_fee,
          game.player1_score,
          game.player2_score,
          gameId,
        ]
      );

      // ⛓️ ON-CHAIN SETTLEMENT: Transfer winnings to winner
      // This calls the smart contract to actually move funds
      // Guard: Skip if already settled on-chain
      if (game.settlement_tx) {
        logger.info(`⛓️  Game ${gameId} already settled on-chain (tx: ${game.settlement_tx}), skipping`);
      } else if (game.is_quick_match) {
        // Quick Match games: Transfer prize directly from admin treasury to winner
        // (No on-chain escrow, so we send HACK directly)
        if (game.winner && game.winner !== '0x0') {
          logger.info(`⛓️  Quick Match game ${gameId} - Transferring prize from treasury to winner`);

          // Calculate prize pool (both players' bets)
          const betAmountMist = BigInt(game.bet_amount);
          const totalPool = betAmountMist * 2n; // Winner takes both bets

          const transferResult = await onChainSettlement.transferPrizeToWinner(
            game.winner,
            totalPool.toString(),
            gameId
          );

          if (transferResult.success) {
            game.settlement_tx = transferResult.digest;
            game.prize_amount = transferResult.prizeAmount;
            logger.info(`✅ Quick Match prize transferred: ${transferResult.digest}`);
          } else {
            logger.warn(`⚠️  Quick Match prize transfer failed: ${transferResult.reason}`);
            game.settlement_error = transferResult.reason;
          }
        } else {
          logger.info(`⛓️  Quick Match game ${gameId} was a draw - no prize transfer needed`);
        }
      } else if (game.onchain_registration_error) {
        // Skip settlement if game was never registered on-chain
        logger.info(`⛓️  Game ${gameId} was not registered on-chain, skipping settlement`);
        logger.info(`   Registration error was: ${game.onchain_registration_error}`);
      } else if (!game.onchain_tx) {
        // Skip if no registration tx recorded (game created before on-chain was enabled)
        logger.info(`⛓️  Game ${gameId} has no on-chain registration, skipping settlement`);
      } else if (reason === 'forfeit' || reason === 'disconnect') {
        // Use forfeit_game for forfeits/disconnects
        const forfeiter = reason === 'forfeit' ? game.forfeit_by :
          (game.player1 === game.winner ? game.player2 : game.player1);
        const settlementResult = await onChainSettlement.forfeitGame(game, forfeiter);
        if (settlementResult.success) {
          game.settlement_tx = settlementResult.digest;
          logger.info(`⛓️  On-chain forfeit recorded: ${settlementResult.digest}`);
        } else {
          logger.warn(`⚠️  On-chain forfeit failed: ${settlementResult.reason}`);
        }
      } else {
        // Use submit_score for normal completions (life_loss, timeout)
        const settlementResult = await onChainSettlement.settleGame(game);
        if (settlementResult.success) {
          game.settlement_tx = settlementResult.digest;
          logger.info(`⛓️  On-chain settlement complete: ${settlementResult.digest}`);
        } else {
          // Log but don't fail - game completes off-chain even if on-chain fails
          logger.warn(`⚠️  On-chain settlement failed: ${settlementResult.reason}`);
          // Store failure reason for debugging
          game.settlement_error = settlementResult.reason;
        }
      }

      // Notify both players - DEBUG: Log socket rooms and emission
      logger.info(`📢 Emitting game:completed to both players...`);
      logger.info(`   Player1 room: player:${game.player1}`);
      logger.info(`   Player2 room: player:${game.player2}`);

      // Check if socket.io is available
      if (!this.io) {
        logger.error(`❌ Socket.io instance not available!`);
      } else {
        // Get socket room info for debugging
        const player1Room = this.io.sockets.adapter.rooms.get(`player:${game.player1}`);
        const player2Room = this.io.sockets.adapter.rooms.get(`player:${game.player2}`);

        logger.info(`   Player1 room sockets: ${player1Room ? player1Room.size : 0}`);
        logger.info(`   Player2 room sockets: ${player2Room ? player2Room.size : 0}`);

        if (!player1Room || player1Room.size === 0) {
          logger.warn(`⚠️  Player1 has no connected sockets in room!`);
        }
        if (!player2Room || player2Room.size === 0) {
          logger.warn(`⚠️  Player2 has no connected sockets in room!`);
        }
      }

      this.io.to(`player:${game.player1}`).emit('game:completed', game);
      this.io.to(`player:${game.player2}`).emit('game:completed', game);
      this.io.emit('game_completed', game);

      logger.info(`✅ game:completed events emitted to both players`);

      // Remove from active games after delay
      setTimeout(() => {
        this.removeGameFromActive(gameId);
        logger.info(`🗑️ Game ${gameId} removed from cache`);
      }, 120000);

      logger.info(`✅ Game instantly completed: ${gameId}, Winner: ${game.winner}`);

      return { success: true, game };
    } catch (error) {
      logger.error('Error instantly finalizing game:', error);
      throw error;
    }
  }

  /**
   * NEW: Finalize game when 60-second timer expires
   * Winner is player with higher score
   */
  async finalizeGameByTimeout(gameId) {
    try {
      const game = this.activeGames.get(gameId);

      if (!game) {
        logger.warn(`Game ${gameId} not found for timeout finalization`);
        return;
      }

      if (game.state === 'completed') {
        logger.info(`Game ${gameId} already completed, skipping timeout`);
        return;
      }

      logger.info(`⏰ Finalizing game ${gameId} by timeout`);

      // Determine winner by score (if both still have lives)
      let winner = null;
      const score1 = game.player1_score || 0;
      const score2 = game.player2_score || 0;

      if (score1 > score2) {
        winner = game.player1;
      } else if (score2 > score1) {
        winner = game.player2;
      }
      // If scores are equal, it's a draw

      game.winner = winner;

      await this.finalizeGameInstant(gameId, 'timeout');

      return { success: true, game };
    } catch (error) {
      logger.error('Error finalizing game by timeout:', error);
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
      await this.supabase.query(
        `
          update multiplayer_games
          set status = 'cancelled',
              state = 'cancelled',
              cancellation_reason = $1
          where game_id = $2
        `,
        [reason, gameId]
      );

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
   * Returns true if verified, false otherwise
   * Non-blocking - logs errors but doesn't throw
   */
  async verifyTransaction(txHash, expectedSender) {
    try {
      if (!txHash) {
        logger.warn('No transaction hash provided for verification');
        return false;
      }

      // Skip verification for simulated transactions (start with 0x, used in development)
      if (txHash.startsWith('0x')) {
        logger.info(`   Simulated transaction detected, skipping verification: ${txHash.substring(0, 20)}...`);
        return true; // Accept simulated transactions in development mode
      }

      logger.info(`   Querying blockchain for tx: ${txHash.substring(0, 20)}...`);

      // Retry logic for blockchain indexing delay
      const maxRetries = 3;
      const retryDelay = 2000; // 2 seconds

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
            if (attempt < maxRetries) {
              logger.info(`   Transaction not indexed yet, retrying in ${retryDelay / 1000}s... (attempt ${attempt}/${maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              continue;
            }
            logger.warn(`   Transaction not found on chain after ${maxRetries} attempts`);
            return false;
          }

          // Verify sender matches
          const sender = tx.transaction?.data?.sender;
          if (sender !== expectedSender) {
            logger.warn(`   Sender mismatch: expected ${expectedSender}, got ${sender}`);
            return false;
          }

          // Verify transaction was successful
          if (tx.effects?.status?.status !== 'success') {
            logger.warn(`   Transaction status: ${tx.effects?.status?.status || 'unknown'}`);
            return false;
          }

          logger.info(`   Transaction verified: sender=${sender}, status=success`);
          return true;
        } catch (err) {
          if (err.message.includes('Could not find') && attempt < maxRetries) {
            logger.info(`   Transaction not indexed yet, retrying in ${retryDelay / 1000}s... (attempt ${attempt}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
          throw err;
        }
      }

      return false;
    } catch (error) {
      // Don't throw - just log and return false
      logger.warn(`   Transaction verification error: ${error.message}`);
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
            room_type: game.room_type, // CRITICAL: Include room_type for filtering
            join_code: game.join_code, // Include for private room matching
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

  // ============================================================
  // QUICK MATCH - Automatic Matchmaking
  // ============================================================

  /**
   * Join the matchmaking queue for Quick Match
   * @param {Object} params
   * @param {string} params.playerAddress - Player's wallet address
   * @param {number} params.betTierId - Bet tier ID (1-4)
   * @param {string} params.txHash - On-chain transaction hash
   * @returns {Object} Queue entry or matched game
   */
  async joinQuickMatchQueue({ playerAddress, betTierId, txHash }) {
    try {
      logger.info(`🎯 Quick Match: ${playerAddress.slice(0, 10)}... joining queue for tier ${betTierId}`);

      // Validate tier
      const tier = this.betTiers.find(t => t.id === betTierId);
      if (!tier) {
        throw new Error('Invalid bet tier');
      }

      // Check if player already in queue (use maybeSingle to avoid error when not found)
      const { rows: existingRows } = await this.supabase.query(
        `
          select *
          from matchmaking_queue
          where player_address = $1
            and status = $2
          limit 1
        `,
        [playerAddress, 'waiting']
      );
      const existingEntry = existingRows[0];

      if (existingEntry) {
        logger.info(`   Player already in queue, returning existing entry`);
        return { success: true, status: 'waiting', queueEntry: existingEntry };
      }

      // Look for an opponent in the same tier
      const { rows: opponentRows } = await this.supabase.query(
        `
          select *
          from matchmaking_queue
          where bet_tier = $1
            and status = $2
            and player_address <> $3
          order by created_at asc
          limit 1
        `,
        [betTierId, 'waiting', playerAddress]
      );
      const opponent = opponentRows[0];

      if (opponent) {
        // Found a match! Create game immediately
        logger.info(`   ✅ MATCHED with ${opponent.player_address.slice(0, 10)}...`);

        // Update opponent's queue entry
        await this.supabase.query(
          `
            update matchmaking_queue
            set status = $1,
                matched_at = $2
            where id = $3
          `,
          ['matched', new Date().toISOString(), opponent.id]
        );

        // Generate a unique game_id for Quick Match (no on-chain create, just register)
        // Use a combination of timestamp and random to avoid collisions
        const quickMatchGameId = Math.floor(Date.now() / 1000) * 1000 + Math.floor(Math.random() * 1000);

        logger.info(`   🎮 Creating Quick Match game with ID: ${quickMatchGameId}`);

        // Create game directly in memory and database (skip the normal createGame flow)
        // Quick Match games are registered on-chain during join, not during create
        const tier = this.betTiers.find(t => t.id === betTierId);
        const betAmountMist = BigInt(Math.floor(tier.amount * 1000000000));

        const game = {
          game_id: quickMatchGameId,
          bet_tier: betTierId,
          bet_amount: betAmountMist.toString(),
          bet_amount_oct: tier.amount,
          player1: opponent.player_address,
          player2: playerAddress,
          player1_score: null,
          player2_score: null,
          player1_lives: 3,
          player2_lives: 3,
          winner: null,
          state: 'countdown',
          room_type: 'public',
          join_code: null,
          countdown_start_at: Date.now(),
          game_start_at: Date.now() + this.config.countdownDuration,
          created_at: new Date().toISOString(),
          started_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + this.config.gameTimeout).toISOString(),
          transaction_hash: opponent.tx_hash,
          join_transaction_hash: txHash,
          verified: true,
          game_timer: null,
          is_quick_match: true, // Flag for Quick Match games
          onchain_tx: null, // Will be set during registration
        };

        // Store in cache first
        this.activeGames.set(quickMatchGameId, game);

        // Store in database (still allow gameplay in memory if DB fails)
        try {
          await this.supabase.query(
            `
              insert into multiplayer_games (
                game_id, bet_tier, bet_amount, pool_amount, status,
                room_type,
                player1_address, player1_tx_hash,
                player2, player2_tx_hash,
                created_at, started_at, expires_at,
                state
              )
              values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            `,
            [
              quickMatchGameId,
              betTierId,
              betAmountMist.toString(),
              (betAmountMist * 2n).toString(),
              // multiplayer_games.status in schema is waiting/active/completed/cancelled/expired.
              // This quick match flow uses in-memory 'countdown' -> 'in_progress',
              // so we store as 'active' to keep it discoverable if needed.
              'active',
              'public',
              opponent.player_address,
              opponent.tx_hash,
              playerAddress,
              txHash,
              game.created_at,
              game.started_at,
              game.expires_at,
              'in_progress',
            ]
          );
        } catch (dbError) {
          logger.error(`   Database error: ${dbError.message}`);
        }

        // Register on-chain (admin_register_game) 
        logger.info(`   ⛓️ Registering Quick Match game ${quickMatchGameId} on-chain...`);
        const registrationResult = await onChainSettlement.registerGame(game);
        if (registrationResult.success) {
          game.onchain_tx = registrationResult.digest;
          this.activeGames.set(quickMatchGameId, game);
          logger.info(`   ✅ On-chain registration: ${registrationResult.digest}`);
        } else {
          logger.warn(`   ⚠️ On-chain registration failed: ${registrationResult.reason}`);
          game.onchain_registration_error = registrationResult.reason;
          this.activeGames.set(quickMatchGameId, game);
        }

        // Start game timer
        const self = this;
        setTimeout(() => {
          const g = self.activeGames.get(quickMatchGameId);
          if (g && g.state === 'countdown') {
            g.state = 'in_progress';
            self.activeGames.set(quickMatchGameId, g);
            logger.info(`▶️ Quick Match game ${quickMatchGameId} now IN PROGRESS`);

            self.io.to(`player:${g.player1}`).emit('game:started', { game_id: quickMatchGameId });
            self.io.to(`player:${g.player2}`).emit('game:started', { game_id: quickMatchGameId });
          }
        }, this.config.countdownDuration);

        // Start 60-second game timer
        setTimeout(() => {
          game.game_timer = setTimeout(async () => {
            logger.info(`⏰ 60-second timer expired for Quick Match game ${quickMatchGameId}`);
            await self.finalizeGameByTimeout(quickMatchGameId);
          }, 60000);
        }, this.config.countdownDuration);

        // Create clean game data for socket emission
        const gameData = {
          game_id: game.game_id,
          bet_tier: game.bet_tier,
          bet_amount: game.bet_amount,
          bet_amount_oct: game.bet_amount_oct,
          player1: game.player1,
          player2: game.player2,
          player1_score: game.player1_score,
          player2_score: game.player2_score,
          player1_lives: game.player1_lives,
          player2_lives: game.player2_lives,
          winner: game.winner,
          state: game.state,
          room_type: game.room_type,
          countdown_start_at: game.countdown_start_at,
          game_start_at: game.game_start_at,
          countdown_duration: this.config.countdownDuration,
          created_at: game.created_at,
          started_at: game.started_at,
        };

        // Notify players of game join
        this.io.to(`player:${opponent.player_address}`).emit('game:joined', gameData);
        this.io.to(`player:${playerAddress}`).emit('game:joined', gameData);

        // Notify both players via Socket.IO
        this.io.to(`player:${opponent.player_address}`).emit('quickmatch:matched', {
          game_id: game.game_id,
          opponent: playerAddress,
          bet_tier: betTierId,
          message: 'Match found! Game starting...'
        });

        this.io.to(`player:${playerAddress}`).emit('quickmatch:matched', {
          game_id: game.game_id,
          opponent: opponent.player_address,
          bet_tier: betTierId,
          message: 'Match found! Game starting...'
        });

        logger.info(`   🎮 Game ${game.game_id} created from Quick Match`);

        return {
          success: true,
          status: 'matched',
          game: gameData,
          opponent: opponent.player_address
        };
      }

      // No opponent found, add to queue (use upsert to handle race conditions)
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min TTL
      const { rows: queueRows } = await this.supabase.query(
        `
          insert into matchmaking_queue (player_address, bet_tier, tx_hash, status, expires_at)
          values ($1, $2, $3, 'waiting', $4)
          on conflict (player_address) do update
            set bet_tier = excluded.bet_tier,
                tx_hash = excluded.tx_hash,
                status = 'waiting',
                expires_at = excluded.expires_at
          returning *
        `,
        [playerAddress, betTierId, txHash, expiresAt]
      );
      const queueEntry = queueRows[0];

      logger.info(`   ⏳ Added to queue, waiting for opponent...`);

      // Notify player they're in queue
      this.io.to(`player:${playerAddress}`).emit('quickmatch:waiting', {
        bet_tier: betTierId,
        queue_position: 1, // Simplified - could calculate actual position
        message: 'Searching for opponent...'
      });

      return { success: true, status: 'waiting', queueEntry };

    } catch (error) {
      logger.error(`Quick Match join error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Leave the matchmaking queue
   * @param {string} playerAddress - Player's wallet address
   */
  async leaveQuickMatchQueue(playerAddress) {
    try {
      logger.info(`🚪 Quick Match: ${playerAddress.slice(0, 10)}... leaving queue`);

      await this.supabase.query(
        `
          delete from matchmaking_queue
          where player_address = $1
            and status = $2
        `,
        [playerAddress, 'waiting']
      );

      // Notify player they left
      this.io.to(`player:${playerAddress}`).emit('quickmatch:cancelled', {
        message: 'Left matchmaking queue'
      });

      return { success: true };

    } catch (error) {
      logger.error(`Quick Match leave error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get player's current queue status
   * @param {string} playerAddress - Player's wallet address
   */
  async getQuickMatchStatus(playerAddress) {
    try {
      const { rows } = await this.supabase.query(
        `
          select *
          from matchmaking_queue
          where player_address = $1
            and status = $2
          limit 1
        `,
        [playerAddress, 'waiting']
      );
      const queueEntry = rows[0];

      if (!queueEntry) {
        return { success: true, inQueue: false };
      }

      // Get queue position
      const { rows: countRows } = await this.supabase.query(
        `
          select count(*)::int as count
          from matchmaking_queue
          where bet_tier = $1
            and status = 'waiting'
            and created_at < $2
        `,
        [queueEntry.bet_tier, queueEntry.created_at]
      );
      const count = countRows[0]?.count || 0;

      return {
        success: true,
        inQueue: true,
        queueEntry,
        position: (count || 0) + 1
      };

    } catch (error) {
      logger.error(`Quick Match status error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cleanup expired queue entries (called periodically)
   */
  async cleanupExpiredQueueEntries() {
    try {
      const { rows: expired } = await this.supabase.query(
        `
          delete from matchmaking_queue
          where expires_at < NOW()
            and status = 'waiting'
          returning *
        `
      );

      if (expired && expired.length > 0) {
        logger.info(`🧹 Cleaned up ${expired.length} expired queue entries`);

        // Notify expired players
        for (const entry of expired) {
          this.io.to(`player:${entry.player_address}`).emit('quickmatch:expired', {
            message: 'Matchmaking timed out. Please try again.'
          });
        }
      }
    } catch (error) {
      logger.error(`Queue cleanup error: ${error.message}`);
    }
  }

  // ============================================================
  // QUICK EMOTES (Clash Royale style)
  // ============================================================

  /**
   * Available emotes for in-game reactions
   */
  static EMOTES = {
    laugh: { emoji: '😂', name: 'Laugh' },
    angry: { emoji: '😡', name: 'Angry' },
    thumbsup: { emoji: '👍', name: 'Thumbs Up' },
    thumbsdown: { emoji: '👎', name: 'Thumbs Down' },
    fire: { emoji: '🔥', name: 'Fire' },
    skull: { emoji: '💀', name: 'Skull' },
    wave: { emoji: '👋', name: 'Wave' },
    gg: { emoji: 'GG', name: 'Good Game' }
  };

  /**
   * Send an emote to opponent during a game
   * @param {number} gameId - Game ID
   * @param {string} senderAddress - Sender's wallet address
   * @param {string} emoteType - Type of emote (e.g., 'laugh', 'angry', 'gg')
   */
  sendEmote(gameId, senderAddress, emoteType) {
    const game = this.activeGames.get(gameId);

    if (!game) {
      logger.warn(`Emote failed: Game ${gameId} not found`);
      return { success: false, error: 'Game not found' };
    }

    // Verify sender is in the game
    if (game.player1 !== senderAddress && game.player2 !== senderAddress) {
      logger.warn(`Emote failed: ${senderAddress.slice(0, 10)}... not in game ${gameId}`);
      return { success: false, error: 'Not in this game' };
    }

    // Validate emote type
    if (!GameManager.EMOTES[emoteType]) {
      logger.warn(`Emote failed: Invalid emote type "${emoteType}"`);
      return { success: false, error: 'Invalid emote' };
    }

    // Get opponent
    const opponent = game.player1 === senderAddress ? game.player2 : game.player1;

    // Get emote data
    const emote = GameManager.EMOTES[emoteType];

    // Broadcast emote to opponent
    this.io.to(`player:${opponent}`).emit('emote:receive', {
      game_id: gameId,
      sender: senderAddress,
      emoteType: emoteType,
      emoji: emote.emoji,
      name: emote.name,
      timestamp: Date.now()
    });

    // Also confirm to sender
    this.io.to(`player:${senderAddress}`).emit('emote:sent', {
      game_id: gameId,
      emoteType: emoteType,
      emoji: emote.emoji
    });

    logger.info(`${emote.emoji} Emote: ${senderAddress.slice(0, 10)}... sent "${emote.name}" to ${opponent.slice(0, 10)}...`);

    return { success: true, emote: emote };
  }

  /**
   * Get list of available emotes
   */
  getAvailableEmotes() {
    return Object.entries(GameManager.EMOTES).map(([key, value]) => ({
      type: key,
      emoji: value.emoji,
      name: value.name
    }));
  }

  /**
   * Setup emote socket handlers for a player
   */
  setupEmoteHandlers(socket, walletAddress) {
    socket.on('emote:send', (data) => {
      if (!walletAddress || !data.gameId || !data.emoteType) {
        socket.emit('emote:error', { error: 'Invalid emote request' });
        return;
      }

      const result = this.sendEmote(data.gameId, walletAddress, data.emoteType);
      if (!result.success) {
        socket.emit('emote:error', { error: result.error });
      }
    });

    // Send available emotes on request
    socket.on('emote:list', () => {
      socket.emit('emote:list', { emotes: this.getAvailableEmotes() });
    });
  }
}
