/**
 * Multiplayer Service
 * Handles multiplayer game sessions, matchmaking, and score submission
 */

const STORAGE_KEY = 'onechain_multiplayer_games';
// eslint-disable-next-line no-unused-vars
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';

class MultiplayerService {
  constructor() {
    this.activeGames = new Map();
  }

  /**
   * Create a new multiplayer game session
   */
  async createGame(walletAddress, tier, wagerAmount = 0) {
    try {
      const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const game = {
        id: gameId,
        creator: walletAddress,
        tier,
        wagerAmount,
        status: 'waiting', // 'waiting', 'active', 'completed'
        players: [{
          address: walletAddress,
          score: null,
          joined: Date.now()
        }],
        createdAt: Date.now(),
        startedAt: null,
        completedAt: null
      };

      // Store in memory
      this.activeGames.set(gameId, game);
      
      // Store in localStorage for cross-tab sync
      this.saveToLocalStorage();
      
      console.log('🎮 Created multiplayer game:', gameId);
      return { success: true, gameId, game };
    } catch (error) {
      console.error('❌ Failed to create game:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Join an existing game
   */
  async joinGame(gameId, walletAddress) {
    try {
      const game = this.activeGames.get(gameId);
      
      if (!game) {
        throw new Error('Game not found');
      }

      if (game.status !== 'waiting') {
        throw new Error('Game is no longer accepting players');
      }

      if (game.players.length >= 2) {
        throw new Error('Game is full');
      }

      if (game.players.some(p => p.address === walletAddress)) {
        throw new Error('Already in this game');
      }

      // Add player
      game.players.push({
        address: walletAddress,
        score: null,
        joined: Date.now()
      });

      // Start game if 2 players
      if (game.players.length === 2) {
        game.status = 'active';
        game.startedAt = Date.now();
      }

      this.activeGames.set(gameId, game);
      this.saveToLocalStorage();

      console.log('🎮 Joined game:', gameId);
      return { success: true, game };
    } catch (error) {
      console.error('❌ Failed to join game:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Submit score for a game
   */
  async submitScore(gameId, score) {
    try {
      const game = this.activeGames.get(gameId);
      
      if (!game) {
        throw new Error('Game not found');
      }

      // This would typically be authenticated via wallet signature
      const walletAddress = this.getCurrentWalletAddress();
      const player = game.players.find(p => p.address === walletAddress);
      
      if (!player) {
        throw new Error('Not a player in this game');
      }

      player.score = score;
      player.submittedAt = Date.now();

      // Check if game is complete
      const allScoresSubmitted = game.players.every(p => p.score !== null);
      if (allScoresSubmitted) {
        game.status = 'completed';
        game.completedAt = Date.now();
        
        // Calculate winner
        game.winner = game.players.reduce((prev, current) => 
          (current.score > prev.score) ? current : prev
        );
      }

      this.activeGames.set(gameId, game);
      this.saveToLocalStorage();

      console.log('🎮 Score submitted for game:', gameId, score);
      return { success: true, game };
    } catch (error) {
      console.error('❌ Failed to submit score:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get available games to join
   */
  getAvailableGames() {
    // Load from localStorage first
    this.loadFromLocalStorage();
    
    const games = Array.from(this.activeGames.values())
      .filter(game => game.status === 'waiting')
      .sort((a, b) => b.createdAt - a.createdAt);

    return games;
  }

  /**
   * Get game details
   */
  getGame(gameId) {
    return this.activeGames.get(gameId);
  }

  /**
   * Get player statistics
   */
  async getPlayerStats(walletAddress) {
    try {
      // Load from localStorage
      this.loadFromLocalStorage();
      
      const allGames = Array.from(this.activeGames.values());
      const playerGames = allGames.filter(game => 
        game.players.some(p => p.address === walletAddress)
      );

      const completedGames = playerGames.filter(g => g.status === 'completed');
      const wins = completedGames.filter(g => 
        g.winner?.address === walletAddress
      ).length;

      const totalWager = completedGames.reduce((sum, game) => 
        sum + (game.wagerAmount || 0), 0
      );

      const stats = {
        gamesPlayed: completedGames.length,
        wins,
        losses: completedGames.length - wins,
        winRate: completedGames.length > 0 ? (wins / completedGames.length * 100).toFixed(1) : 0,
        totalWager,
        rank: this.calculateRank(wins, completedGames.length)
      };

      return { success: true, stats };
    } catch (error) {
      console.error('❌ Failed to get player stats:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Calculate player rank based on performance
   */
  calculateRank(wins, totalGames) {
    if (totalGames === 0) return 'Unranked';
    
    const winRate = (wins / totalGames) * 100;
    
    if (winRate >= 80 && totalGames >= 10) return 'Legend';
    if (winRate >= 70 && totalGames >= 5) return 'Master';
    if (winRate >= 60) return 'Expert';
    if (winRate >= 50) return 'Skilled';
    if (winRate >= 40) return 'Intermediate';
    return 'Beginner';
  }

  /**
   * Clean up old/expired games
   */
  cleanupGames() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [gameId, game] of this.activeGames.entries()) {
      const age = now - game.createdAt;
      if (age > maxAge) {
        this.activeGames.delete(gameId);
      }
    }

    this.saveToLocalStorage();
  }

  /**
   * Save games to localStorage
   */
  saveToLocalStorage() {
    try {
      const gamesArray = Array.from(this.activeGames.entries());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(gamesArray));
    } catch (error) {
      console.error('Failed to save games to localStorage:', error);
    }
  }

  /**
   * Load games from localStorage
   */
  loadFromLocalStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const gamesArray = JSON.parse(stored);
        this.activeGames = new Map(gamesArray);
      }
    } catch (error) {
      console.error('Failed to load games from localStorage:', error);
    }
  }

  /**
   * Get current wallet address (helper)
   */
  getCurrentWalletAddress() {
    // This should be replaced with actual wallet service call
    const session = localStorage.getItem('onechain_session');
    if (session) {
      const sessionData = JSON.parse(session);
      return sessionData.address;
    }
    return null;
  }
}

// Export singleton instance
const multiplayerService = new MultiplayerService();
export default multiplayerService;
