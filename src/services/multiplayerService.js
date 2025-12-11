import io from 'socket.io-client';

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
   * Connect to multiplayer server
   */
  async connect(walletAddress, signature = null) {
    if (this.connected) {
      return;
    }
    
    this.walletAddress = walletAddress;
    console.log('🔌 Connecting to multiplayer with wallet:', walletAddress);
    
    this.socket = io(API_BASE_URL, {
      auth: {
        address: walletAddress,
        signature
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    
    this.setupSocketListeners();
    
    return new Promise((resolve, reject) => {
      this.socket.on('connect', () => {
        console.log('✅ Connected to multiplayer server');
        this.connected = true;
        this.authenticated = !!signature;
        resolve();
      });
      
      this.socket.on('connect_error', (error) => {
        console.error('❌ Connection error:', error);
        reject(error);
      });
    });
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
      console.log('🏁 Game completed:', game.game_id, 'Winner:', game.winner);
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
      
      const headers = {};
      if (this.walletAddress) {
        headers['X-Wallet-Address'] = this.walletAddress;
      }
      
      const response = await fetch(url, { headers });
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
   */
  async createGame(betTierId, transactionHash) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/multiplayer/games/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Address': this.walletAddress
        },
        body: JSON.stringify({
          betTierId,
          transactionHash
        })
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to create game');
      }
      
      this.currentGameId = data.game.game_id;
      this.gameEvents = [];
      
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
      
      const response = await fetch(`${API_BASE_URL}/api/multiplayer/games/${gameId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Address': this.walletAddress
        },
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
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Address': this.walletAddress
        },
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
   * Cancel a game (only creator can cancel)
   */
  async cancelGame(gameId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/multiplayer/games/${gameId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Address': this.walletAddress
        }
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
        headers: {
          'X-Wallet-Address': this.walletAddress
        }
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
        headers: {
          'X-Wallet-Address': this.walletAddress
        }
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
}

// Export singleton instance
const multiplayerService = new MultiplayerService();
export default multiplayerService;
