import React, { useState, useEffect, useRef } from 'react';
import { FiMessageCircle, FiSend, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import multiplayerService from '../services/multiplayerService';
import './LobbyChat.css';

const LobbyChat = ({ walletAddress, playerNickname }) => {
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // Truncate wallet address for display
    const formatAddress = (address) => {
        if (!address) return 'Anonymous';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    // Format timestamp
    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // Load chat history on mount
    useEffect(() => {
        const loadHistory = async () => {
            try {
                const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/api/multiplayer/chat/history?limit=50`);
                const data = await response.json();
                if (data.success) {
                    setMessages(data.messages || []);
                }
            } catch (err) {
                console.error('Failed to load chat history:', err);
            } finally {
                setIsLoading(false);
            }
        };

        loadHistory();
    }, []);

    // Clear messages when wallet disconnects (session ends)
    useEffect(() => {
        if (!walletAddress) {
            // User disconnected - clear local messages
            setMessages([]);
            setUnreadCount(0);
            setIsExpanded(false);
        }
    }, [walletAddress]);

    // Setup socket listeners
    useEffect(() => {
        const handleMessage = (data) => {
            setMessages(prev => [...prev, {
                id: data.id || Date.now(),
                sender: data.sender,
                senderName: data.senderName,
                message: data.message,
                timestamp: data.timestamp || new Date().toISOString()
            }]);

            // Increment unread if collapsed
            if (!isExpanded) {
                setUnreadCount(prev => prev + 1);
            }
        };

        // Listen for lobby messages via socket
        if (multiplayerService.socket) {
            multiplayerService.socket.on('chat:lobby:message', handleMessage);
        }

        return () => {
            if (multiplayerService.socket) {
                multiplayerService.socket.off('chat:lobby:message', handleMessage);
            }
        };
    }, [isExpanded]);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (isExpanded && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isExpanded]);

    // Clear unread when expanded
    useEffect(() => {
        if (isExpanded) {
            setUnreadCount(0);
        }
    }, [isExpanded]);

    // Send message
    const sendMessage = () => {
        const message = inputValue.trim();
        if (!message || !walletAddress) return;

        // Emit via socket
        if (multiplayerService.socket) {
            multiplayerService.socket.emit('chat:lobby:send', {
                message,
                senderName: playerNickname || null
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

    return (
        <div className={`lobby-chat ${isExpanded ? 'expanded' : 'collapsed'}`}>
            {/* Header - Always visible */}
            <div className="chat-header" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="chat-title">
                    <FiMessageCircle className="chat-icon" />
                    <span>Lobby Chat</span>
                    {unreadCount > 0 && (
                        <span className="unread-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                    )}
                </div>
                <button className="toggle-btn">
                    {isExpanded ? <FiChevronDown /> : <FiChevronUp />}
                </button>
            </div>

            {/* Chat content - Only visible when expanded */}
            {isExpanded && (
                <div className="chat-content">
                    {/* Messages */}
                    <div className="messages-container">
                        {isLoading ? (
                            <div className="chat-loading">Loading messages...</div>
                        ) : messages.length === 0 ? (
                            <div className="chat-empty">No messages yet. Say hello! 👋</div>
                        ) : (
                            messages.map((msg, idx) => (
                                <div
                                    key={msg.id || idx}
                                    className={`message ${isMyMessage(msg.sender) ? 'my-message' : 'other-message'}`}
                                >
                                    <div className="message-header">
                                        <span className="message-sender">
                                            {isMyMessage(msg.sender) ? 'You' : (msg.senderName || formatAddress(msg.sender))}
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
                        <div className="chat-input-container">
                            <input
                                ref={inputRef}
                                type="text"
                                className="chat-input"
                                placeholder="Type a message..."
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyPress={handleKeyPress}
                                maxLength={500}
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

export default LobbyChat;
