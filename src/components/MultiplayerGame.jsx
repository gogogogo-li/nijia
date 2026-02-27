import React, { useState, useEffect, useCallback } from 'react';
import multiplayerService from '../services/multiplayerService';
import MultiplayerLeaderboard from './MultiplayerLeaderboard';
import './MultiplayerGame.css';
import { GiHeartPlus, GiEmptyHourglass, GiTrophyCup, GiCrossedSwords } from 'react-icons/gi';

const MultiplayerGame = ({ gameId, roomId, walletAddress, onGameComplete, onBack }) => {
    const [gameState, setGameState] = useState('countdown'); // 'countdown', 'playing', 'completed'
    const [countdown, setCountdown] = useState(3);
    const [timeLeft, setTimeLeft] = useState(60);
    const [playerLives, setPlayerLives] = useState(3);
    const [opponentLives, setOpponentLives] = useState(3);
    const [playerScore, setPlayerScore] = useState(0);
    const [opponentScore, setOpponentScore] = useState(0);
    const [isPlayer1, setIsPlayer1] = useState(true);
    const [game, setGame] = useState(null);
    const [disconnectWarning, setDisconnectWarning] = useState(false);
    const [gracePeriodLeft, setGracePeriodLeft] = useState(5);
    const [gameOutcome, setGameOutcome] = useState(null); // 'won', 'lost', 'draw'
    const [showOutcomeAnimation, setShowOutcomeAnimation] = useState(false);

    // REQ-P2-004: Multi-player support (2-4 players)
    const [players, setPlayers] = useState([]);
    const [isRoomMode, setIsRoomMode] = useState(!!roomId);
    const [showLeaderboard, setShowLeaderboard] = useState(true);

    // Fetch game info on mount
    useEffect(() => {
        const fetchGame = async () => {
            try {
                // REQ-P2-004: Handle room-based games
                if (isRoomMode && roomId) {
                    const roomData = await multiplayerService.getRoomDetails(roomId);
                    setGame(roomData);

                    // Set players from room data
                    const roomPlayers = roomData.room_players?.map(p => ({
                        address: p.player_address,
                        score: p.score || 0,
                        lives: p.lives || 3,
                        status: p.status
                    })) || [];
                    setPlayers(roomPlayers);

                    // Find my player index
                    const myIndex = roomPlayers.findIndex(p =>
                        multiplayerService.compareAddresses(p.address, walletAddress)
                    );
                    setIsPlayer1(myIndex === 0);

                    console.log(`🎮 Room loaded: ${roomPlayers.length} players`);
                } else {
                    // Legacy 2-player game mode
                    const gameData = await multiplayerService.getGame(gameId);
                    setGame(gameData);

                    const isP1 = multiplayerService.compareAddresses(gameData.player1, walletAddress);
                    setIsPlayer1(isP1);

                    // Convert to players array for unified handling
                    setPlayers([
                        { address: gameData.player1, score: 0, lives: 3 },
                        { address: gameData.player2, score: 0, lives: 3 }
                    ]);

                    console.log('🎮 Game loaded (2-player mode)');
                }
            } catch (error) {
                console.error('Error fetching game:', error);
            }
        };

        fetchGame();
    }, [gameId, roomId, walletAddress, isRoomMode]);

    // Countdown sync with server
    useEffect(() => {
        if (!game || !game.countdown_start_at || gameState !== 'countdown') return;

        const serverCountdownStart = game.countdown_start_at;

        const interval = setInterval(() => {
            const now = Date.now();
            const elapsed = (now - serverCountdownStart) / 1000;
            const remaining = Math.max(0, 3 - Math.floor(elapsed));

            setCountdown(remaining);

            if (remaining === 0) {
                setGameState('playing');
                clearInterval(interval);
            }
        }, 100);

        return () => clearInterval(interval);
    }, [game, gameState]);

    // 60-second game timer
    useEffect(() => {
        if (gameState !== 'playing') return;

        const startTime = Date.now();
        const gameDuration = 60000; // 60 seconds

        const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, Math.ceil((gameDuration - elapsed) / 1000));

            setTimeLeft(remaining);

            if (remaining === 0) {
                // Time's up! Submit score
                handleGameEnd();
                clearInterval(interval);
            }
        }, 100);

        return () => clearInterval(interval);
    }, [gameState]);

    // Listen for real-time updates - ALL LISTENERS IN ONE PLACE
    useEffect(() => {
        const handleDisconnect = () => {
            setDisconnectWarning(true);
            let remaining = 5;

            const interval = setInterval(() => {
                remaining--;
                setGracePeriodLeft(remaining);

                if (remaining <= 0) {
                    clearInterval(interval);
                    console.log('❌ Disconnect timeout - forfeit');
                }
            }, 1000);
        };

        // Set ALL listeners at once to avoid overwriting
        multiplayerService.setListeners({
            onLivesUpdate: (data) => {
                console.log('💚 Lives update received:', data);

                if (data.game_id === gameId || data.game_id === parseInt(gameId)) {
                    if (isPlayer1) {
                        setPlayerLives(data.player1_lives);
                        setOpponentLives(data.player2_lives);
                        setPlayerScore(data.player1_score || 0);
                        setOpponentScore(data.player2_score || 0);
                    } else {
                        setPlayerLives(data.player2_lives);
                        setOpponentLives(data.player1_lives);
                        setPlayerScore(data.player2_score || 0);
                        setOpponentScore(data.player1_score || 0);
                    }

                    // Check if opponent lost all lives
                    const oppLives = isPlayer1 ? data.player2_lives : data.player1_lives;
                    if (oppLives === 0) {
                        console.log('🏆 Opponent lost all lives! You win!');
                    }
                }
            },

            onGameCompleted: (completedGame) => {
                const completedGameId = completedGame.game_id || completedGame.gameId;
                if (completedGameId === gameId || completedGameId === parseInt(gameId)) {
                    console.log('🏁 GAME COMPLETED EVENT RECEIVED!', completedGame);

                    // Determine if we won or lost
                    const isWinner = multiplayerService.compareAddresses(completedGame.winner, walletAddress);
                    const isDraw = !completedGame.winner;

                    setGameOutcome(isDraw ? 'draw' : isWinner ? 'won' : 'lost');
                    setShowOutcomeAnimation(true);

                    // Show animation for 2.5 seconds, then transition to results
                    setTimeout(() => {
                        setShowOutcomeAnimation(false);
                        setGameState('completed');
                        onGameComplete(completedGame);
                    }, 2500);
                }
            },

            onOpponentFinishedFirst: (data) => {
                if (data.game_id === gameId || data.game_id === parseInt(gameId)) {
                    console.log('⚠️ Opponent finished first!', data);
                    setTimeout(() => {
                        // Force end game after 5 seconds
                        setGameState('completed');
                    }, 5000);
                }
            },

            onGameCancelled: (cancelledGameId, reason) => {
                if (cancelledGameId === gameId || cancelledGameId === parseInt(gameId)) {
                    console.log('❌ Game cancelled:', reason);
                    if (reason === 'player_disconnect') {
                        handleDisconnect();
                    }
                }
            }
        });

        return () => {
            multiplayerService.setListeners({});
        };
    }, [gameId, isPlayer1, onGameComplete]);



    // Handle life loss
    const handleLifeLoss = useCallback(async () => {
        const newLives = Math.max(0, playerLives - 1);
        setPlayerLives(newLives);

        try {
            await multiplayerService.updateLives(newLives, playerScore);

            if (newLives === 0) {
                // All lives lost - game ends immediately
                console.log('💀 All lives lost! You lose.');
                handleGameEnd();
            }
        } catch (error) {
            console.error('Error updating lives:', error);
        }
    }, [playerLives, playerScore]);

    // Handle game end
    const handleGameEnd = useCallback(async () => {
        if (gameState === 'completed') return;

        try {
            // Submit final score
            await multiplayerService.submitScore(playerScore);
            console.log('✅ Score submitted:', playerScore);
        } catch (error) {
            console.error('Error submitting score:', error);
        }
    }, [playerScore, gameState]);

    // Render countdown
    if (gameState === 'countdown') {
        return (
            <div className="multiplayer-game-overlay countdown-screen">
                <div className="countdown-container">
                    <div className="countdown-title">
                        <GiCrossedSwords className="countdown-icon" />
                        <h1>GET READY!</h1>
                    </div>
                    {countdown > 0 ? (
                        <div className="countdown-number" key={countdown}>
                            {countdown}
                        </div>
                    ) : (
                        <div className="countdown-go">GO!</div>
                    )}
                    <div className="match-info">
                        <p>First to finish wins!</p>
                        <p>60 seconds • 3 lives</p>
                    </div>
                </div>
            </div>
        );
    }

    // Render game UI overlay
    return (
        <div className="multiplayer-game-overlay">
            {/* Win/Loss Animation Overlay */}
            {showOutcomeAnimation && (
                <div className={`game-outcome-overlay ${gameOutcome}`}>
                    <div className="outcome-content">
                        {gameOutcome === 'won' && (
                            <>
                                <GiTrophyCup className="outcome-icon trophy" />
                                <h1 className="outcome-text">YOU WON!</h1>
                                <p className="outcome-subtext">+0.196 HACK</p>
                            </>
                        )}
                        {gameOutcome === 'lost' && (
                            <>
                                <GiCrossedSwords className="outcome-icon defeat" />
                                <h1 className="outcome-text">YOU LOST</h1>
                                <p className="outcome-subtext">Better luck next time!</p>
                            </>
                        )}
                        {gameOutcome === 'draw' && (
                            <>
                                <GiCrossedSwords className="outcome-icon draw" />
                                <h1 className="outcome-text">DRAW!</h1>
                                <p className="outcome-subtext">Stakes returned</p>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Disconnect warning */}
            {disconnectWarning && (
                <div className="disconnect-warning">
                    <div className="warning-content">
                        <h3>⚠️ CONNECTION LOST</h3>
                        <p>Reconnecting... {gracePeriodLeft}s</p>
                        <div className="warning-timer">
                            <div
                                className="timer-bar"
                                style={{ width: `${(gracePeriodLeft / 5) * 100}%` }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Top HUD */}
            <div className="game-hud-top">
                {/* Timer */}
                <div className="game-timer">
                    <GiEmptyHourglass className="timer-icon" />
                    <span className={`timer-value ${timeLeft <= 10 ? 'critical' : ''}`}>
                        {timeLeft}s
                    </span>
                </div>

                {/* Lives and Scores */}
                <div className="players-info">
                    {/* REQ-P2-004: Dynamic player panels based on player count */}
                    {players.length <= 2 ? (
                        // 2-player layout (classic)
                        <>
                            {/* Player info */}
                            <div className="player-panel you">
                                <div className="player-label">YOU</div>
                                <div className="player-lives">
                                    {[...Array(3)].map((_, i) => (
                                        <GiHeartPlus
                                            key={i}
                                            className={`heart ${i < playerLives ? 'active' : 'lost'}`}
                                        />
                                    ))}
                                </div>
                                <div className="player-score">{playerScore}</div>
                            </div>

                            <div className="vs-divider">VS</div>

                            {/* Opponent info */}
                            <div className="player-panel opponent">
                                <div className="player-label">OPPONENT</div>
                                <div className="player-lives">
                                    {[...Array(3)].map((_, i) => (
                                        <GiHeartPlus
                                            key={i}
                                            className={`heart ${i < opponentLives ? 'active' : 'lost'}`}
                                        />
                                    ))}
                                </div>
                                <div className="player-score">{opponentScore}</div>
                            </div>
                        </>
                    ) : (
                        // 3-4 player layout with mini-panels
                        <div className="multi-player-panels">
                            {players.map((player, index) => {
                                const isMe = multiplayerService.compareAddresses(player.address, walletAddress);
                                const displayScore = isMe ? playerScore : player.score;
                                const displayLives = isMe ? playerLives : player.lives;

                                return (
                                    <div
                                        key={player.address || index}
                                        className={`mini-player-panel ${isMe ? 'is-me' : ''} ${displayLives <= 0 ? 'eliminated' : ''}`}
                                    >
                                        <div className="mini-rank">#{index + 1}</div>
                                        <div className="mini-info">
                                            <span className="mini-name">
                                                {isMe ? 'YOU' : multiplayerService.formatAddress(player.address)}
                                            </span>
                                            <span className="mini-score">{displayScore}</span>
                                        </div>
                                        <div className="mini-lives">
                                            {[...Array(3)].map((_, i) => (
                                                <span key={i} className={`mini-heart ${i < displayLives ? 'alive' : 'dead'}`}>♥</span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* REQ-P2-004: Leaderboard for 3-4 player games */}
            {showLeaderboard && players.length > 2 && (
                <MultiplayerLeaderboard
                    players={players.map((p, idx) => ({
                        ...p,
                        score: multiplayerService.compareAddresses(p.address, walletAddress) ? playerScore : p.score,
                        lives: multiplayerService.compareAddresses(p.address, walletAddress) ? playerLives : p.lives
                    }))}
                    currentPlayerAddress={walletAddress}
                    gameStatus={gameState}
                />
            )}

            {/* Debug: Life loss button (remove in production) */}
            <button
                className="debug-life-loss"
                onClick={handleLifeLoss}
                style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    padding: '10px 20px',
                    background: '#ff4757',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    zIndex: 9999
                }}
            >
                Lose Life (Debug)
            </button>
        </div>
    );
};

export default MultiplayerGame;
