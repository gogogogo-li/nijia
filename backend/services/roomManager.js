/**
 * Room Manager Service
 * REQ-P2-004: Multiplayer Battle Mode (2-4 players)
 * 
 * Handles room creation, player joining, game synchronization,
 * and contribution-based scoring distribution
 */

import { supabase } from '../config/supabase.js';
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
        const { data: room, error } = await supabase
            .from('multiplayer_rooms')
            .insert({
                room_code: roomCode,
                max_players: maxPlayers,
                min_players: 2,
                bet_tier: betTierId,
                bet_amount: tier.amount,
                status: ROOM_STATUS.WAITING,
                game_seed: gameSeed,
                game_duration: 90,
                total_pool: tier.amount, // Creator's bet
                platform_fee_percent: tier.platformFee * 100,
                expires_at: expiresAt.toISOString(),
                created_by: creatorAddress
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating room:', error);
            throw new Error('Failed to create room');
        }

        // Add creator as first player
        const { error: playerError } = await supabase
            .from('room_players')
            .insert({
                room_id: room.id,
                player_address: creatorAddress,
                join_order: 1,
                tx_hash: transactionHash,
                status: PLAYER_STATUS.JOINED
            });

        if (playerError) {
            console.error('Error adding creator to room:', playerError);
            // Cleanup: delete the room
            await supabase.from('multiplayer_rooms').delete().eq('id', room.id);
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
        const { data: room, error } = await supabase
            .from('multiplayer_rooms')
            .select('*')
            .eq('room_code', roomCode)
            .single();

        if (error || !room) {
            throw new Error('Room not found');
        }

        if (room.status !== ROOM_STATUS.WAITING) {
            throw new Error('Room is no longer accepting players');
        }

        if (room.current_player_count >= room.max_players) {
            throw new Error('Room is full');
        }

        // Check if player already in room
        const { data: existingPlayer } = await supabase
            .from('room_players')
            .select('*')
            .eq('room_id', room.id)
            .eq('player_address', playerAddress)
            .single();

        if (existingPlayer) {
            throw new Error('Already in this room');
        }

        const tier = BET_TIERS.find(t => t.id === room.bet_tier);
        const joinOrder = room.current_player_count + 1;

        // Add player to room
        const { error: playerError } = await supabase
            .from('room_players')
            .insert({
                room_id: room.id,
                player_address: playerAddress,
                join_order: joinOrder,
                tx_hash: transactionHash,
                status: PLAYER_STATUS.JOINED
            });

        if (playerError) {
            console.error('Error joining room:', playerError);
            throw new Error('Failed to join room');
        }

        // Update pool
        const newPool = parseFloat(room.total_pool) + tier.amount;
        await supabase
            .from('multiplayer_rooms')
            .update({ total_pool: newPool })
            .eq('id', room.id);

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
        const { error } = await supabase
            .from('room_players')
            .update({
                is_ready: true,
                status: PLAYER_STATUS.READY,
                ready_at: new Date().toISOString()
            })
            .eq('room_id', roomId)
            .eq('player_address', playerAddress);

        if (error) {
            throw new Error('Failed to set ready status');
        }

        // Check if all players are ready
        const { data: players } = await supabase
            .from('room_players')
            .select('is_ready')
            .eq('room_id', roomId);

        const allReady = players && players.every(p => p.is_ready);

        return { success: true, allReady };
    }

    /**
     * Start countdown for game start
     */
    async startCountdown(roomId) {
        await supabase
            .from('multiplayer_rooms')
            .update({
                status: ROOM_STATUS.COUNTDOWN,
                countdown_started_at: new Date().toISOString()
            })
            .eq('id', roomId);

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
        await supabase
            .from('room_players')
            .update({ status: PLAYER_STATUS.PLAYING })
            .eq('room_id', roomId);

        // Update room status
        await supabase
            .from('multiplayer_rooms')
            .update({
                status: ROOM_STATUS.ACTIVE,
                started_at: new Date().toISOString()
            })
            .eq('id', roomId);

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

        const { error } = await supabase
            .from('super_fruit_hits')
            .insert({
                room_id: roomId,
                fruit_id: fruitId,
                player_address: playerAddress,
                hit_number: hitNumber,
                damage,
                fruit_type: fruitType,
                fruit_max_hp: fruitMaxHp,
                points_awarded: totalPoints,
                is_final_hit: isFinalHit
            });

        if (error) {
            console.error('Error recording super fruit hit:', error);
            return { success: false };
        }

        // Update player's super fruit stats
        await supabase
            .from('room_players')
            .update({
                super_fruit_hits: supabase.raw('super_fruit_hits + 1'),
                contribution_score: supabase.raw(`contribution_score + ${totalPoints}`)
            })
            .eq('room_id', roomId)
            .eq('player_address', playerAddress);

        return { success: true, points: totalPoints, isFinalHit };
    }

    /**
     * Update player score and lives
     */
    async updatePlayerState(roomId, playerAddress, score, lives) {
        const { error } = await supabase
            .from('room_players')
            .update({ score, lives })
            .eq('room_id', roomId)
            .eq('player_address', playerAddress);

        if (error) {
            console.error('Error updating player state:', error);
            return { success: false };
        }

        // Check if player lost all lives
        if (lives <= 0) {
            await supabase
                .from('room_players')
                .update({
                    status: PLAYER_STATUS.FINISHED,
                    finished_at: new Date().toISOString()
                })
                .eq('room_id', roomId)
                .eq('player_address', playerAddress);

            // Check if game should end
            await this.checkGameEnd(roomId);
        }

        return { success: true };
    }

    /**
     * Check if game should end
     */
    async checkGameEnd(roomId) {
        const { data: players } = await supabase
            .from('room_players')
            .select('*')
            .eq('room_id', roomId);

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
        const { data: room } = await supabase
            .from('multiplayer_rooms')
            .select('*')
            .eq('id', roomId)
            .single();

        if (!room || room.status === ROOM_STATUS.COMPLETED) {
            return;
        }

        // Get all players sorted by score
        const { data: players } = await supabase
            .from('room_players')
            .select('*')
            .eq('room_id', roomId)
            .order('score', { ascending: false });

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

            await supabase
                .from('room_players')
                .update({
                    final_rank: rank,
                    payout,
                    status: PLAYER_STATUS.FINISHED,
                    finished_at: new Date().toISOString()
                })
                .eq('id', players[i].id);
        }

        // Update room as completed
        const winnerAddress = players[0]?.player_address;
        await supabase
            .from('multiplayer_rooms')
            .update({
                status: ROOM_STATUS.COMPLETED,
                completed_at: new Date().toISOString(),
                winner_address: winnerAddress,
                winner_payout: distributablePool * (distribution[1] || 0)
            })
            .eq('id', roomId);

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
        const { data: rooms, error } = await supabase
            .from('multiplayer_rooms')
            .select(`
        *,
        room_players (
          player_address,
          join_order,
          status
        )
      `)
            .eq('status', ROOM_STATUS.WAITING)
            .eq('bet_tier', betTierId)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching available rooms:', error);
            return [];
        }

        return rooms.filter(r => r.current_player_count < r.max_players);
    }

    /**
     * Get room details
     */
    async getRoomDetails(roomId) {
        const { data: room, error } = await supabase
            .from('multiplayer_rooms')
            .select(`
        *,
        room_players (
          player_address,
          join_order,
          status,
          is_ready,
          score,
          lives,
          final_rank,
          payout
        )
      `)
            .eq('id', roomId)
            .single();

        if (error) {
            return null;
        }

        return room;
    }
}

export default RoomManager;
