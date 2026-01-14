/**
 * MultiplayerLeaderboard Component
 * REQ-P2-004: Live leaderboard panel for multiplayer games
 * 
 * Shows real-time rankings, scores, and lives during gameplay
 */

import React from 'react';
import { GiTrophyCup, GiSkullCrossedBones } from 'react-icons/gi';
import { FaHeart, FaHeartBroken } from 'react-icons/fa';
import multiplayerService from '../services/multiplayerService';
import './MultiplayerLeaderboard.css';

const MultiplayerLeaderboard = ({
    players = [],
    currentPlayerAddress,
    gameStatus = 'active'
}) => {
    // Sort players by score descending
    const sortedPlayers = [...players].sort((a, b) => {
        // Players with lives > 0 come first
        if (a.lives !== b.lives) {
            return b.lives - a.lives;
        }
        return b.score - a.score;
    });

    const getRankClass = (index) => {
        switch (index) {
            case 0: return 'rank-gold';
            case 1: return 'rank-silver';
            case 2: return 'rank-bronze';
            default: return '';
        }
    };

    const getRankIcon = (index) => {
        switch (index) {
            case 0: return '🥇';
            case 1: return '🥈';
            case 2: return '🥉';
            default: return `#${index + 1}`;
        }
    };

    return (
        <div className="mp-leaderboard">
            <div className="leaderboard-header">
                <GiTrophyCup className="header-icon" />
                <h3>LIVE RANKINGS</h3>
            </div>

            <div className="leaderboard-list">
                {sortedPlayers.map((player, index) => {
                    const isMe = player.address?.toLowerCase() === currentPlayerAddress?.toLowerCase();
                    const isEliminated = player.lives <= 0;

                    return (
                        <div
                            key={player.address || index}
                            className={`leaderboard-item ${getRankClass(index)} ${isMe ? 'is-me' : ''} ${isEliminated ? 'eliminated' : ''}`}
                        >
                            <div className="rank-badge">
                                {getRankIcon(index)}
                            </div>

                            <div className="player-details">
                                <div className="player-name">
                                    {isMe ? 'You' : multiplayerService.formatAddress(player.address)}
                                    {isMe && <span className="you-badge">ME</span>}
                                </div>
                                <div className="player-score">
                                    {player.score.toLocaleString()} pts
                                </div>
                            </div>

                            <div className="lives-display">
                                {isEliminated ? (
                                    <div className="eliminated-badge">
                                        <GiSkullCrossedBones />
                                    </div>
                                ) : (
                                    <div className="hearts">
                                        {Array(3).fill(null).map((_, i) => (
                                            <span key={i} className={`heart ${i < player.lives ? 'alive' : 'dead'}`}>
                                                {i < player.lives ? <FaHeart /> : <FaHeartBroken />}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Score difference indicator */}
            {sortedPlayers.length > 1 && (
                <div className="score-gap">
                    Gap to 1st: {sortedPlayers[0].score - (sortedPlayers.find(p =>
                        p.address?.toLowerCase() === currentPlayerAddress?.toLowerCase()
                    )?.score || 0)} pts
                </div>
            )}
        </div>
    );
};

export default MultiplayerLeaderboard;
