import React, { useState, useCallback } from 'react';
import multiplayerService from '../services/multiplayerService';
import './QuickEmotes.css';

// Available emotes - matches backend GameManager.EMOTES
const EMOTES = [
    { type: 'laugh', emoji: '😂', name: 'Laugh' },
    { type: 'angry', emoji: '😡', name: 'Angry' },
    { type: 'thumbsup', emoji: '👍', name: 'Thumbs Up' },
    { type: 'thumbsdown', emoji: '👎', name: 'Thumbs Down' },
    { type: 'fire', emoji: '🔥', name: 'Fire' },
    { type: 'skull', emoji: '💀', name: 'Skull' },
    { type: 'wave', emoji: '👋', name: 'Wave' },
    { type: 'gg', emoji: 'GG', name: 'Good Game' }
];

const COOLDOWN_MS = 2000; // 2 second cooldown between emotes

const QuickEmotes = ({ gameId, isOpen, onClose }) => {
    const [cooldown, setCooldown] = useState(false);
    const [lastSentEmote, setLastSentEmote] = useState(null);

    const sendEmote = useCallback((emoteType) => {
        if (cooldown || !gameId) return;

        // Send via socket
        if (multiplayerService.socket) {
            multiplayerService.socket.emit('emote:send', {
                gameId,
                emoteType
            });
        }

        // Set cooldown
        setCooldown(true);
        setLastSentEmote(emoteType);

        setTimeout(() => {
            setCooldown(false);
            setLastSentEmote(null);
        }, COOLDOWN_MS);

        // Close picker after sending
        if (onClose) {
            setTimeout(onClose, 300);
        }
    }, [gameId, cooldown, onClose]);

    if (!isOpen) return null;

    return (
        <div className="quick-emotes-overlay" onClick={onClose}>
            <div className="quick-emotes-container" onClick={(e) => e.stopPropagation()}>
                <div className="emotes-grid">
                    {EMOTES.map((emote) => (
                        <button
                            key={emote.type}
                            className={`emote-btn ${cooldown && lastSentEmote === emote.type ? 'sent' : ''} ${cooldown ? 'cooldown' : ''}`}
                            onClick={() => sendEmote(emote.type)}
                            disabled={cooldown}
                            title={emote.name}
                        >
                            <span className="emote-emoji">{emote.emoji}</span>
                        </button>
                    ))}
                </div>
                {cooldown && (
                    <div className="cooldown-indicator">
                        <div className="cooldown-bar" style={{ animationDuration: `${COOLDOWN_MS}ms` }} />
                    </div>
                )}
            </div>
        </div>
    );
};

// Emote trigger button component
export const EmoteTrigger = ({ onClick, disabled }) => {
    return (
        <button
            className="emote-trigger-btn"
            onClick={onClick}
            disabled={disabled}
            title="Send reaction"
        >
            <span className="emote-trigger-icon">😊</span>
        </button>
    );
};

export default QuickEmotes;
