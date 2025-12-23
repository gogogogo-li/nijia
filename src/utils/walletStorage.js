/**
 * Wallet-scoped localStorage utility
 * Prefixes all keys with wallet address to isolate data per wallet
 */

/**
 * Get data from localStorage scoped to a specific wallet
 * @param {string} walletAddress - The wallet address to scope data to
 * @param {string} key - The storage key
 * @param {any} defaultValue - Default value if not found
 * @returns {any} The stored value or default
 */
export const getWalletData = (walletAddress, key, defaultValue = null) => {
    if (!walletAddress) return defaultValue;

    try {
        // Use shortened wallet address for key (first 10 + last 6 chars)
        const shortAddress = `${walletAddress.slice(0, 10)}${walletAddress.slice(-6)}`;
        const prefixedKey = `ninja_${shortAddress}_${key}`;
        const value = localStorage.getItem(prefixedKey);

        if (value === null) return defaultValue;

        // Try to parse as JSON, fall back to raw value for backwards compatibility
        try {
            return JSON.parse(value);
        } catch {
            // If it's a number string, parse it
            const num = parseInt(value, 10);
            if (!isNaN(num)) return num;
            return value;
        }
    } catch (error) {
        console.error('Error reading wallet data:', error);
        return defaultValue;
    }
};

/**
 * Set data in localStorage scoped to a specific wallet
 * @param {string} walletAddress - The wallet address to scope data to
 * @param {string} key - The storage key
 * @param {any} value - The value to store
 */
export const setWalletData = (walletAddress, key, value) => {
    if (!walletAddress) {
        console.warn('Cannot save wallet data: no wallet address provided');
        return;
    }

    try {
        const shortAddress = `${walletAddress.slice(0, 10)}${walletAddress.slice(-6)}`;
        const prefixedKey = `ninja_${shortAddress}_${key}`;

        // Store numbers directly, objects as JSON
        if (typeof value === 'number') {
            localStorage.setItem(prefixedKey, value.toString());
        } else {
            localStorage.setItem(prefixedKey, JSON.stringify(value));
        }
    } catch (error) {
        console.error('Error saving wallet data:', error);
    }
};

/**
 * Remove data from localStorage scoped to a specific wallet
 * @param {string} walletAddress - The wallet address to scope data to
 * @param {string} key - The storage key
 */
export const removeWalletData = (walletAddress, key) => {
    if (!walletAddress) return;

    try {
        const shortAddress = `${walletAddress.slice(0, 10)}${walletAddress.slice(-6)}`;
        const prefixedKey = `ninja_${shortAddress}_${key}`;
        localStorage.removeItem(prefixedKey);
    } catch (error) {
        console.error('Error removing wallet data:', error);
    }
};

/**
 * Load all game stats for a wallet
 * @param {string} walletAddress - The wallet address
 * @returns {Object} Game stats object
 */
export const loadWalletGameStats = (walletAddress) => {
    return {
        bestScore: getWalletData(walletAddress, 'bestScore', 0),
        bestScoreClassic: getWalletData(walletAddress, 'bestScoreClassic', 0),
        bestScoreArcade: getWalletData(walletAddress, 'bestScoreArcade', 0),
        bestScoreZen: getWalletData(walletAddress, 'bestScoreZen', 0),
        totalScore: getWalletData(walletAddress, 'totalScore', 0),
        gamesPlayed: getWalletData(walletAddress, 'gamesPlayed', 0),
        mintedNFTs: getWalletData(walletAddress, 'mintedNFTs', []),
    };
};

/**
 * Save game stats for a wallet
 * @param {string} walletAddress - The wallet address
 * @param {Object} stats - Stats to save
 */
export const saveWalletGameStats = (walletAddress, stats) => {
    if (stats.bestScore !== undefined) setWalletData(walletAddress, 'bestScore', stats.bestScore);
    if (stats.bestScoreClassic !== undefined) setWalletData(walletAddress, 'bestScoreClassic', stats.bestScoreClassic);
    if (stats.bestScoreArcade !== undefined) setWalletData(walletAddress, 'bestScoreArcade', stats.bestScoreArcade);
    if (stats.bestScoreZen !== undefined) setWalletData(walletAddress, 'bestScoreZen', stats.bestScoreZen);
    if (stats.totalScore !== undefined) setWalletData(walletAddress, 'totalScore', stats.totalScore);
    if (stats.gamesPlayed !== undefined) setWalletData(walletAddress, 'gamesPlayed', stats.gamesPlayed);
    if (stats.mintedNFTs !== undefined) setWalletData(walletAddress, 'mintedNFTs', stats.mintedNFTs);
};

const walletStorage = {
    getWalletData,
    setWalletData,
    removeWalletData,
    loadWalletGameStats,
    saveWalletGameStats,
};

export default walletStorage;
