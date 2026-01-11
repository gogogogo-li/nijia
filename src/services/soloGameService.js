/**
 * Solo Game Service
 * Handles API calls to backend for solo staked games
 */

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

class SoloGameService {
    constructor() {
        this.currentGame = null;
    }

    /**
     * Get difficulty configuration from backend
     */
    async getConfig() {
        try {
            const response = await fetch(`${API_URL}/api/solo/config`);
            if (!response.ok) throw new Error('Failed to fetch config');
            return await response.json();
        } catch (error) {
            console.error('Error fetching solo config:', error);
            // Return default config if backend unavailable
            return {
                difficulties: [
                    { id: 0, name: 'Easy', stake: 0.5, target: 100, speed: 1.0 },
                    { id: 1, name: 'Medium', stake: 1, target: 200, speed: 1.3 },
                    { id: 2, name: 'Hard', stake: 2, target: 350, speed: 1.6 },
                    { id: 3, name: 'Extreme', stake: 5, target: 500, speed: 2.0 },
                ],
                lives: 3,
                platformFee: 2,
            };
        }
    }

    /**
     * Register a new solo game after on-chain creation
     */
    async createGame(txHash, playerAddress, difficulty) {
        try {
            console.log('📝 Registering solo game with backend...');

            const response = await fetch(`${API_URL}/api/solo/games/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    txHash,
                    playerAddress,
                    difficulty,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create game');
            }

            const result = await response.json();
            this.currentGame = result.game;
            console.log('✅ Solo game registered:', result.game.game_id);
            return result.game;
        } catch (error) {
            console.error('Error creating solo game:', error);
            throw error;
        }
    }

    /**
     * Update score during gameplay
     */
    async updateScore(gameId, playerAddress, score) {
        try {
            const response = await fetch(`${API_URL}/api/solo/games/${gameId}/score`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    playerAddress,
                    score,
                }),
            });

            if (!response.ok) {
                console.warn('Failed to update score');
                return null;
            }

            return await response.json();
        } catch (error) {
            console.warn('Error updating score:', error);
            return null;
        }
    }

    /**
     * Update lives during gameplay (may trigger game completion)
     */
    async updateLives(gameId, playerAddress, lives, score) {
        try {
            console.log(`💔 Updating lives: ${lives} remaining, score: ${score}`);

            const response = await fetch(`${API_URL}/api/solo/games/${gameId}/lives`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    playerAddress,
                    lives,
                    score,
                }),
            });

            if (!response.ok) {
                console.warn('Failed to update lives');
                return null;
            }

            const result = await response.json();

            if (result.game?.state === 'completed') {
                console.log('🏁 Game completed via lives update');
                this.currentGame = result.game;
            }

            return result;
        } catch (error) {
            console.warn('Error updating lives:', error);
            return null;
        }
    }

    /**
     * Complete the game (called when game ends naturally)
     */
    async completeGame(gameId, playerAddress, finalScore) {
        try {
            console.log(`🏁 Completing solo game ${gameId} with score ${finalScore}`);

            const response = await fetch(`${API_URL}/api/solo/games/${gameId}/complete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    playerAddress,
                    finalScore,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to complete game');
            }

            const result = await response.json();
            this.currentGame = result.game;

            console.log('✅ Game completed:');
            console.log(`   Won: ${result.game.won}`);
            console.log(`   Payout: ${result.game.payout_oct} OCT`);

            return result.game;
        } catch (error) {
            console.error('Error completing solo game:', error);
            throw error;
        }
    }

    /**
     * Get current game state
     */
    async getGame(gameId) {
        try {
            const response = await fetch(`${API_URL}/api/solo/games/${gameId}`);
            if (!response.ok) return null;
            const result = await response.json();
            return result.game;
        } catch (error) {
            console.warn('Error getting game:', error);
            return null;
        }
    }

    /**
     * Get current game from memory
     */
    getCurrentGame() {
        return this.currentGame;
    }

    /**
     * Clear current game
     */
    clearCurrentGame() {
        this.currentGame = null;
    }
}

const soloGameService = new SoloGameService();
export default soloGameService;
