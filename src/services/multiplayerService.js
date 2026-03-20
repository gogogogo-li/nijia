import io from 'socket.io-client';
import onechainService from './onechainService';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';

/**
 * Secure Multiplayer Service for OneChain
 * All game logic handled by backend - frontend only sends events
 */
class MultiplayerService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.authenticated = false;
    this.walletAddress = null;
    this.currentGameId = null;
    this.gameEvents = []; // Track events for backend validation

    this.betTiers = [
      { id: 1, amount: 0.1, label: 'Casual', description: 'Perfect for beginners', color: '#4CAF50' },
      { id: 2, amount: 0.5, label: 'Standard', description: 'Most popular choice', color: '#FFD700' },
      { id: 3, amount: 1.0, label: 'Competitive', description: 'For serious players', color: '#FF6B6B' },
      { id: 4, amount: 5.0, label: 'High Stakes', description: 'Big risk, big reward', color: '#9D4EDD' },
    ];

    this.walletSignature = null;
    this.walletAuthMessage = null;
    this.jwtToken = null;

    this.listeners = {
      onGameCreated: null,
      onGameJoined: null,
      onGameStarted: null,
      onGameCompleted: null,
      onGameCancelled: null,
      onOpponentFinished: null,
      onOpponentFinishedFirst: null,
      onGamesListUpdate: null,
      onError: null
    };
  }

  /**
   * Connect to multiplayer server.
   * Accepts an optional `options.token` for JWT-based auth (Telegram).
   */
  async connect(walletAddress, signature = null, authMessage = null, options = {}) {
    this.walletAddress = walletAddress;
    this.walletSignature = signature;
    this.walletAuthMessage = authMessage;
    if (options.token) this.jwtToken = options.token;

    if (this.connected) {
      console.log('[TG-AUTH] multiplayerService.connect: already connected, skipping');
      return;
    }

    const authPayload = this.jwtToken
      ? { token: this.jwtToken, address: walletAddress }
      : { address: walletAddress, signature };

    console.log('[TG-AUTH] multiplayerService.connect:', {
      walletAddress,
      authMode: this.jwtToken ? 'JWT' : 'wallet-signature',
      hasToken: !!this.jwtToken,
      hasSignature: !!signature,
    });

    this.socket = io(API_BASE_URL, {
      auth: authPayload,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    this.setupSocketListeners();

    return new Promise((resolve, reject) => {
      this.socket.on('connect', () => {
        console.log('[TG-AUTH] Socket connected OK, id:', this.socket.id);
        this.connected = true;
        this.authenticated = !!(signature || this.jwtToken);
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('[TG-AUTH] Socket connect_error:', error.message || error);
        reject(error);
      });

      this.socket.on('disconnect', (reason) => {
        console.warn('[TG-AUTH] Socket disconnected, reason:', reason);
        this.connected = false;
      });
    });
  }

  /**
   * Build auth headers for authenticated API requests
   */
  /**
   * Ensure authentication credentials are available, requesting signature on demand if needed
   */
  async _ensureAuth() {
    const sig = this.walletSignature || onechainService.sessionToken;
    if (!sig) {
      const result = await onechainService.ensureSignature();
      if (result.signature) {
        this.walletSignature = result.signature;
        this.walletAuthMessage = result.authMessage;
      }
    }
  }

  _authHeaders() {
    const headers = {};
    headers['Content-Type'] = 'application/json';

    if (this.jwtToken) {
      headers['Authorization'] = `Bearer ${this.jwtToken}`;
      return headers;
    }

    const address = this.walletAddress || onechainService.walletAddress;
    const signature = this.walletSignature || onechainService.sessionToken;
    const message = this.walletAuthMessage || onechainService.authMessage;

    if (address && typeof address === 'string' && address.length > 0) {
      headers['X-Wallet-Address'] = String(address).replace(/[\r\n]+/g, ' ');
    }
    if (signature) {
      const sigStr = typeof signature === 'string' ? signature :
                     (signature instanceof Uint8Array ? btoa(String.fromCharCode(...signature)) :
                     JSON.stringify(signature));
      if (sigStr.length > 0) {
        headers['X-Wallet-Signature'] = String(sigStr).replace(/[\r\n]+/g, ' ');
      }
    }
    if (message && typeof message === 'string' && message.length > 0) {
      headers['X-Wallet-Message'] = btoa(unescape(encodeURIComponent(message)));
    }
    return headers;
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.authenticated = false;
    }
  }

  /**
   * Check if connected to server
   */
  isConnected() {
    return this.connected && this.socket && this.socket.connected;
  }

  /**
   * Get the socket instance for direct event listening
   */
  getSocket() {
    return this.socket;
  }

  /**
   * Setup socket event listeners
   */
  setupSocketListeners() {
    this.socket.on('game:created', (game) => {
      console.log('🎮 Game created:', game.game_id);
      if (this.listeners.onGameCreated) {
        this.listeners.onGameCreated(game);
      }
    });

    this.socket.on('game:joined', (game) => {
      console.log('👥 Game joined:', game.game_id);
      if (this.listeners.onGameJoined) {
        this.listeners.onGameJoined(game);
      }
    });

    this.socket.on('game:started', ({ game_id }) => {
      console.log('🚀 Game started:', game_id);
      if (this.listeners.onGameStarted) {
        this.listeners.onGameStarted(game_id);
      }
    });

    this.socket.on('game:completed', (game) => {
      console.log('🏁 [Socket] game:completed received:', game.game_id, 'Winner:', game.winner);
      if (this.listeners.onGameCompleted) {
        this.listeners.onGameCompleted(game);
      }
    });

    // FALLBACK: Also listen for global broadcast (game_completed without colon)
    this.socket.on('game_completed', (game) => {
      console.log('🏁 [Socket] game_completed (global) received:', game.game_id, 'Winner:', game.winner);
      if (this.listeners.onGameCompleted) {
        this.listeners.onGameCompleted(game);
      }
    });

    this.socket.on('game:cancelled', ({ game_id, reason }) => {
      console.log('❌ Game cancelled:', game_id, reason);
      if (this.listeners.onGameCancelled) {
        this.listeners.onGameCancelled(game_id, reason);
      }
    });

    this.socket.on('game:opponent_finished', ({ game_id, player }) => {
      console.log('⏰ Opponent finished:', game_id);
      if (this.listeners.onOpponentFinished) {
        this.listeners.onOpponentFinished(game_id, player);
      }
    });

    // NEW: Listen for real-time life updates
    this.socket.on('game:lives_update', (data) => {
      console.log('💚 Lives updated:', data);
      if (this.listeners.onLivesUpdate) {
        this.listeners.onLivesUpdate(data);
      }
    });

    this.socket.on('games:list', (games) => {
      if (this.listeners.onGamesListUpdate) {
        this.listeners.onGamesListUpdate(games);
      }
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      if (this.listeners.onError) {
        this.listeners.onError(error);
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      this.connected = false;
    });
  }

  /**
   * Subscribe to available games updates
   */
  subscribeToGames(betTier = null) {
    if (this.socket && this.connected) {
      this.socket.emit('subscribe:games', betTier);
    }
  }

  /**
   * Unsubscribe from games updates
   */
  unsubscribeFromGames(betTier = null) {
    if (this.socket && this.connected) {
      this.socket.emit('unsubscribe:games', betTier);
    }
  }

  /**
   * Get available games from API
   */
  async getAvailableGames(betTier = null) {
    try {
      const url = betTier
        ? `${API_BASE_URL}/api/multiplayer/games/available?betTier=${betTier}`
        : `${API_BASE_URL}/api/multiplayer/games/available`;

      const response = await fetch(url, { headers: this._authHeaders() });
      const data = await response.json();

      return data.games || [];
    } catch (error) {
      console.error('Error fetching available games:', error);
      return [];
    }
  }

  /**
   * Create a new multiplayer game
   * Backend handles all validation and creation logic
   * @param {number} betTierId - Bet tier ID (1-4)
   * @param {string} transactionHash - On-chain transaction hash
   * @param {string} roomType - 'public' or 'private' (default: 'public')
   */
  async createGame(betTierId, transactionHash, roomType = 'public') {
    try {
      // Ensure we have a valid signature before making authenticated request
      await this._ensureAuth();

      const response = await fetch(`${API_BASE_URL}/api/multiplayer/games/create`, {
        method: 'POST',
        headers: this._authHeaders(),
        body: JSON.stringify({ betTierId, transactionHash, roomType })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to create game');
      }

      this.currentGameId = data.game.game_id;
      this.gameEvents = [];

      console.log(`🎮 Game created (${roomType})`, data.game.join_code ? `Code: ${data.game.join_code}` : '');

      return data;
    } catch (error) {
      console.error('Error creating game:', error);
      throw error;
    }
  }

  /**
   * Join an existing game
   * Backend handles validation
   */
  async joinGame(gameId, transactionHash) {
    try {
      console.log('🎮 Joining game:', gameId, 'with wallet:', this.walletAddress);

      await this._ensureAuth();

      const response = await fetch(`${API_BASE_URL}/api/multiplayer/games/${gameId}/join`, {
        method: 'POST',
        headers: this._authHeaders(),
        body: JSON.stringify({
          transactionHash
        })
      });

      const data = await response.json();

      if (!data.success) {
        // Throw error with user-friendly message
        const errorMsg = data.error || 'Failed to join game';
        throw new Error(errorMsg);
      }

      this.currentGameId = gameId;
      this.gameEvents = [];

      return data;
    } catch (error) {
      console.error('Error joining game:', error);
      // Re-throw with the original message for UI display
      throw error;
    }
  }

  /**
   * Join a private game using a join code
   * @param {string} joinCode - 6-character join code
   * @param {string} transactionHash - On-chain transaction hash
   */
  async joinByCode(joinCode, transactionHash) {
    try {
      const code = joinCode.toUpperCase();
      console.log('🔑 Joining game by code:', code, 'with wallet:', this.walletAddress);

      const response = await fetch(`${API_BASE_URL}/api/multiplayer/games/join-code/${code}`, {
        method: 'POST',
        headers: this._authHeaders(),
        body: JSON.stringify({
          transactionHash
        })
      });

      const data = await response.json();

      if (!data.success) {
        const errorMsg = data.error || 'Failed to join game';
        throw new Error(errorMsg);
      }

      this.currentGameId = data.game.game_id;
      this.gameEvents = [];

      console.log('✅ Joined private game:', this.currentGameId);

      return data;
    } catch (error) {
      console.error('Error joining by code:', error);
      throw error;
    }
  }

  /**
   * Record game event (for backend validation)
   * Frontend tracks events, backend validates and calculates score
   */
  recordEvent(eventType, data) {
    if (!this.currentGameId) {
      return;
    }

    const event = {
      type: eventType,
      timestamp: Date.now(),
      ...data
    };

    this.gameEvents.push(event);
  }

  /**
   * Submit final score to backend
   * Backend validates events and calculates actual score
   */
  async submitScore(finalScore) {
    try {
      if (!this.currentGameId) {
        throw new Error('No active game');
      }

      const response = await fetch(`${API_BASE_URL}/api/multiplayer/games/${this.currentGameId}/score`, {
        method: 'POST',
        headers: this._authHeaders(),
        body: JSON.stringify({
          finalScore,
          gameEvents: this.gameEvents
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to submit score');
      }

      console.log('✅ Score validated by server:', data.validatedScore);

      return data;
    } catch (error) {
      console.error('Error submitting score:', error);
      throw error;
    }
  }

  /**
   * NEW: Update player lives in real-time
   * Called whenever a player loses a life
   */
  async updateLives(lives, score) {
    try {
      if (!this.currentGameId) {
        console.warn('No active game for life update');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/multiplayer/games/${this.currentGameId}/lives`, {
        method: 'POST',
        headers: this._authHeaders(),
        body: JSON.stringify({
          lives,
          score
        })
      });

      const data = await response.json();

      if (!data.success) {
        console.error('Failed to update lives:', data.error);
      } else {
        console.log(`💚 Lives updated: ${lives}`);
      }

      return data;
    } catch (error) {
      console.error('Error updating lives:', error);
      // Don't throw - this is a non-critical update
    }
  }

  /**
   * Cancel a game (only creator can cancel)
   */
  async cancelGame(gameId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/multiplayer/games/${gameId}/cancel`, {
        method: 'POST',
        headers: this._authHeaders()
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to cancel game');
      }

      if (this.currentGameId === gameId) {
        this.currentGameId = null;
        this.gameEvents = [];
      }

      return data;
    } catch (error) {
      console.error('Error cancelling game:', error);
      throw error;
    }
  }

  /**
   * Get game details
   */
  async getGame(gameId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/multiplayer/games/${gameId}`, {
        headers: this._authHeaders()
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to get game');
      }

      return data.game;
    } catch (error) {
      console.error('Error getting game:', error);
      throw error;
    }
  }

  /**
   * Get player's active games
   */
  async getPlayerGames(address = null) {
    try {
      const playerAddress = address || this.walletAddress;

      const response = await fetch(`${API_BASE_URL}/api/multiplayer/player/${playerAddress}/games`, {
        headers: this._authHeaders()
      });

      const data = await response.json();

      return data.games || [];
    } catch (error) {
      console.error('Error getting player games:', error);
      return [];
    }
  }

  /**
   * Get bet tiers
   */
  getBetTiers() {
    return this.betTiers;
  }

  /**
   * Get multiplayer stats
   */
  async getStats() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/multiplayer/stats`);
      const data = await response.json();

      return data.stats || {};
    } catch (error) {
      console.error('Error getting stats:', error);
      return {};
    }
  }

  /**
   * Get player statistics
   */
  async getPlayerStats(address) {
    try {
      const playerAddress = address || this.walletAddress;
      if (!playerAddress) {
        return {
          totalGames: 0,
          wins: 0,
          losses: 0,
          earnings: 0,
          winRate: 0
        };
      }

      const response = await fetch(`${API_BASE_URL}/api/players/${playerAddress}/stats`);
      const data = await response.json();

      return data.stats || {
        totalGames: 0,
        wins: 0,
        losses: 0,
        earnings: 0,
        winRate: 0
      };
    } catch (error) {
      console.error('Error getting player stats:', error);
      return {
        totalGames: 0,
        wins: 0,
        losses: 0,
        earnings: 0,
        winRate: 0
      };
    }
  }

  /**
   * Set event listeners
   */
  setListeners(listeners) {
    this.listeners = { ...this.listeners, ...listeners };
  }

  /**
   * Clear current game
   */
  clearCurrentGame() {
    this.currentGameId = null;
    this.gameEvents = [];
  }

  /**
   * Format wallet address for display
   */
  formatAddress(address) {
    if (!address) return '';
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  /**
   * Compare two wallet addresses (case-insensitive)
   */
  compareAddresses(addr1, addr2) {
    if (!addr1 || !addr2) return false;
    return addr1.toLowerCase() === addr2.toLowerCase();
  }

  // ============================================================
  // QUICK MATCH - Automatic Matchmaking Methods
  // ============================================================

  /**
   * Join the matchmaking queue for Quick Match
   * @param {number} betTierId - Bet tier ID (1-4)
   * @param {string} transactionHash - On-chain transaction hash
   * @returns {Object} Queue status or matched game
   */
  async joinQuickMatch(betTierId, transactionHash) {
    try {
      console.log(`🎯 Quick Match: Joining queue for tier ${betTierId}`);

      const response = await fetch(`${API_BASE_URL}/api/multiplayer/quickmatch/join`, {
        method: 'POST',
        headers: this._authHeaders(),
        body: JSON.stringify({
          betTierId,
          transactionHash
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to join matchmaking');
      }

      // If matched immediately, set current game
      if (data.status === 'matched' && data.game) {
        this.currentGameId = data.game.game_id;
        this.gameEvents = [];
        console.log(`✅ Quick Match: Matched! Game ${this.currentGameId}`);
      } else {
        console.log(`⏳ Quick Match: Waiting for opponent...`);
      }

      return data;
    } catch (error) {
      console.error('Quick Match join error:', error);
      throw error;
    }
  }

  /**
   * Leave the matchmaking queue
   */
  async leaveQuickMatch() {
    try {
      console.log(`🚪 Quick Match: Leaving queue`);

      const response = await fetch(`${API_BASE_URL}/api/multiplayer/quickmatch/leave`, {
        method: 'POST',
        headers: this._authHeaders()
      });

      const data = await response.json();

      return data;
    } catch (error) {
      console.error('Quick Match leave error:', error);
      throw error;
    }
  }

  /**
   * Get current queue status
   */
  async getQuickMatchStatus() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/multiplayer/quickmatch/status`, {
        headers: this._authHeaders()
      });

      const data = await response.json();

      return data;
    } catch (error) {
      console.error('Quick Match status error:', error);
      return { success: false, inQueue: false };
    }
  }

  /**
   * Setup Quick Match socket listeners
   * Call this after connecting to handle matchmaking events
   */
  setupQuickMatchListeners(callbacks = {}) {
    if (!this.socket) {
      console.warn('Socket not connected, cannot setup Quick Match listeners');
      return;
    }

    // Matched - game starting
    this.socket.on('quickmatch:matched', (data) => {
      console.log('🎮 Quick Match: MATCHED!', data);
      this.currentGameId = data.game_id;
      this.gameEvents = [];
      if (callbacks.onMatched) {
        callbacks.onMatched(data);
      }
    });

    // Waiting in queue
    this.socket.on('quickmatch:waiting', (data) => {
      console.log('⏳ Quick Match: Waiting...', data);
      if (callbacks.onWaiting) {
        callbacks.onWaiting(data);
      }
    });

    // Cancelled
    this.socket.on('quickmatch:cancelled', (data) => {
      console.log('❌ Quick Match: Cancelled', data);
      if (callbacks.onCancelled) {
        callbacks.onCancelled(data);
      }
    });

    // Expired (timed out)
    this.socket.on('quickmatch:expired', (data) => {
      console.log('⏰ Quick Match: Expired', data);
      if (callbacks.onExpired) {
        callbacks.onExpired(data);
      }
    });
  }

  // ============================================================
  // REQ-P2-004: ROOM MANAGEMENT (2-4 Players)
  // ============================================================

  /**
   * Create a multiplayer room (2-4 players)
   * @param {number} betTierId - Bet tier ID (1-4)
   * @param {number} maxPlayers - Max players in room (2-4)
   * @param {string} transactionHash - On-chain transaction hash
   */
  async createRoom(betTierId, maxPlayers, transactionHash) {
    try {
      console.log(`🏠 Creating room: tier ${betTierId}, max ${maxPlayers} players`);

      const response = await fetch(`${API_BASE_URL}/api/rooms/create`, {
        method: 'POST',
        headers: this._authHeaders(),
        body: JSON.stringify({
          betTierId,
          maxPlayers,
          transactionHash
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to create room');
      }

      this.currentRoomId = data.room.id;
      console.log(`✅ Room created: ${data.room.roomCode}`);

      return data;
    } catch (error) {
      console.error('Error creating room:', error);
      throw error;
    }
  }

  /**
   * Join a room by room code
   * @param {string} roomCode - Room code (e.g., "ROOM-1234")
   * @param {string} transactionHash - On-chain transaction hash
   */
  async joinRoom(roomCode, transactionHash) {
    try {
      console.log(`🚪 Joining room: ${roomCode}`);

      const response = await fetch(`${API_BASE_URL}/api/rooms/join/${roomCode}`, {
        method: 'POST',
        headers: this._authHeaders(),
        body: JSON.stringify({
          transactionHash
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to join room');
      }

      this.currentRoomId = data.room.id;
      console.log(`✅ Joined room: ${roomCode} as player #${data.joinOrder}`);

      // Join socket room for real-time updates
      if (this.socket) {
        this.socket.emit('join:room', { roomId: data.room.id });
      }

      return data;
    } catch (error) {
      console.error('Error joining room:', error);
      throw error;
    }
  }

  /**
   * Set player ready status in a room
   * @param {string} roomId - Room UUID
   */
  async setPlayerReady(roomId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/ready`, {
        method: 'POST',
        headers: this._authHeaders()
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to set ready status');
      }

      console.log(`✅ Ready status set. All ready: ${data.allReady}`);

      return data;
    } catch (error) {
      console.error('Error setting ready:', error);
      throw error;
    }
  }

  /**
   * Update score in a room
   * @param {string} roomId - Room UUID
   * @param {number} score - Current score
   * @param {number} lives - Current lives
   */
  async updateRoomScore(roomId, score, lives) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/score`, {
        method: 'POST',
        headers: this._authHeaders(),
        body: JSON.stringify({ score, lives })
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error updating room score:', error);
      // Non-critical, don't throw
    }
  }

  /**
   * Record a super fruit hit (REQ-P2-005 contribution scoring)
   * @param {string} roomId - Room UUID
   * @param {object} hitData - Hit information
   */
  async recordSuperFruitHit(roomId, hitData) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/super-fruit-hit`, {
        method: 'POST',
        headers: this._authHeaders(),
        body: JSON.stringify(hitData)
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error recording super fruit hit:', error);
      // Non-critical, don't throw
      return { success: false };
    }
  }

  /**
   * Get room details
   * @param {string} roomId - Room UUID
   */
  async getRoomDetails(roomId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}`, {
        headers: this._authHeaders()
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to get room');
      }

      return data.room;
    } catch (error) {
      console.error('Error getting room:', error);
      throw error;
    }
  }

  /**
   * Get room leaderboard
   * @param {string} roomId - Room UUID
   */
  async getRoomLeaderboard(roomId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/leaderboard`, {
        headers: this._authHeaders()
      });

      const data = await response.json();
      return data.leaderboard || [];
    } catch (error) {
      console.error('Error getting room leaderboard:', error);
      return [];
    }
  }

  /**
   * Get available rooms for a bet tier
   * @param {number} betTierId - Bet tier ID (1-4)
   */
  async getAvailableRooms(betTierId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/available/${betTierId}`, {
        headers: this._authHeaders()
      });

      const data = await response.json();
      return data.rooms || [];
    } catch (error) {
      console.error('Error getting available rooms:', error);
      return [];
    }
  }

  /**
   * Setup room socket listeners
   * @param {object} callbacks - Event callbacks
   */
  setupRoomListeners(callbacks = {}) {
    if (!this.socket) {
      console.warn('Socket not connected, cannot setup room listeners');
      return;
    }

    // Player joined room
    this.socket.on('player:joined', (data) => {
      console.log('👤 Player joined room:', data);
      if (callbacks.onPlayerJoined) callbacks.onPlayerJoined(data);
    });

    // Player ready
    this.socket.on('player:ready', (data) => {
      console.log('✅ Player ready:', data);
      if (callbacks.onPlayerReady) callbacks.onPlayerReady(data);
    });

    // Player left
    this.socket.on('player:left', (data) => {
      console.log('👋 Player left:', data);
      if (callbacks.onPlayerLeft) callbacks.onPlayerLeft(data);
    });

    // Countdown started
    this.socket.on('room:countdown', (data) => {
      console.log('⏱️ Countdown:', data);
      if (callbacks.onCountdown) callbacks.onCountdown(data);
    });

    // Game start
    this.socket.on('game:start', (data) => {
      console.log('🎮 Game start:', data);
      if (callbacks.onGameStart) callbacks.onGameStart(data);
    });

    // Score update
    this.socket.on('score:update', (data) => {
      if (callbacks.onScoreUpdate) callbacks.onScoreUpdate(data);
    });

    // Super fruit hit
    this.socket.on('fruit:hit', (data) => {
      if (callbacks.onFruitHit) callbacks.onFruitHit(data);
    });

    // Super fruit destroyed
    this.socket.on('fruit:destroyed', (data) => {
      if (callbacks.onFruitDestroyed) callbacks.onFruitDestroyed(data);
    });

    // === SYNCHRONIZED MULTIPLAYER EVENTS ===

    // Server spawns item batch
    this.socket.on('sync:spawn', (data) => {
      console.log('🍎 Sync spawn:', data.pattern, data.items?.length);
      if (callbacks.onSyncSpawn) callbacks.onSyncSpawn(data);
    });

    // Item was slashed by someone
    this.socket.on('sync:slashed', (data) => {
      console.log('⚔️ Sync slashed:', data.itemId, 'by', data.slashedBy);
      if (callbacks.onSyncSlashed) callbacks.onSyncSlashed(data);
    });

    // Milestone reached
    this.socket.on('sync:milestone', (data) => {
      console.log('🏆 Milestone:', data.milestone, data.message);
      if (callbacks.onSyncMilestone) callbacks.onSyncMilestone(data);
    });

    // Bomb hit
    this.socket.on('sync:bomb', (data) => {
      console.log('💣 Bomb hit:', data.playerAddress);
      if (callbacks.onSyncBomb) callbacks.onSyncBomb(data);
    });

    // Game end (winner declared)
    this.socket.on('game:end', (data) => {
      console.log('🏁 Game end:', data.winner, data.reason);
      if (callbacks.onGameEnd) callbacks.onGameEnd(data);
    });
  }

  /**
   * Clear room listeners
   */
  clearRoomListeners() {
    if (!this.socket) return;

    this.socket.off('player:joined');
    this.socket.off('player:ready');
    this.socket.off('player:left');
    this.socket.off('room:countdown');
    this.socket.off('game:start');
    this.socket.off('score:update');
    this.socket.off('fruit:hit');
    this.socket.off('fruit:destroyed');
    this.socket.off('sync:spawn');
    this.socket.off('sync:slashed');
    this.socket.off('sync:milestone');
    this.socket.off('sync:bomb');
    this.socket.off('game:end');
  }

  // ============================================================
  // SYNCHRONIZED MULTIPLAYER ACTIONS
  // ============================================================

  /**
   * Attempt to slash an item (first to slash wins)
   * @param {string} roomId - Room ID
   * @param {string} itemId - Item ID to slash
   */
  async attemptSlash(roomId, itemId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/slash`, {
        method: 'POST',
        headers: this._authHeaders(),
        body: JSON.stringify({
          itemId,
          timestamp: Date.now()
        })
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error attempting slash:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Request server to spawn a new batch (for testing)
   * In production, server controls spawn timing
   * @param {string} roomId - Room ID
   */
  async requestSpawnBatch(roomId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/spawn-batch`, {
        method: 'POST',
        headers: this._authHeaders()
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error requesting spawn:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Join room's socket channel
   * @param {string} roomId - Room ID
   */
  joinRoomChannel(roomId) {
    if (this.socket && this.connected) {
      this.socket.emit('room:join', { roomId });
      console.log(`📡 Joined room channel: room:${roomId}`);
    }
  }

  /**
   * Leave room's socket channel
   * @param {string} roomId - Room ID
   */
  leaveRoomChannel(roomId) {
    if (this.socket && this.connected) {
      this.socket.emit('room:leave', { roomId });
      console.log(`📡 Left room channel: room:${roomId}`);
    }
  }
}

// Export singleton instance
const multiplayerService = new MultiplayerService();
export default multiplayerService;


