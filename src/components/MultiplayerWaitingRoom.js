/**
 * MultiplayerWaitingRoom Component
 * REQ-P2-004: Waiting room UI for 2-4 player multiplayer
 * 
 * Shows player slots, ready status, and countdown timer
 */

import React, { useState, useEffect, useCallback } from 'react';
import { GiCrossedSwords, GiTrophyCup } from 'react-icons/gi';
import { FaCheck, FaHourglass, FaUsers } from 'react-icons/fa';
import multiplayerService from '../services/multiplayerService';
import './MultiplayerWaitingRoom.css';

// Payout distribution by player count
const PAYOUT_DISTRIBUTION = {
    2: [{ rank: 1, percent: 100, label: 'Winner' }],
    3: [
        { rank: 1, percent: 70, label: '1st' },
        { rank: 2, percent: 30, label: '2nd' }
    ],
    4: [
        { rank: 1, percent: 50, label: '1st' },
        { rank: 2, percent: 30, label: '2nd' },
        { rank: 3, percent: 20, label: '3rd' }
    ]
};

const MultiplayerWaitingRoom = ({
    roomData,
    walletAddress,
    onGameStart,
    onLeave,
    socket
}) => {
    const [players, setPlayers] = useState(roomData?.players || []);
    const [countdown, setCountdown] = useState(null);
    const [isReady, setIsReady] = useState(false);
    const [roomStatus, setRoomStatus] = useState(roomData?.status || 'waiting');

    const maxPlayers = roomData?.maxPlayers || 2;
    const betAmount = roomData?.betAmount || 0;
    const roomCode = roomData?.roomCode || '';
    const payouts = PAYOUT_DISTRIBUTION[maxPlayers] || PAYOUT_DISTRIBUTION[2];

    // Listen for room updates
    useEffect(() => {
        if (!socket) return;

        const handlePlayerJoined = (data) => {
            console.log('Player joined:', data);
            setPlayers(prev => {
                const exists = prev.find(p => p.address === data.playerAddress);
                if (exists) return prev;
                return [...prev, {
                    address: data.playerAddress,
                    joinOrder: data.joinOrder,
                    status: 'joined',
                    isReady: false
                }];
            });
        };

        const handlePlayerReady = (data) => {
            console.log('Player ready:', data);
            setPlayers(prev => prev.map(p =>
                p.address === data.playerAddress
                    ? { ...p, isReady: true, status: 'ready' }
                    : p
            ));
        };

        const handlePlayerLeft = (data) => {
            console.log('Player left:', data);
            setPlayers(prev => prev.filter(p => p.address !== data.playerAddress));
        };

        const handleCountdownStart = (data) => {
            console.log('Countdown started:', data);
            setRoomStatus('countdown');
            setCountdown(data.seconds || 5);
        };

        const handleGameStart = (data) => {
            console.log('Game starting:', data);
            if (onGameStart) {
                onGameStart(data);
            }
        };

        socket.on('player:joined', handlePlayerJoined);
        socket.on('player:ready', handlePlayerReady);
        socket.on('player:left', handlePlayerLeft);
        socket.on('room:countdown', handleCountdownStart);
        socket.on('game:start', handleGameStart);

        return () => {
            socket.off('player:joined', handlePlayerJoined);
            socket.off('player:ready', handlePlayerReady);
            socket.off('player:left', handlePlayerLeft);
            socket.off('room:countdown', handleCountdownStart);
            socket.off('game:start', handleGameStart);
        };
    }, [socket, onGameStart]);

    // Countdown timer
    useEffect(() => {
        if (countdown === null || countdown <= 0) return;

        const timer = setTimeout(() => {
            setCountdown(prev => prev - 1);
        }, 1000);

        if (countdown === 0) {
            // Game should start
            console.log('Countdown complete, game starting...');
        }

        return () => clearTimeout(timer);
    }, [countdown]);

    // Handle ready button
    const handleReady = useCallback(async () => {
        if (isReady) return;

        try {
            await multiplayerService.setPlayerReady(roomData.id, walletAddress);
            setIsReady(true);
        } catch (error) {
            console.error('Failed to set ready:', error);
        }
    }, [isReady, roomData?.id, walletAddress]);

    // Create empty slots
    const emptySlots = Array(maxPlayers - players.length).fill(null);

    return (
        <div className="waiting-room">
            {/* Background */}
            <div className="waiting-room-bg">
                <div className="bg-gradient"></div>
                <div className="floating-swords">
                    <GiCrossedSwords className="sword-icon sword-1" />
                    <GiCrossedSwords className="sword-icon sword-2" />
                </div>
            </div>

            {/* Header */}
            <div className="waiting-room-header">
                <button className="leave-btn" onClick={onLeave}>
                    ← Leave Room
                </button>
                <div className="room-code-badge">
                    <span className="code-label">ROOM CODE</span>
                    <span className="code-value">{roomCode}</span>
                </div>
            </div>

            {/* Title */}
            <div className="waiting-room-title">
                <h1>
                    <FaUsers className="title-icon" />
                    {roomStatus === 'countdown' ? 'GET READY!' : 'WAITING FOR PLAYERS'}
                </h1>
                <p className="stake-info">
                    Stake: <span className="amount">{betAmount} HACK</span> per player
                </p>
            </div>

            {/* Countdown Overlay */}
            {countdown !== null && countdown > 0 && (
                <div className="countdown-overlay">
                    <div className="countdown-number">{countdown}</div>
                    <div className="countdown-text">Game Starting...</div>
                </div>
            )}

            {/* Player Slots */}
            <div className={`player-slots slots-${maxPlayers}`}>
                {players.map((player, index) => {
                    const isMe = player.address?.toLowerCase() === walletAddress?.toLowerCase();

                    return (
                        <div
                            key={player.address || index}
                            className={`player-slot filled ${player.isReady ? 'ready' : ''} ${isMe ? 'is-me' : ''}`}
                        >
                            <div className="slot-glow"></div>
                            <div className="slot-content">
                                <div className="player-avatar">
                                    <span className="avatar-text">
                                        {player.address?.slice(2, 4).toUpperCase() || '??'}
                                    </span>
                                    {player.isReady && (
                                        <div className="ready-badge">
                                            <FaCheck />
                                        </div>
                                    )}
                                </div>
                                <div className="player-info">
                                    <div className="player-name">
                                        {isMe ? 'You' : multiplayerService.formatAddress(player.address)}
                                    </div>
                                    <div className={`player-status ${player.isReady ? 'ready' : 'waiting'}`}>
                                        {player.isReady ? (
                                            <>
                                                <FaCheck /> Ready
                                            </>
                                        ) : (
                                            <>
                                                <FaHourglass /> Waiting
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="slot-number">#{player.joinOrder || index + 1}</div>
                            </div>
                        </div>
                    );
                })}

                {/* Empty Slots */}
                {emptySlots.map((_, index) => (
                    <div key={`empty-${index}`} className="player-slot empty">
                        <div className="slot-content">
                            <div className="empty-avatar">
                                <span className="plus-icon">+</span>
                            </div>
                            <div className="empty-text">Waiting for player...</div>
                            <div className="slot-number">#{players.length + index + 1}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Prize Pool Info */}
            <div className="prize-pool-section">
                <div className="prize-pool-card">
                    <GiTrophyCup className="trophy-icon" />
                    <div className="pool-info">
                        <div className="pool-label">Total Prize Pool</div>
                        <div className="pool-amount">
                            {(betAmount * players.length).toFixed(2)} HACK
                        </div>
                    </div>
                </div>

                <div className="payout-distribution">
                    <h4>Payout Distribution</h4>
                    <div className="payout-bars">
                        {payouts.map((payout, idx) => (
                            <div key={idx} className="payout-item">
                                <span className="payout-rank">{payout.label}</span>
                                <div className="payout-bar">
                                    <div
                                        className="payout-fill"
                                        style={{ width: `${payout.percent}%` }}
                                    ></div>
                                </div>
                                <span className="payout-percent">{payout.percent}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Ready Button */}
            {roomStatus === 'waiting' && !isReady && (
                <button
                    className="ready-btn"
                    onClick={handleReady}
                    disabled={players.length < 2}
                >
                    <FaCheck className="btn-icon" />
                    I'M READY!
                </button>
            )}

            {isReady && roomStatus === 'waiting' && (
                <div className="ready-status">
                    <FaCheck className="status-icon" />
                    Waiting for other players to ready up...
                </div>
            )}

            {/* Share Code Hint */}
            {players.length < maxPlayers && (
                <div className="share-hint">
                    <p>Share the room code with friends to invite them!</p>
                    <button
                        className="copy-btn"
                        onClick={() => {
                            navigator.clipboard.writeText(roomCode);
                        }}
                    >
                        📋 Copy Code
                    </button>
                </div>
            )}
        </div>
    );
};

export default MultiplayerWaitingRoom;
