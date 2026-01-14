/**
 * Contribution Scoring Utility
 * REQ-P2-005: Contribution-based Scoring System
 * 
 * Calculates and distributes points based on player contributions
 * to destroying super fruits in multiplayer matches.
 * 
 * Scoring Rules:
 * - Each hit on a super fruit awards base points (basePoints / maxHp)
 * - Final hit bonus: 15% extra points for the player who destroys the fruit
 * - Minimum contribution threshold: 5% (players who hit less don't get pool bonus)
 * - All players who meet threshold share the multiplier bonus
 */

// Configuration
const CONTRIBUTION_CONFIG = {
    FINAL_HIT_BONUS_PERCENT: 15,    // 15% bonus for final hit
    MIN_CONTRIBUTION_THRESHOLD: 5,   // 5% minimum to qualify for bonus
    POOL_BONUS_PERCENT: 10,          // 10% pool bonus for qualified contributors
    HIT_COOLDOWN_MS: 150             // Minimum time between hits from same player
};

/**
 * Calculate points for a single hit on a super fruit
 * @param {object} superFruit - The super fruit configuration
 * @param {number} hitNumber - Which hit this is (1-indexed)
 * @param {boolean} isFinalHit - Whether this hit destroys the fruit
 */
export function calculateHitPoints(superFruit, hitNumber, isFinalHit) {
    if (!superFruit) return 0;

    const basePointsPerHit = Math.floor(superFruit.basePoints / superFruit.hp);
    let points = basePointsPerHit;

    // Final hit bonus
    if (isFinalHit) {
        const finalBonus = Math.floor(basePointsPerHit * CONTRIBUTION_CONFIG.FINAL_HIT_BONUS_PERCENT / 100);
        points += finalBonus;

        // Also add the score multiplier from the fruit config
        points = Math.floor(points * superFruit.scoreMultiplier);
    }

    return points;
}

/**
 * Calculate contribution percentages for all players who hit a fruit
 * @param {array} hitLog - Array of { player, timestamp, damage } entries
 * @returns {object} Map of playerAddress -> contribution percentage
 */
export function calculateContributions(hitLog) {
    if (!hitLog || hitLog.length === 0) return {};

    const totalDamage = hitLog.reduce((sum, hit) => sum + (hit.damage || 1), 0);
    const contributions = {};

    hitLog.forEach(hit => {
        const player = hit.player;
        const damage = hit.damage || 1;

        if (!contributions[player]) {
            contributions[player] = 0;
        }
        contributions[player] += damage;
    });

    // Convert to percentages
    Object.keys(contributions).forEach(player => {
        contributions[player] = Math.round((contributions[player] / totalDamage) * 100);
    });

    return contributions;
}

/**
 * Distribute final points when a super fruit is destroyed
 * @param {object} superFruit - The super fruit configuration
 * @param {array} hitLog - Array of hit entries
 * @param {string} finalHitPlayer - Address of the player who made the final hit
 * @returns {object} Map of playerAddress -> points awarded
 */
export function distributeFinalPoints(superFruit, hitLog, finalHitPlayer) {
    if (!superFruit || !hitLog || hitLog.length === 0) {
        return { [finalHitPlayer]: superFruit?.basePoints || 0 };
    }

    const contributions = calculateContributions(hitLog);
    const totalPoints = superFruit.basePoints * superFruit.scoreMultiplier;
    const pointsAwarded = {};

    // Determine qualified players (meet minimum contribution threshold)
    const qualifiedPlayers = Object.entries(contributions)
        .filter(([_, percent]) => percent >= CONTRIBUTION_CONFIG.MIN_CONTRIBUTION_THRESHOLD)
        .map(([player]) => player);

    // Calculate pool bonus if multiple qualified players
    const hasPoolBonus = qualifiedPlayers.length > 1;
    const poolBonusTotal = hasPoolBonus
        ? Math.floor(totalPoints * CONTRIBUTION_CONFIG.POOL_BONUS_PERCENT / 100)
        : 0;

    // Base distribution - points based on contribution percentage
    Object.entries(contributions).forEach(([player, percent]) => {
        let playerPoints = Math.floor(totalPoints * percent / 100);

        // Add pool bonus for qualified contributors
        if (hasPoolBonus && qualifiedPlayers.includes(player)) {
            const shareOfPool = Math.floor(poolBonusTotal / qualifiedPlayers.length);
            playerPoints += shareOfPool;
        }

        // Final hit bonus
        if (player === finalHitPlayer) {
            const finalBonus = Math.floor(totalPoints * CONTRIBUTION_CONFIG.FINAL_HIT_BONUS_PERCENT / 100);
            playerPoints += finalBonus;
        }

        pointsAwarded[player] = playerPoints;
    });

    return pointsAwarded;
}

/**
 * Format contribution breakdown for display
 * @param {object} contributions - Map of player -> percentage
 * @param {object} pointsAwarded - Map of player -> points
 * @param {string} currentPlayer - Current player's address
 * @returns {array} Formatted array for UI display
 */
export function formatContributionBreakdown(contributions, pointsAwarded, currentPlayer) {
    return Object.entries(contributions)
        .map(([player, percent]) => ({
            player,
            isMe: player.toLowerCase() === currentPlayer?.toLowerCase(),
            percent,
            points: pointsAwarded[player] || 0,
            qualified: percent >= CONTRIBUTION_CONFIG.MIN_CONTRIBUTION_THRESHOLD
        }))
        .sort((a, b) => b.percent - a.percent);
}

/**
 * Create a hit entry for logging
 * @param {string} playerAddress - Player who made the hit
 * @param {number} damage - Damage dealt (default 1)
 * @returns {object} Hit log entry
 */
export function createHitEntry(playerAddress, damage = 1) {
    return {
        player: playerAddress,
        timestamp: Date.now(),
        damage
    };
}

/**
 * Check if a new hit is valid (not in cooldown)
 * @param {array} hitLog - Existing hit log
 * @param {string} playerAddress - Player attempting to hit
 * @returns {boolean} Whether the hit is valid
 */
export function isHitValid(hitLog, playerAddress) {
    if (!hitLog || hitLog.length === 0) return true;

    // Find last hit by this player
    const playerHits = hitLog.filter(h =>
        h.player.toLowerCase() === playerAddress.toLowerCase()
    );

    if (playerHits.length === 0) return true;

    const lastHit = playerHits[playerHits.length - 1];
    const timeSinceLastHit = Date.now() - lastHit.timestamp;

    return timeSinceLastHit >= CONTRIBUTION_CONFIG.HIT_COOLDOWN_MS;
}

/**
 * Generate contribution summary text
 * @param {object} contributions - Map of player -> percentage
 * @param {string} finalHitPlayer - Player who made final hit
 * @returns {string} Summary text
 */
export function getContributionSummary(contributions, finalHitPlayer) {
    const players = Object.keys(contributions);

    if (players.length === 1) {
        return 'Solo destroy!';
    }

    const topContributor = Object.entries(contributions)
        .sort((a, b) => b[1] - a[1])[0];

    if (topContributor[0] === finalHitPlayer) {
        return `${topContributor[1]}% contribution + final hit!`;
    }

    return `${players.length} players contributed`;
}

// Named export for module
const contributionScoringModule = {
    calculateHitPoints,
    calculateContributions,
    distributeFinalPoints,
    formatContributionBreakdown,
    createHitEntry,
    isHitValid,
    getContributionSummary,
    CONFIG: CONTRIBUTION_CONFIG
};

export default contributionScoringModule;
