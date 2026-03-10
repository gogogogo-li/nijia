/**
 * Chat Service
 * Handles lobby chat messages with Supabase persistence
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

class ChatService {
    constructor() {
        this.supabase = createClient(supabaseUrl, supabaseKey);
        this.io = null;
        this.messageCache = []; // Keep last 50 messages in memory for quick access
        this.maxCacheSize = 50;
    }

    /**
     * Initialize with Socket.IO instance
     */
    initialize(io) {
        this.io = io;
        logger.info('💬 Chat service initialized');
    }

    /**
     * Send a lobby chat message
     * @param {string} senderAddress - Wallet address of sender
     * @param {string} message - Message content
     * @param {string} senderName - Optional display name
     */
    async sendLobbyMessage(senderAddress, message, senderName = null) {
        try {
            // Validate message
            if (!message || message.trim().length === 0) {
                return { success: false, error: 'Empty message' };
            }

            // Limit message length
            const trimmedMessage = message.trim().slice(0, 500);

            // Create message object
            const chatMessage = {
                sender_address: senderAddress,
                sender_name: senderName || null,
                message: trimmedMessage,
                chat_type: 'lobby',
                game_id: null,
                created_at: new Date().toISOString()
            };

            // Store in database
            const { data, error } = await this.supabase
                .from('chat_messages')
                .insert(chatMessage)
                .select()
                .single();

            if (error) {
                logger.error('Chat message insert error:', error.message);
                return { success: false, error: error.message };
            }

            // Add to cache
            this.messageCache.push(data);
            if (this.messageCache.length > this.maxCacheSize) {
                this.messageCache.shift();
            }

            // Broadcast to all lobby users
            if (this.io) {
                this.io.to('lobby').emit('chat:lobby:message', {
                    id: data.id,
                    sender: senderAddress,
                    senderName: senderName,
                    message: trimmedMessage,
                    timestamp: data.created_at
                });
            }

            logger.info(`💬 Lobby message from ${senderAddress.slice(0, 10)}...: "${trimmedMessage.slice(0, 30)}..."`);

            return { success: true, message: data };
        } catch (error) {
            logger.error('Chat service error:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get lobby chat history
     * @param {number} limit - Number of messages to fetch (default 50)
     */
    async getLobbyHistory(limit = 50) {
        try {
            // Try cache first if we have enough messages
            if (this.messageCache.length >= limit) {
                return {
                    success: true,
                    messages: this.messageCache.slice(-limit).map(m => ({
                        id: m.id,
                        sender: m.sender_address,
                        senderName: m.sender_name,
                        message: m.message,
                        timestamp: m.created_at
                    }))
                };
            }

            // Fetch from database
            const { data, error } = await this.supabase
                .from('chat_messages')
                .select('*')
                .eq('chat_type', 'lobby')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) {
                logger.error('Chat history fetch error:', error.message);
                return { success: false, error: error.message };
            }

            // Update cache
            this.messageCache = data.reverse();

            return {
                success: true,
                messages: data.reverse().map(m => ({
                    id: m.id,
                    sender: m.sender_address,
                    senderName: m.sender_name,
                    message: m.message,
                    timestamp: m.created_at
                }))
            };
        } catch (error) {
            logger.error('Chat history error:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send a game chat message (for results screen)
     * @param {number} gameId - Game ID
     * @param {string} senderAddress - Wallet address of sender
     * @param {string} message - Message content
     */
    async sendGameMessage(gameId, senderAddress, message) {
        try {
            const trimmedMessage = message.trim().slice(0, 500);

            const chatMessage = {
                sender_address: senderAddress,
                message: trimmedMessage,
                chat_type: 'game',
                game_id: gameId,
                created_at: new Date().toISOString()
            };

            const { data, error } = await this.supabase
                .from('chat_messages')
                .insert(chatMessage)
                .select()
                .single();

            if (error) {
                return { success: false, error: error.message };
            }

            // Broadcast to game room
            if (this.io) {
                this.io.to(`game:${gameId}`).emit('chat:game:message', {
                    id: data.id,
                    sender: senderAddress,
                    message: trimmedMessage,
                    timestamp: data.created_at
                });
            }

            return { success: true, message: data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Get game chat history
     * @param {number} gameId - Game ID
     */
    async getGameHistory(gameId) {
        try {
            const { data, error } = await this.supabase
                .from('chat_messages')
                .select('*')
                .eq('game_id', gameId)
                .order('created_at', { ascending: true });

            if (error) {
                return { success: false, error: error.message };
            }

            return {
                success: true,
                messages: data.map(m => ({
                    id: m.id,
                    sender: m.sender_address,
                    message: m.message,
                    timestamp: m.created_at
                }))
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Setup socket event handlers for a connected user
     * @param {Socket} socket - Socket.IO socket instance
     */
    setupSocketHandlers(socket) {
        const walletAddress = socket.walletAddress;

        // Join lobby room for chat
        socket.join('lobby');

        // Handle lobby message
        socket.on('chat:lobby:send', async (data) => {
            if (!walletAddress) {
                socket.emit('chat:error', { error: 'Not authenticated' });
                return;
            }

            const result = await this.sendLobbyMessage(
                walletAddress,
                data.message,
                data.senderName
            );

            if (!result.success) {
                socket.emit('chat:error', { error: result.error });
            }
        });

        // Handle game message
        socket.on('chat:game:send', async (data) => {
            if (!walletAddress || !data.gameId) {
                socket.emit('chat:error', { error: 'Invalid request' });
                return;
            }

            const result = await this.sendGameMessage(
                data.gameId,
                walletAddress,
                data.message
            );

            if (!result.success) {
                socket.emit('chat:error', { error: result.error });
            }
        });

        // Handle history request
        socket.on('chat:lobby:history', async () => {
            const result = await this.getLobbyHistory(50);
            socket.emit('chat:lobby:history', result);
        });
    }
}

// Export singleton
const chatService = new ChatService();
export default chatService;
