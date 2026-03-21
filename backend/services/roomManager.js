/**
 * Room Manager Service
 * REQ-P2-004: Multiplayer Battle Mode (2-4 players)
 * 
 * Handles room creation, player joining, game synchronization,
 * and contribution-based scoring distribution
 */

import { pool } from '../config/postgres.js';
import seedrandom from 'seedrandom';

// Room states
export const ROOM_STATUS = {
    WAITING: 'waiting',
    COUNTDOWN: 'countdown',
    ACTIVE: 'active',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    EXPIRED: 'expired'
};

// Player states within a room
export const PLAYER_STATUS = {
    JOINED: 'joined',
    READY: 'ready',
    PLAYING: 'playing',
    FINISHED: 'finished',
    DISCONNECTED: 'disconnected'
};

// Bet tiers (same as existing)
const BET_TIERS = [
    { id: 1, name: 'Bronze', amount: 0.1, pool: 0.2, platformFee: 0.02 },
    { id: 2, name: 'Silver', amount: 0.5, pool: 1.0, platformFee: 0.02 },
    { id: 3, name: 'Gold', amount: 1.0, pool: 2.0, platformFee: 0.02 },
    { id: 4, name: 'Platinum', amount: 2.0, pool: 4.0, platformFee: 0.02 }
];

// Payout distribution for 2-4 players
const PAYOUT_DISTRIBUTION = {
    2: { 1: 1.0, 2: 0 },                    // Winner takes all
    3: { 1: 0.7, 2: 0.3, 3: 0 },            // 70/30 split
    4: { 1: 0.5, 2: 0.3, 3: 0.2, 4: 0 }     // 50/30/20 split
};

class RoomManager {
    constructor() {
        this.activeRooms = new Map(); // roomId -> room data
        this.socketConnections = new Map(); // walletAddress -> socket
        this.fruitSequences = new Map(); // roomId -> deterministic fruit generator
    }

    /**
     * Generate a deterministic fruit sequence for a room
     */
    generateFruitSequence(seed) {
        const rng = seedrandom(seed);
        return {
            next: () => rng(),
            nextInt: (max) => Math.floor(rng() * max),
            seed
        };
    }

    /**
     * Generate a unique room code
     */
    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = 'ROOM-';
        for (let i = 0; i < 4; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
        return code;
    }

    /**
     * Create a new multiplayer room
     */
    async createRoom({ creatorAddress, betTierId, maxPlayers = 2, transactionHash }) {
        const tier = BET_TIERS.find(t => t.id === betTierId);
        if (!tier) {
            throw new Error('Invalid bet tier');
        }

        if (maxPlayers < 2 || maxPlayers > 4) {
            throw new Error('Max players must be between 2 and 4');
        }

        // Generate room code and game seed
        const roomCode = this.generateRoomCode();
        const gameSeed = `${roomCode}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Insert room into database
        let room;
        try {
            const { rows } = await pool.query(
                `
                  insert into multiplayer_rooms (
                    room_code,
                    max_players,
                    min_players,
                    bet_tier,
                    bet_amount,
                    status,
                    game_seed,
                    game_duration,
                    total_pool,
                    platform_fee_percent,
                    expires_at,
                    created_by
                  )
                  values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                  returning *
                `,
                [
                    roomCode,
                    maxPlayers,
                    2,
                    betTierId,
                    tier.amount,
                    ROOM_STATUS.WAITING,
                    gameSeed,
                    90,
                    tier.amount, // Creator's bet
                    tier.platformFee * 100,
                    expiresAt.toISOString(),
                    creatorAddress,
                ]
            );
            room = rows[0];
        } catch (error) {
            console.error('Error creating room:', error);
            throw new Error('Failed to create room');
        }

        // Add creator as first player
        try {
            await pool.query(
                `
                  insert into room_players (room_id, player_address, join_order, tx_hash, status)
                  values ($1,$2,$3,$4,$5)
                `,
                [room.id, creatorAddress, 1, transactionHash, PLAYER_STATUS.JOINED]
            );
        } catch (playerError) {
            console.error('Error adding creator to room:', playerError);
            // Cleanup: delete the room
            await pool.query('delete from multiplayer_rooms where id = $1', [room.id]);
            throw new Error('Failed to add player to room');
        }

        // Initialize fruit sequence generator
        this.fruitSequences.set(room.id, this.generateFruitSequence(gameSeed));

        // Cache room data
        this.activeRooms.set(room.id, {
            ...room,
            players: [{
                address: creatorAddress,
                joinOrder: 1,
                status: PLAYER_STATUS.JOINED,
                score: 0,
                lives: 3
            }]
        });

        console.log(`🎮 Room created: ${roomCode} (${maxPlayers} players, Tier ${betTierId})`);

        return {
            success: true,
            room: {
                id: room.id,
                roomCode,
                maxPlayers,
                betTier: tier,
                status: ROOM_STATUS.WAITING,
                gameSeed,
                expiresAt
            }
        };
    }

    /**
     * Join an existing room
     */
    async joinRoom({ roomCode, playerAddress, transactionHash }) {
        // Find room by code
        const { rows: roomRows } = await pool.query(
            'select * from multiplayer_rooms where room_code = $1 limit 1',
            [roomCode]
        );
        const room = roomRows[0] || null;

        if (!room) {
            throw new Error('Room not found');
        }

        if (room.status !== ROOM_STATUS.WAITING) {
            throw new Error('Room is no longer accepting players');
        }

        if (room.current_player_count >= room.max_players) {
            throw new Error('Room is full');
        }

        // Check if player already in room
        const { rows: existingPlayerRows } = await pool.query(
            `
              select *
              from room_players
              where room_id = $1
                and player_address = $2
              limit 1
            `,
            [room.id, playerAddress]
        );
        const existingPlayer = existingPlayerRows[0] || null;

        if (existingPlayer) {
            throw new Error('Already in this room');
        }

        const tier = BET_TIERS.find(t => t.id === room.bet_tier);
        const joinOrder = room.current_player_count + 1;

        // Add player to room
        try {
            await pool.query(
                `
                  insert into room_players (room_id, player_address, join_order, tx_hash, status)
                  values ($1,$2,$3,$4,$5)
                `,
                [room.id, playerAddress, joinOrder, transactionHash, PLAYER_STATUS.JOINED]
            );
        } catch (playerError) {
            console.error('Error joining room:', playerError);
            throw new Error('Failed to join room');
        }

        // Update pool
        const newPool = parseFloat(room.total_pool) + tier.amount;
        await pool.query(
            'update multiplayer_rooms set total_pool = $1 where id = $2',
            [newPool, room.id]
        );

        // Update cached room
        const cachedRoom = this.activeRooms.get(room.id);
        if (cachedRoom) {
            cachedRoom.players.push({
                address: playerAddress,
                joinOrder,
                status: PLAYER_STATUS.JOINED,
                score: 0,
                lives: 3
            });
            cachedRoom.total_pool = newPool;
        }

        console.log(`👤 Player joined room ${roomCode}: ${playerAddress} (${joinOrder}/${room.max_players})`);

        // Check if room is now full
        if (joinOrder >= room.max_players) {
            // Start countdown
            await this.startCountdown(room.id);
        }

        return {
            success: true,
            room: {
                id: room.id,
                roomCode: room.room_code,
                maxPlayers: room.max_players,
                currentPlayers: joinOrder,
                betTier: tier,
                status: room.status,
                gameSeed: room.game_seed,
                totalPool: newPool
            },
            joinOrder
        };
    }

    /**
     * Player indicates they are ready
     */
    async setPlayerReady(roomId, playerAddress) {
        await pool.query(
            `
              update room_players
              set is_ready = true,
                  status = $1,
                  ready_at = $2
              where room_id = $3
                and player_address = $4
            `,
            [PLAYER_STATUS.READY, new Date().toISOString(), roomId, playerAddress]
        );

        // Check if all players are ready
        const { rows: players } = await pool.query(
            'select is_ready from room_players where room_id = $1',
            [roomId]
        );
        const allReady = players.length > 0 && players.every(p => p.is_ready);

        return { success: true, allReady };
    }

    /**
     * Start countdown for game start
     */
    async startCountdown(roomId) {
        await pool.query(
            `
              update multiplayer_rooms
              set status = $1,
                  countdown_started_at = $2
              where id = $3
            `,
            [ROOM_STATUS.COUNTDOWN, new Date().toISOString(), roomId]
        );

        console.log(`⏱️ Countdown started for room ${roomId}`);

        // After 5 seconds, start the game
        setTimeout(() => this.startGame(roomId), 5000);
    }

    /**
     * Start the game
     */
    async startGame(roomId) {
        const room = this.activeRooms.get(roomId);
        if (!room) {
            console.error('Room not found in cache:', roomId);
            return;
        }

        // Update all players to playing
        await pool.query(
            `
              update room_players
              set status = $1
              where room_id = $2
            `,
            [PLAYER_STATUS.PLAYING, roomId]
        );

        // Update room status
        await pool.query(
            `
              update multiplayer_rooms
              set status = $1,
                  started_at = $2
              where id = $3
            `,
            [ROOM_STATUS.ACTIVE, new Date().toISOString(), roomId]
        );

        console.log(`🎮 Game started for room ${roomId}`);
    }

    /**
     * Record a super fruit hit (REQ-P2-005)
     */
    async recordSuperFruitHit(roomId, fruitId, playerAddress, hitNumber, damage, fruitType, fruitMaxHp, isFinalHit) {
        // Calculate points based on contribution
        const hitPoints = Math.floor(100 / fruitMaxHp); // Base points per hit
        const finalHitBonus = isFinalHit ? Math.floor(hitPoints * 0.15) : 0; // 15% bonus for final hit
        const totalPoints = hitPoints + finalHitBonus;

        try {
            await pool.query(
                `
                  insert into super_fruit_hits (
                    room_id,
                    fruit_id,
                    player_address,
                    hit_number,
                    damage,
                    fruit_type,
                    fruit_max_hp,
                    points_awarded,
                    is_final_hit
                  )
                  values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                `,
                [roomId, fruitId, playerAddress, hitNumber, damage, fruitType, fruitMaxHp, totalPoints, isFinalHit]
            );
        } catch (error) {
            console.error('Error recording super fruit hit:', error);
            return { success: false };
        }

        // Update player's super fruit stats
        await pool.query(
            `
              update room_players
              set super_fruit_hits = super_fruit_hits + 1,
                  contribution_score = contribution_score + $1
              where room_id = $2
                and player_address = $3
            `,
            [totalPoints, roomId, playerAddress]
        );

        return { success: true, points: totalPoints, isFinalHit };
    }

    /**
     * Update player score and lives
     */
    async updatePlayerState(roomId, playerAddress, score, lives) {
        try {
            await pool.query(
                `
                  update room_players
                  set score = $1,
                      lives = $2
                  where room_id = $3
                    and player_address = $4
                `,
                [score, lives, roomId, playerAddress]
            );
        } catch (error) {
            console.error('Error updating player state:', error);
            return { success: false };
        }

        // Check if player lost all lives
        if (lives <= 0) {
            await pool.query(
                `
                  update room_players
                  set status = $1,
                      finished_at = $2
                  where room_id = $3
                    and player_address = $4
                `,
                [PLAYER_STATUS.FINISHED, new Date().toISOString(), roomId, playerAddress]
            );

            // Check if game should end
            await this.checkGameEnd(roomId);
        }

        return { success: true };
    }

    /**
     * Check if game should end
     */
    async checkGameEnd(roomId) {
        const { rows: players } = await pool.query(
            'select * from room_players where room_id = $1',
            [roomId]
        );

        // Game ends when all but one player has finished
        const activePlayers = players.filter(p => p.status === PLAYER_STATUS.PLAYING);

        if (activePlayers.length <= 1) {
            await this.endGame(roomId);
        }
    }

    /**
     * End the game and distribute payouts
     */
    async endGame(roomId) {
        const { rows: roomRows } = await pool.query(
            'select * from multiplayer_rooms where id = $1 limit 1',
            [roomId]
        );
        const room = roomRows[0] || null;

        if (!room || room.status === ROOM_STATUS.COMPLETED) {
            return;
        }

        // Get all players sorted by score
        const { rows: players } = await pool.query(
            `
              select *
              from room_players
              where room_id = $1
              order by score desc
            `,
            [roomId]
        );

        const playerCount = players.length;
        const distribution = PAYOUT_DISTRIBUTION[playerCount];
        const totalPool = parseFloat(room.total_pool);
        const platformFee = totalPool * (room.platform_fee_percent / 100);
        const distributablePool = totalPool - platformFee;

        // Assign ranks and payouts
        for (let i = 0; i < players.length; i++) {
            const rank = i + 1;
            const payoutPercent = distribution[rank] || 0;
            const payout = distributablePool * payoutPercent;

            await pool.query(
                `
                  update room_players
                  set final_rank = $1,
                      payout = $2,
                      status = $3,
                      finished_at = $4
                  where id = $5
                `,
                [rank, payout, PLAYER_STATUS.FINISHED, new Date().toISOString(), players[i].id]
            );
        }

        // Update room as completed
        const winnerAddress = players[0]?.player_address;
        await pool.query(
            `
              update multiplayer_rooms
              set status = $1,
                  completed_at = $2,
                  winner_address = $3,
                  winner_payout = $4
              where id = $5
            `,
            [
                ROOM_STATUS.COMPLETED,
                new Date().toISOString(),
                winnerAddress,
                distributablePool * (distribution[1] || 0),
                roomId,
            ]
        );

        console.log(`🏆 Game completed for room ${roomId}. Winner: ${winnerAddress}`);

        // Clean up
        this.activeRooms.delete(roomId);
        this.fruitSequences.delete(roomId);

        return {
            success: true,
            winner: winnerAddress,
            rankings: players.map((p, i) => ({
                rank: i + 1,
                address: p.player_address,
                score: p.score,
                payout: distributablePool * (distribution[i + 1] || 0)
            }))
        };
    }

    /**
     * Get available rooms for quick match
     */
    async getAvailableRooms(betTierId) {
        const { rows: rooms } = await pool.query(
            `
              select *
              from multiplayer_rooms
              where status = $1
                and bet_tier = $2
                and expires_at > NOW()
              order by created_at asc
            `,
            [ROOM_STATUS.WAITING, betTierId]
        );

        return rooms.filter(r => r.current_player_count < r.max_players);
    }

    /**
     * Get room details
     */
    async getRoomDetails(roomId) {
        const { rows: roomRows } = await pool.query(
            'select * from multiplayer_rooms where id = $1 limit 1',
            [roomId]
        );
        const room = roomRows[0] || null;
        if (!room) return null;

        const { rows: roomPlayers } = await pool.query(
            `
              select
                player_address,
                join_order,
                status,
                is_ready,
                score,
                lives,
                final_rank,
                payout
              from room_players
              where room_id = $1
              order by join_order asc
            `,
            [roomId]
        );

        return {
            ...room,
            room_players: roomPlayers,
        };
    }
}

export default RoomManager;
