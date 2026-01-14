/**
 * Synchronized Multiplayer Game Screen
 * Shared environment where all players compete for same items
 * First to 400 points wins!
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSyncMultiplayer } from '../hooks/useSyncMultiplayer';
import multiplayerService from '../services/multiplayerService';
import { MULTIPLAYER_CONFIG } from '../config/gameConfig';
import './MultiplayerGame.css';

const SyncMultiplayerGame = ({ roomId, walletAddress, onGameComplete, onBack }) => {
    const canvasRef = useRef(null);
    const animationRef = useRef(null);

    const [gamePhase, setGamePhase] = useState('waiting'); // waiting, countdown, playing, ended
    const [countdown, setCountdown] = useState(3);
    const [particles, setParticles] = useState([]);

    const {
        syncItems,
        myScore,
        myLives,
        players,
        announcement,
        milestoneReached,
        gameEnded,
        winner,
        startSync,
        stopSync,
        attemptSlash,
        updateSyncItems
    } = useSyncMultiplayer(roomId, walletAddress, canvasRef);

    // Start game when all players ready
    useEffect(() => {
        if (gamePhase === 'waiting') {
            // Wait for game start signal
            const checkStart = async () => {
                try {
                    const roomData = await multiplayerService.getRoomDetails(roomId);
                    if (roomData.status === 'playing') {
                        setGamePhase('countdown');
                    }
                } catch (error) {
                    console.error('Error checking room status:', error);
                }
            };

            const interval = setInterval(checkStart, 1000);
            return () => clearInterval(interval);
        }
    }, [gamePhase, roomId]);

    // Countdown
    useEffect(() => {
        if (gamePhase !== 'countdown') return;

        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    setGamePhase('playing');
                    startSync();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [gamePhase, startSync]);

    // Game ended
    useEffect(() => {
        if (gameEnded) {
            setGamePhase('ended');
            stopSync();
        }
    }, [gameEnded, stopSync]);

    // Handle slash detection on canvas
    const handleCanvasClick = useCallback((e) => {
        if (gamePhase !== 'playing') return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Check collision with items
        syncItems.forEach(item => {
            if (item.slashed) return;

            const dx = x - item.x;
            const dy = y - item.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < item.hitBox) {
                attemptSlash(item.id);

                // Create particles
                createParticles(item.x, item.y, item.type.color);
            }
        });
    }, [gamePhase, syncItems, attemptSlash]);

    // Create particle effect
    const createParticles = (x, y, color) => {
        const newParticles = [];
        for (let i = 0; i < 10; i++) {
            newParticles.push({
                id: Date.now() + i,
                x,
                y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                color,
                life: 1
            });
        }
        setParticles(prev => [...prev, ...newParticles]);
    };

    // Animation loop
    useEffect(() => {
        if (gamePhase !== 'playing') return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        const animate = () => {
            // Clear canvas
            ctx.fillStyle = 'rgba(10, 20, 30, 0.3)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Update and draw items
            updateSyncItems();

            syncItems.forEach(item => {
                if (item.slashed) return;

                ctx.save();
                ctx.translate(item.x, item.y);
                ctx.rotate(item.rotation);

                // Draw fruit emoji
                ctx.font = `${item.radius * 1.5}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(item.type.symbol, 0, 0);

                // Glow effect
                ctx.shadowColor = item.type.color;
                ctx.shadowBlur = 15;

                ctx.restore();
            });

            // Update and draw particles
            setParticles(prev => prev.map(p => ({
                ...p,
                x: p.x + p.vx,
                y: p.y + p.vy,
                life: p.life - 0.02
            })).filter(p => p.life > 0));

            particles.forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 5 * p.life, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.life;
                ctx.fill();
                ctx.globalAlpha = 1;
            });

            animationRef.current = requestAnimationFrame(animate);
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [gamePhase, syncItems, particles, updateSyncItems]);

    // Check for win condition
    useEffect(() => {
        if (myScore >= MULTIPLAYER_CONFIG.targetScore && !gameEnded) {
            // I won!
            console.log('🏆 Won the game!');
        }
    }, [myScore, gameEnded]);

    const isWinner = winner?.toLowerCase() === walletAddress.toLowerCase();

    return (
        <div className="sync-multiplayer-game">
            {/* Header with scores */}
            <div className="sync-game-header">
                <div className="my-stats">
                    <span className="score">{myScore}</span>
                    <span className="lives">{'❤️'.repeat(myLives)}</span>
                </div>

                <div className="milestones">
                    {MULTIPLAYER_CONFIG.milestones.map(m => (
                        <span
                            key={m}
                            className={`milestone ${myScore >= m ? 'reached' : ''}`}
                        >
                            {m}
                        </span>
                    ))}
                </div>

                <div className="target">
                    🎯 First to {MULTIPLAYER_CONFIG.targetScore} wins!
                </div>
            </div>

            {/* Leaderboard */}
            <div className="sync-leaderboard">
                {players.sort((a, b) => b.score - a.score).map((p, i) => (
                    <div
                        key={p.address}
                        className={`player-row ${p.address.toLowerCase() === walletAddress.toLowerCase() ? 'me' : ''}`}
                    >
                        <span className="rank">#{i + 1}</span>
                        <span className="address">{p.address.slice(0, 6)}...</span>
                        <span className="player-score">{p.score}</span>
                    </div>
                ))}
            </div>

            {/* Game canvas */}
            <canvas
                ref={canvasRef}
                width={800}
                height={600}
                className="sync-game-canvas"
                onClick={handleCanvasClick}
                onTouchStart={handleCanvasClick}
            />

            {/* Countdown overlay */}
            {gamePhase === 'countdown' && (
                <div className="countdown-overlay">
                    <div className="countdown-number">{countdown}</div>
                </div>
            )}

            {/* Waiting overlay */}
            {gamePhase === 'waiting' && (
                <div className="waiting-overlay">
                    <div className="waiting-text">Waiting for players...</div>
                </div>
            )}

            {/* Announcement overlay */}
            {announcement && (
                <div className="announcement-overlay">
                    <div className="announcement-text">{announcement}</div>
                </div>
            )}

            {/* Game ended overlay */}
            {gamePhase === 'ended' && (
                <div className={`game-ended-overlay ${isWinner ? 'winner' : 'loser'}`}>
                    <div className="result-text">
                        {isWinner ? '🏆 YOU WIN!' : '💔 Game Over'}
                    </div>
                    <div className="final-score">Final Score: {myScore}</div>
                    <button className="back-button" onClick={onBack}>
                        Back to Lobby
                    </button>
                </div>
            )}
        </div>
    );
};

export default SyncMultiplayerGame;
