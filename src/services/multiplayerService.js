// Use environment variable or fallback to localhost
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';

class MultiplayerGameService {
  constructor() {
    this.ONECHAIN_CONFIG = {
      apiEndpoint: process.env.REACT_APP_ONECHAIN_API || 'https://api.onelabs.cc',
      network: process.env.REACT_APP_ONECHAIN_NETWORK || 'testnet',
      projectId: process.env.REACT_APP_ONECHAIN_PROJECT_ID,
      gameContractAddress: process.env.REACT_APP_GAME_CONTRACT_ADDRESS,
    };
    
    this.BET_TIERS = [
      { 
        id: 1, 
        amount: 0.1, 
        label: "Casual", 
        units: 100000000, 
        description: "Perfect for beginners",
        token: "ONE",
        tokenName: "OneChain",
        color: "#667eea",
        borderColor: "#667eea",
        glowColor: "rgba(102, 126, 234, 0.3)"
      },
      { 
        id: 2, 
        amount: 0.5, 
        label: "Standard", 
        units: 500000000, 
        description: "Most popular choice",
        token: "ONE",
        tokenName: "OneChain",
        color: "#667eea",
        borderColor: "#FFD700",
        glowColor: "rgba(255, 215, 0, 0.3)"
      },
      { 
        id: 3, 
        amount: 1, 
        label: "Competitive", 
        units: 1000000000, 
        description: "For serious players",
        token: "ONE",
        tokenName: "OneChain",
        color: "#667eea",
        borderColor: "#FF6B6B",
        glowColor: "rgba(255, 107, 107, 0.3)"
      },
      { 
        id: 4, 
        amount: 5, 
        label: "High Stakes", 
        units: 5000000000, 
        description: "Big risk, big reward",
        token: "ONE",
        tokenName: "OneChain",
        color: "#667eea",
        borderColor: "#9D4EDD",
        glowColor: "rgba(157, 78, 221, 0.3)"
      },
    ];
  }

  async createGame(betTier) {
    try {
      if (!window.onechain) throw new Error('OneWallet not connected');

      // Get wallet address
      const account = await window.onechain.account();
      const walletAddress = account.address;

      // Get tier info
      const tierInfo = this.BET_TIERS.find(t => t.id === betTier);

      // Call OneChain API to create game
      const response = await fetch(`${this.ONECHAIN_CONFIG.apiEndpoint}/game/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
        },
        body: JSON.stringify({
          walletAddress: walletAddress,
          betAmount: tierInfo.units.toString(),
          betTier: betTier,
          contractAddress: this.ONECHAIN_CONFIG.gameContractAddress
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create game on OneChain');
      }

      const result = await response.json();
      const gameId = result.gameId || Date.now();
      const transactionHash = result.transactionHash;
      
      // Report to backend
      try {
        await fetch(`${API_BASE_URL}/api/games`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            game_id: gameId,
            bet_amount: tierInfo.octas,
            player1: walletAddress,
            transactionHash: response.hash
          })
        });
      } catch (backendError) {
        console.warn('Backend unavailable, using localStorage fallback');
        // Fallback: Save to localStorage
        this.saveLocalGame({
          game_id: gameId,
          bet_amount: tierInfo.octas,
          player1: walletAddress,
          player2: '0x0',
          state: 0,
          created_at: Date.now()
        });
      }
      
      return { success: true, transactionHash: response.hash, gameId };
    } catch (error) {
      console.error('Failed to create game:', error);
      return { success: false, error: error.message };
    }
  }

  async joinGame(gameId) {
    try {
      if (!window.onechain) throw new Error('OneWallet not connected');

      // Get wallet address
      const account = await window.onechain.account();
      const walletAddress = account.address;

      // Call OneChain API to join game
      const response = await fetch(`${this.ONECHAIN_CONFIG.apiEndpoint}/game/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
        },
        body: JSON.stringify({
          walletAddress: walletAddress,
          gameId: gameId.toString(),
          contractAddress: this.ONECHAIN_CONFIG.gameContractAddress
        })
      });

      if (!response.ok) {
        throw new Error('Failed to join game on OneChain');
      }

      const result = await response.json();
      const transactionHash = result.transactionHash;
      
      // Report to backend
      try {
        await fetch(`${API_BASE_URL}/api/games/${gameId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            player2: walletAddress,
            transactionHash: transactionHash
          })
        });
      } catch (backendError) {
        console.warn('Backend unavailable, using localStorage fallback');
        // Fallback: Mark game as joined in localStorage
        this.markGameJoined(gameId);
      }
      
      return { success: true, transactionHash: transactionHash };
    } catch (error) {
      console.error('Failed to join game:', error);
      return { success: false, error: error.message };
    }
  }

  async submitScore(gameId, finalScore) {
    try {
      if (!window.onechain) throw new Error('OneWallet not connected');

      // Call OneChain API to submit score
      const response = await fetch(`${this.ONECHAIN_CONFIG.apiEndpoint}/game/submit-score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
        },
        body: JSON.stringify({
          gameId: gameId.toString(),
          score: finalScore.toString(),
          contractAddress: this.ONECHAIN_CONFIG.gameContractAddress
        })
      });

      if (!response.ok) {
        throw new Error('Failed to submit score on OneChain');
      }

      const result = await response.json();
      const transactionHash = result.transactionHash;
      
      // Report game completion to backend (so it gets removed from cache)
      try {
        await fetch(`${API_BASE_URL}/api/games/${gameId}/finish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transactionHash: transactionHash
          })
        });
      } catch (backendError) {
        console.warn('Backend unavailable for game finish notification');
      }
      
      return { success: true, transactionHash: transactionHash };
    } catch (error) {
      console.error('Failed to submit score:', error);
      return { success: false, error: error.message };
    }
  }

  async getAvailableGames() {
    try {
      // ONLY use backend API - no blockchain queries to avoid rate limits
      const backendUrl = `${API_BASE_URL}/api/games/available`;
      
      const response = await fetch(backendUrl);
      if (response.ok) {
        const backendGames = await response.json();
        return backendGames.map(g => ({
          game_id: g.game_id,
          bet_amount: g.bet_amount,
          player1: g.player1,
          player2: g.player2 || '0x0',
          state: g.state || 0,
          created_at: g.created_at
        }));
      }
      
      // If backend fails, return empty array
      console.warn('Backend not available');
      return [];
    } catch (error) {
      console.error('Failed to fetch available games:', error);
      return [];
    }
  }

  getLocalGames() {
    try {
      const stored = localStorage.getItem('onechain_multiplayer_games');
      if (!stored) return [];
      const games = JSON.parse(stored);
      // Filter out games older than 1 hour
      const oneHourAgo = Date.now() - 3600000;
      return games.filter(g => g.created_at > oneHourAgo && g.state === 0);
    } catch (error) {
      return [];
    }
  }

  saveLocalGame(gameData) {
    try {
      const games = this.getLocalGames();
      games.push(gameData);
      localStorage.setItem('onechain_multiplayer_games', JSON.stringify(games));
    } catch (error) {
      console.error('Failed to save game locally:', error);
    }
  }

  markGameJoined(gameId) {
    try {
      const games = this.getLocalGames();
      const updated = games.map(g => 
        g.game_id === gameId ? { ...g, state: 1 } : g
      );
      localStorage.setItem('onechain_multiplayer_games', JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to update game:', error);
    }
  }

  async getGameCreatedEvents() {
    try {
      // Fetch game created events from OneChain
      const response = await fetch(
        `${this.ONECHAIN_CONFIG.apiEndpoint}/game/events/created`,
        {
          headers: {
            'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch game created events');
      }

      const data = await response.json();
      return data.events || [];
    } catch (error) {
      console.error('Failed to fetch GameCreated events:', error);
      return [];
    }
  }

  async getGameJoinedEvents() {
    try {
      // Fetch game joined events from OneChain
      const response = await fetch(
        `${this.ONECHAIN_CONFIG.apiEndpoint}/game/events/joined`,
        {
          headers: {
            'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch game joined events');
      }

      const data = await response.json();
      return data.events || [];
    } catch (error) {
      console.error('Failed to fetch GameJoined events:', error);
      return [];
    }
  }

  async getPlayerStats(address) {
    try {
      // Return default stats - view function has issues
      return {
        games_played: 0,
        games_won: 0,
        total_wagered: 0,
        total_winnings: 0
      };
    } catch (error) {
      return {
        games_played: 0,
        games_won: 0,
        total_wagered: 0,
        total_winnings: 0
      };
    }
  }

  async getGame(gameId) {
    try {
      // Fetch game data from OneChain
      const response = await fetch(
        `${this.ONECHAIN_CONFIG.apiEndpoint}/game/${gameId}`,
        {
          headers: {
            'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch game');
      }

      const data = await response.json();
      return data.game || null;
    } catch (error) {
      console.error('Failed to fetch game:', error);
      return null;
    }
  }

  getBetTiers() {
    return this.BET_TIERS;
  }

  formatAddress(address) {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  normalizeAddress(address) {
    if (!address) return '';
    return address.toLowerCase().startsWith('0x') ? address.toLowerCase() : `0x${address.toLowerCase()}`;
  }

  compareAddresses(addr1, addr2) {
    return this.normalizeAddress(addr1) === this.normalizeAddress(addr2);
  }
}

export default new MultiplayerGameService();
