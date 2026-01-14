/**
 * Game Configuration - One Ninja Phase 2.5
 * Enhanced with Classic Fruit Ninja variety
 * 
 * Features:
 * - Classic fruit types with varying points
 * - Spawn patterns (arcs, combos, storms)
 * - Multiplayer milestone scoring
 * - Synchronized item spawning
 */

// ============================================================
// CLASSIC FRUIT TYPES
// ============================================================
export const FRUIT_TYPES = [
    { id: 'apple', emoji: '🍎', name: 'Apple', points: 10, color: '#FF0000', size: 1.0, spawnWeight: 0.15 },
    { id: 'orange', emoji: '🍊', name: 'Orange', points: 10, color: '#FFA500', size: 1.0, spawnWeight: 0.15 },
    { id: 'lemon', emoji: '🍋', name: 'Lemon', points: 15, color: '#FFF44F', size: 0.9, spawnWeight: 0.12 },
    { id: 'grape', emoji: '🍇', name: 'Grape', points: 15, color: '#6B2D8B', size: 0.8, spawnWeight: 0.12 },
    { id: 'strawberry', emoji: '🍓', name: 'Strawberry', points: 20, color: '#FF355E', size: 0.85, spawnWeight: 0.10 },
    { id: 'banana', emoji: '🍌', name: 'Banana', points: 20, color: '#FFE135', size: 1.1, spawnWeight: 0.10, curved: true },
    { id: 'watermelon', emoji: '🍉', name: 'Watermelon', points: 25, color: '#FF6B6B', size: 1.4, spawnWeight: 0.08 },
    { id: 'kiwi', emoji: '🥝', name: 'Kiwi', points: 25, color: '#8EE53F', size: 0.9, spawnWeight: 0.08 },
    { id: 'peach', emoji: '🍑', name: 'Peach', points: 30, color: '#FFCBA4', size: 1.0, spawnWeight: 0.05 },
    { id: 'pineapple', emoji: '🍍', name: 'Pineapple', points: 35, color: '#FFD700', size: 1.3, spawnWeight: 0.03, rare: true },
    { id: 'coconut', emoji: '🥥', name: 'Coconut', points: 40, color: '#8B4513', size: 1.2, spawnWeight: 0.02, rare: true }
];

// Bomb configuration
export const BOMB_CONFIG = {
    id: 'bomb',
    emoji: '💣',
    name: 'Bomb',
    color: '#333333',
    size: 1.1,
    spawnWeight: 0.08,  // 8% chance
    effect: 'lose_life'
};

// ============================================================
// SPAWN PATTERNS (Classic Fruit Ninja Style)
// ============================================================
export const SPAWN_PATTERNS = {
    // Single fruit throw
    single: {
        name: 'Single',
        count: 1,
        delay: 0,
        weight: 0.30
    },

    // Arc throw - fruits from sides
    arc: {
        name: 'Arc Throw',
        count: { min: 2, max: 3 },
        delay: 100,  // ms between each
        spread: 'horizontal',
        weight: 0.25
    },

    // Combo burst - tight group for easy combos
    combo: {
        name: 'Combo Burst',
        count: { min: 3, max: 5 },
        delay: 50,
        spread: 'tight',
        weight: 0.20
    },

    // Fruit storm - rapid sequence
    storm: {
        name: 'Fruit Storm',
        count: { min: 6, max: 10 },
        delay: 80,
        spread: 'wide',
        weight: 0.10,
        announcement: '🌪️ FRUIT STORM!'
    },

    // Bonus time - special fruits worth 2x
    bonus: {
        name: 'Bonus Time',
        count: { min: 4, max: 6 },
        delay: 120,
        multiplier: 2,
        duration: 5000,  // 5 seconds
        weight: 0.08,
        announcement: '⭐ BONUS TIME!'
    },

    // Bomb rush - mix with bombs
    bombRush: {
        name: 'Bomb Rush',
        count: { min: 5, max: 8 },
        bombChance: 0.3,  // 30% bombs
        delay: 100,
        weight: 0.07,
        announcement: '💣 WATCH OUT!'
    }
};

// ============================================================
// MULTIPLAYER MILESTONE SCORING
// ============================================================
export const MULTIPLAYER_CONFIG = {
    // Score milestones to reach
    milestones: [100, 200, 300, 400],

    // Win condition
    winCondition: 'first_to_target',  // or 'most_milestones'
    targetScore: 400,

    // Time limit (0 = no limit, play until win)
    timeLimit: 0,

    // Lives system (can be disabled)
    livesEnabled: true,
    startingLives: 3,

    // Milestone announcements
    announcements: {
        100: '🔥 100 POINTS!',
        200: '⚡ 200 POINTS!',
        300: '🌟 300 POINTS!',
        400: '👑 WINNER!'
    },

    // Synchronized spawning
    syncMode: true,
    syncSpawnInterval: 800,  // ms between spawns

    // Item claim timeout (ms) - first to slash within this time gets it
    claimTimeout: 50
};

// ============================================================
// SPAWN RATE CONFIGURATION
// ============================================================
export const SPAWN_CONFIG = {
    baseInterval: 1200,
    minInterval: 500,

    intervalMultiplier: {
        easy: 1.0,
        medium: 0.8,
        hard: 0.6,
        extreme: 0.5,
        multiplayer: 0.7
    },

    // Pattern selection frequency increases over time
    patternProgression: {
        0: ['single', 'arc'],           // First 20 seconds
        20000: ['single', 'arc', 'combo'],
        40000: ['arc', 'combo', 'storm'],
        60000: ['combo', 'storm', 'bonus', 'bombRush']
    }
};

// ============================================================
// ITEM & SPEED CONFIGURATION
// ============================================================
export const ITEM_CONFIG = {
    maxItems: 25,

    waveSize: {
        tutorial: { min: 2, max: 3 },
        early: { min: 3, max: 5 },
        mid: { min: 4, max: 6 },
        late: { min: 5, max: 8 },
        expert: { min: 6, max: 10 }
    }
};

export const SPEED_CONFIG = {
    baseMultiplier: 1.3,
    progressionRate: 0.12,
    maxSpeedMultiplier: 2.2,

    difficultySpeed: {
        easy: 1.0,
        medium: 1.15,
        hard: 1.3,
        extreme: 1.5
    }
};

// ============================================================
// DIFFICULTY CURVE
// ============================================================
export const DIFFICULTY_CONFIG = {
    phases: {
        tutorial: 10000,
        early: 25000,
        mid: 45000,
        late: 70000,
        expert: 90000
    },
    curve: 'exponential',
    exponentialFactor: 1.12
};

// ============================================================
// SUPER FRUIT CONFIG (kept for compatibility)
// ============================================================
export const SUPER_FRUIT_CONFIG = {
    enabled: true,
    baseSpawnProbability: 0.06,
    maxSpawnProbability: 0.15,
    probabilityIncreasePerMinute: 0.03,
    minTimeToSpawn: 20000,

    types: [
        {
            name: "Dragon Fruit",
            emoji: "🐉",
            color: "#FF1493",
            glowColor: "#FF69B4",
            hp: 3,
            maxHp: 3,
            basePoints: 50,
            scoreMultiplier: 2,
            spawnWeight: 0.45,
            size: 1.3
        },
        {
            name: "Mango",
            emoji: "🥭",
            color: "#FFA500",
            glowColor: "#FFD700",
            hp: 5,
            maxHp: 5,
            basePoints: 75,
            scoreMultiplier: 2,
            spawnWeight: 0.30,
            size: 1.4
        },
        {
            name: "Durian",
            emoji: "🦔",
            color: "#9ACD32",
            glowColor: "#ADFF2F",
            hp: 8,
            maxHp: 8,
            basePoints: 120,
            scoreMultiplier: 3,
            spawnWeight: 0.15,
            size: 1.5
        },
        {
            name: "Jackfruit",
            emoji: "🍈",
            color: "#DAA520",
            glowColor: "#FFD700",
            hp: 10,
            maxHp: 10,
            basePoints: 200,
            scoreMultiplier: 4,
            spawnWeight: 0.08,
            size: 1.6
        },
        {
            name: "Legendary",
            emoji: "⭐",
            color: "#9400D3",
            glowColor: "#EE82EE",
            hp: 15,
            maxHp: 15,
            basePoints: 350,
            scoreMultiplier: 5,
            spawnWeight: 0.02,
            size: 1.8
        }
    ]
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Select a random fruit based on spawn weights
 */
export function selectRandomFruit() {
    const totalWeight = FRUIT_TYPES.reduce((sum, f) => sum + f.spawnWeight, 0);
    let random = Math.random() * totalWeight;

    for (const fruit of FRUIT_TYPES) {
        random -= fruit.spawnWeight;
        if (random <= 0) return fruit;
    }
    return FRUIT_TYPES[0];
}

/**
 * Select a spawn pattern based on game time
 */
export function selectSpawnPattern(gameTime) {
    // Find applicable patterns for current time
    let applicablePatterns = ['single', 'arc'];

    for (const [time, patterns] of Object.entries(SPAWN_CONFIG.patternProgression)) {
        if (gameTime >= parseInt(time)) {
            applicablePatterns = patterns;
        }
    }

    // Weight-based selection
    const patterns = applicablePatterns.map(p => SPAWN_PATTERNS[p]);
    const totalWeight = patterns.reduce((sum, p) => sum + p.weight, 0);
    let random = Math.random() * totalWeight;

    for (const pattern of patterns) {
        random -= pattern.weight;
        if (random <= 0) return pattern;
    }
    return SPAWN_PATTERNS.single;
}

/**
 * Generate synchronized seed-based spawn sequence
 */
export function generateSpawnSequence(seed, count) {
    // Simple seeded random
    const seededRandom = (s) => {
        const x = Math.sin(s) * 10000;
        return x - Math.floor(x);
    };

    const sequence = [];
    for (let i = 0; i < count; i++) {
        const fruitIndex = Math.floor(seededRandom(seed + i) * FRUIT_TYPES.length);
        const isBomb = seededRandom(seed + i + 1000) < BOMB_CONFIG.spawnWeight;

        sequence.push({
            id: `item_${seed}_${i}`,
            type: isBomb ? 'bomb' : 'fruit',
            fruit: isBomb ? BOMB_CONFIG : FRUIT_TYPES[fruitIndex],
            spawnX: seededRandom(seed + i + 2000),  // 0-1 normalized
            velocity: 0.5 + seededRandom(seed + i + 3000) * 0.5
        });
    }

    return sequence;
}

// ============================================================
// EXPORT
// ============================================================
const GAME_CONFIG = {
    fruits: FRUIT_TYPES,
    bomb: BOMB_CONFIG,
    patterns: SPAWN_PATTERNS,
    multiplayer: MULTIPLAYER_CONFIG,
    spawn: SPAWN_CONFIG,
    items: ITEM_CONFIG,
    speed: SPEED_CONFIG,
    difficulty: DIFFICULTY_CONFIG,
    superFruit: SUPER_FRUIT_CONFIG
};

export default GAME_CONFIG;

