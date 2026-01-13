import React, { useState, useEffect, useRef } from 'react';
import { FiMessageCircle, FiSend, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import multiplayerService from '../services/multiplayerService';
import './GameChat.css';

const GameChat = ({ gameId, walletAddress }) => {
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isExpanded, setIsExpanded] = useState(true); // Start expanded on results
    const [isLoading, setIsLoading] = useState(true);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // Format timestamp
    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // Load game chat history on mount and ensure socket connection
    useEffect(() => {
        if (!gameId) return;

        // Ensure socket is connected for game chat
        if (!multiplayerService.isConnected() && walletAddress) {
            console.log('🔌 Reconnecting socket for game chat...');
            multiplayerService.connect(walletAddress);
        }

        // Join the game room for chat
        if (multiplayerService.socket) {
            multiplayerService.socket.emit('join:game', { gameId });
        }

        const loadHistory = async () => {
            try {
                const response = await fetch(
                    `${process.env.REACT_APP_API_BASE_URL}/api/multiplayer/chat/game/${gameId}`
                );
                const data = await response.json();
                if (data.success) {
                    setMessages(data.messages || []);
                }
            } catch (err) {
                console.error('Failed to load game chat history:', err);
            } finally {
                setIsLoading(false);
            }
        };

        loadHistory();
    }, [gameId, walletAddress]);

    // Setup socket listeners for game chat
    useEffect(() => {
        if (!gameId) return;

        const handleMessage = (data) => {
            // Only add messages for this game
            if (String(data.game_id) !== String(gameId)) return;

            setMessages(prev => [...prev, {
                id: data.id || Date.now(),
                sender: data.sender,
                message: data.message,
                timestamp: data.timestamp || new Date().toISOString()
            }]);
        };

        // Listen for game-specific chat messages
        if (multiplayerService.socket) {
            multiplayerService.socket.on('chat:game:message', handleMessage);
        }

        return () => {
            if (multiplayerService.socket) {
                multiplayerService.socket.off('chat:game:message', handleMessage);
            }
        };
    }, [gameId]);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (isExpanded && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isExpanded]);

    // Send message
    const sendMessage = () => {
        const message = inputValue.trim();
        if (!message || !walletAddress || !gameId) return;

        // Emit via socket
        if (multiplayerService.socket) {
            multiplayerService.socket.emit('chat:game:send', {
                gameId,
                message
            });
        }

        setInputValue('');
        inputRef.current?.focus();
    };

    // Handle Enter key
    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const isMyMessage = (sender) => sender === walletAddress;

    if (!gameId) return null;

    return (
        <div className={`game-chat ${isExpanded ? 'expanded' : 'collapsed'}`}>
            {/* Header */}
            <div className="game-chat-header" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="game-chat-title">
                    <FiMessageCircle className="chat-icon" />
                    <span>Game Chat</span>
                </div>
                <button className="toggle-btn">
                    {isExpanded ? <FiChevronDown /> : <FiChevronUp />}
                </button>
            </div>

            {/* Chat content */}
            {isExpanded && (
                <div className="game-chat-content">
                    {/* Messages */}
                    <div className="game-messages-container">
                        {isLoading ? (
                            <div className="chat-loading">Loading...</div>
                        ) : messages.length === 0 ? (
                            <div className="chat-empty">Say GG! 🎮</div>
                        ) : (
                            messages.map((msg, idx) => (
                                <div
                                    key={msg.id || idx}
                                    className={`game-message ${isMyMessage(msg.sender) ? 'my-message' : 'opponent-message'}`}
                                >
                                    <div className="message-header">
                                        <span className="message-sender">
                                            {isMyMessage(msg.sender) ? 'You' : 'Opponent'}
                                        </span>
                                        <span className="message-time">{formatTime(msg.timestamp)}</span>
                                    </div>
                                    <div className="message-content">{msg.message}</div>
                                </div>
                            ))
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    {walletAddress ? (
                        <div className="game-chat-input-container">
                            <input
                                ref={inputRef}
                                type="text"
                                className="game-chat-input"
                                placeholder="GG, well played!"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyPress={handleKeyPress}
                                maxLength={200}
                            />
                            <button
                                className="send-btn"
                                onClick={sendMessage}
                                disabled={!inputValue.trim()}
                            >
                                <FiSend />
                            </button>
                        </div>
                    ) : (
                        <div className="chat-connect-prompt">
                            Connect wallet to chat
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default GameChat;
