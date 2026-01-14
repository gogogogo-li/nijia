/**
 * Shared Item Manager
 * Handles synchronized item spawning for multiplayer
 * 
 * All players see and can slash the same items.
 * First player to slash gets the points.
 */

const seedrandom = require('seedrandom');
const { FRUIT_TYPES, BOMB_CONFIG, SPAWN_PATTERNS } = require('./gameConfig');

class SharedItemManager {
    constructor(roomId, seed) {
        this.roomId = roomId;
        this.seed = seed;
        this.rng = seedrandom(seed.toString());
        this.items = new Map();  // id -> item state
        this.spawnCounter = 0;
        this.gameTime = 0;
        this.lastSpawnTime = 0;
        this.activePattern = null;
        this.patternQueue = [];
    }

    /**
     * Update game time
     */
    tick(deltaTime) {
        this.gameTime += deltaTime;
    }

    /**
     * Select a random fruit based on weights
     */
    selectFruit() {
        const fruits = FRUIT_TYPES || [
            { id: 'apple', emoji: '🍎', name: 'Apple', points: 10, color: '#FF0000', size: 1.0, spawnWeight: 0.15 },
            { id: 'orange', emoji: '🍊', name: 'Orange', points: 10, color: '#FFA500', size: 1.0, spawnWeight: 0.15 },
            { id: 'lemon', emoji: '🍋', name: 'Lemon', points: 15, color: '#FFF44F', size: 0.9, spawnWeight: 0.12 },
            { id: 'grape', emoji: '🍇', name: 'Grape', points: 15, color: '#6B2D8B', size: 0.8, spawnWeight: 0.12 },
            { id: 'strawberry', emoji: '🍓', name: 'Strawberry', points: 20, color: '#FF355E', size: 0.85, spawnWeight: 0.10 },
            { id: 'banana', emoji: '🍌', name: 'Banana', points: 20, color: '#FFE135', size: 1.1, spawnWeight: 0.10 },
            { id: 'watermelon', emoji: '🍉', name: 'Watermelon', points: 25, color: '#FF6B6B', size: 1.4, spawnWeight: 0.08 },
            { id: 'kiwi', emoji: '🥝', name: 'Kiwi', points: 25, color: '#8EE53F', size: 0.9, spawnWeight: 0.08 },
            { id: 'peach', emoji: '🍑', name: 'Peach', points: 30, color: '#FFCBA4', size: 1.0, spawnWeight: 0.05 },
            { id: 'pineapple', emoji: '🍍', name: 'Pineapple', points: 35, color: '#FFD700', size: 1.3, spawnWeight: 0.03 },
            { id: 'coconut', emoji: '🥥', name: 'Coconut', points: 40, color: '#8B4513', size: 1.2, spawnWeight: 0.02 }
        ];

        const totalWeight = fruits.reduce((sum, f) => sum + f.spawnWeight, 0);
        let random = this.rng() * totalWeight;

        for (const fruit of fruits) {
            random -= fruit.spawnWeight;
            if (random <= 0) return fruit;
        }
        return fruits[0];
    }

    /**
     * Check if should spawn bomb
     */
    shouldSpawnBomb(bombChance = 0.08) {
        return this.rng() < bombChance;
    }

    /**
     * Select spawn pattern based on game time
     */
    selectPattern() {
        const patterns = SPAWN_PATTERNS || {
            single: { name: 'Single', count: 1, delay: 0, weight: 0.30 },
            arc: { name: 'Arc', count: { min: 2, max: 3 }, delay: 100, weight: 0.25 },
            combo: { name: 'Combo', count: { min: 3, max: 5 }, delay: 50, weight: 0.20 },
            storm: { name: 'Storm', count: { min: 6, max: 10 }, delay: 80, weight: 0.10 }
        };

        // Pattern progression based on time
        let available = ['single', 'arc'];
        if (this.gameTime > 20000) available.push('combo');
        if (this.gameTime > 40000) available.push('storm');

        const patternList = available.map(p => patterns[p]).filter(Boolean);
        const totalWeight = patternList.reduce((sum, p) => sum + p.weight, 0);
        let random = this.rng() * totalWeight;

        for (const pattern of patternList) {
            random -= pattern.weight;
            if (random <= 0) return pattern;
        }
        return patterns.single;
    }

    /**
     * Generate next spawn batch
     */
    generateSpawnBatch() {
        const pattern = this.selectPattern();
        const batch = [];

        // Determine count
        let count = 1;
        if (typeof pattern.count === 'object') {
            count = pattern.count.min + Math.floor(this.rng() * (pattern.count.max - pattern.count.min + 1));
        } else if (typeof pattern.count === 'number') {
            count = pattern.count;
        }

        // Generate items
        for (let i = 0; i < count; i++) {
            const id = `${this.roomId}_${this.spawnCounter++}`;
            const isBomb = this.shouldSpawnBomb(pattern.bombChance || 0.08);

            const item = {
                id,
                type: isBomb ? 'bomb' : 'fruit',
                fruit: isBomb ? (BOMB_CONFIG || { id: 'bomb', emoji: '💣', name: 'Bomb', color: '#333', size: 1.1 }) : this.selectFruit(),
                spawnX: this.rng(),           // 0-1, normalized screen position
                velocity: 0.6 + this.rng() * 0.4,
                angle: -70 + this.rng() * 40, // -70 to -30 degrees (upward arc)
                spawnDelay: i * (pattern.delay || 0),
                spawnTime: Date.now() + i * (pattern.delay || 0),
                state: 'pending',              // pending, active, slashed, missed
                slashedBy: null,
                slashedAt: null
            };

            batch.push(item);
            this.items.set(id, item);
        }

        return {
            pattern: pattern.name,
            announcement: pattern.announcement || null,
            items: batch
        };
    }

    /**
     * Handle slash attempt
     * Returns: { success: bool, pointsAwarded: number, slashedBy: string }
     */
    attemptSlash(itemId, playerAddress, timestamp) {
        const item = this.items.get(itemId);

        if (!item) {
            return { success: false, reason: 'item_not_found' };
        }

        if (item.state === 'slashed') {
            return { success: false, reason: 'already_slashed', slashedBy: item.slashedBy };
        }

        if (item.state === 'missed') {
            return { success: false, reason: 'item_missed' };
        }

        // First to slash gets it
        item.state = 'slashed';
        item.slashedBy = playerAddress;
        item.slashedAt = timestamp || Date.now();

        const points = item.type === 'bomb' ? 0 : item.fruit.points;
        const isBomb = item.type === 'bomb';

        return {
            success: true,
            itemId,
            points,
            isBomb,
            slashedBy: playerAddress,
            fruit: item.fruit
        };
    }

    /**
     * Mark item as missed (fell off screen)
     */
    markMissed(itemId) {
        const item = this.items.get(itemId);
        if (item && item.state !== 'slashed') {
            item.state = 'missed';
            return item.type !== 'bomb'; // Returns true if it was a fruit (penalty)
        }
        return false;
    }

    /**
     * Get active items
     */
    getActiveItems() {
        return Array.from(this.items.values())
            .filter(item => item.state === 'pending' || item.state === 'active');
    }

    /**
     * Clear old items from memory
     */
    cleanup(maxAge = 10000) {
        const now = Date.now();
        for (const [id, item] of this.items) {
            if (now - item.spawnTime > maxAge) {
                this.items.delete(id);
            }
        }
    }

    /**
     * Get state for sync
     */
    getState() {
        return {
            roomId: this.roomId,
            gameTime: this.gameTime,
            itemCount: this.items.size,
            activeCount: this.getActiveItems().length
        };
    }
}

module.exports = SharedItemManager;
