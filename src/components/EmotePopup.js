import React, { useState, useEffect, useCallback } from 'react';
import multiplayerService from '../services/multiplayerService';
import './EmotePopup.css';

const EmotePopup = ({ gameId }) => {
    const [activeEmotes, setActiveEmotes] = useState([]);

    // Remove emote after animation
    const removeEmote = useCallback((emoteId) => {
        setActiveEmotes(prev => prev.filter(e => e.id !== emoteId));
    }, []);

    // Listen for incoming emotes
    useEffect(() => {
        const handleEmote = (data) => {
            if (data.game_id !== gameId) return;

            const emoteId = `${data.timestamp}-${data.emoteType}`;

            const newEmote = {
                id: emoteId,
                emoji: data.emoji,
                name: data.name,
                sender: data.sender,
                timestamp: data.timestamp
            };

            setActiveEmotes(prev => [...prev, newEmote]);

            // Remove after animation (3 seconds)
            setTimeout(() => {
                removeEmote(emoteId);
            }, 3000);
        };

        // Also listen for own sent emotes (confirmation)
        const handleSentEmote = (data) => {
            if (data.game_id !== gameId) return;

            const emoteId = `sent-${Date.now()}`;

            const newEmote = {
                id: emoteId,
                emoji: data.emoji,
                name: 'You',
                sender: 'self',
                isSelf: true
            };

            setActiveEmotes(prev => [...prev, newEmote]);

            setTimeout(() => {
                removeEmote(emoteId);
            }, 2000);
        };

        if (multiplayerService.socket) {
            multiplayerService.socket.on('emote:receive', handleEmote);
            multiplayerService.socket.on('emote:sent', handleSentEmote);
        }

        return () => {
            if (multiplayerService.socket) {
                multiplayerService.socket.off('emote:receive', handleEmote);
                multiplayerService.socket.off('emote:sent', handleSentEmote);
            }
        };
    }, [gameId, removeEmote]);

    if (activeEmotes.length === 0) return null;

    return (
        <div className="emote-popup-container">
            {activeEmotes.map((emote) => (
                <div
                    key={emote.id}
                    className={`emote-popup ${emote.isSelf ? 'self' : 'opponent'}`}
                >
                    <div className="emote-popup-bubble">
                        <span className="emote-popup-emoji">{emote.emoji}</span>
                    </div>
                    <span className="emote-popup-label">
                        {emote.isSelf ? 'Sent!' : 'Opponent'}
                    </span>
                </div>
            ))}
        </div>
    );
};

export default EmotePopup;
