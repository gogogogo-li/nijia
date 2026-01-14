import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useGameLoop } from '../hooks/useGameLoop';
import { useSlashDetection } from '../hooks/useSlashDetection';
import { useBladeTrail } from '../hooks/useBladeTrail';
import { useVisibility } from '../hooks/useVisibility';
import { usePointPopups } from '../hooks/usePointPopups';
import { useMissedTokenNotifications } from '../hooks/useMissedTokenNotifications';
import multiplayerService from '../services/multiplayerService';
import PointPopup from './PointPopup';
import QuickEmotes, { EmoteTrigger } from './QuickEmotes';
import EmotePopup from './EmotePopup';
import { GiTrophyCup, GiCrossedSwords } from 'react-icons/gi';

const GameScreen = ({
  gameState,
  onEndGame,
  onUpdateScore,
  onLoseLife,
  onLoseLiveFromMissedToken,
  onTogglePause,
  onCreateParticles,
  onCreateScreenFlash,
  onDecrementTimer,
  updateParticles,
  onBackToHome,
  onechain,
  multiplayerGameId,
  soloGameData
}) => {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const isVisible = useVisibility();
  const wasVisibleRef = useRef(isVisible);

  const { popups, addPopup, removePopup, clearAllPopups } = usePointPopups();
  const {
    clearAllMissedNotifications
  } = useMissedTokenNotifications();

  // Animation state for win/loss overlay
  const [showOutcomeAnimation, setShowOutcomeAnimation] = useState(false);
  const [gameOutcome, setGameOutcome] = useState(null); // 'won', 'lost', 'draw'

  // Emote state for multiplayer
  const [showEmotePicker, setShowEmotePicker] = useState(false);

  // Listen for multiplayer events - RACE MODE + LIFE-BASED END
  useEffect(() => {
    if (!multiplayerGameId) return;

    // CRITICAL: Ensure socket is connected for multiplayer games
    // The lobby disconnects on unmount, so we need to reconnect here
    if (!multiplayerService.isConnected()) {
      console.log('🔌 Reconnecting socket for multiplayer game...');
      multiplayerService.connect(onechain?.walletAddress);
    }

    // Handle opponent finishing their game first (race mode)
    const handleOpponentFinishedFirst = (data) => {
      console.log('🚨 OPPONENT FINISHED FIRST! Ending my game immediately:', data);
      console.log(`   Opponent: ${data.opponent}`);
      console.log(`   Opponent Score: ${data.opponentScore}`);
      // Immediately end the game - opponent finished first
      onEndGame();
    };

    // Handle game completion from server (when any player loses all lives)
    const handleGameCompleted = (game) => {
      const completedGameId = game.game_id || game.gameId;
      if (String(completedGameId) === String(multiplayerGameId)) {
        console.log('🏁 GAME COMPLETED - Showing win/loss animation!', game);
        console.log(`   Winner: ${game.winner}`);
        console.log(`   My address: ${onechain?.walletAddress}`);

        // Determine if we won or lost
        const isWinner = game.winner &&
          game.winner.toLowerCase() === onechain?.walletAddress?.toLowerCase();
        const isDraw = !game.winner;

        console.log(`   Is winner: ${isWinner}, Is draw: ${isDraw}`);

        // Show animation
        setGameOutcome(isDraw ? 'draw' : isWinner ? 'won' : 'lost');
        setShowOutcomeAnimation(true);

        // After 2.5 seconds, transition to results
        setTimeout(() => {
          setShowOutcomeAnimation(false);
          onEndGame();
        }, 2500);
      }
    };

    // Handle lives update to check if opponent lost all lives
    const handleLivesUpdate = (data) => {
      if (String(data.game_id) === String(multiplayerGameId)) {
        // Check if either player lost all lives
        if (data.player1_lives === 0 || data.player2_lives === 0) {
          console.log('💀 A player lost all lives! Game should end...');
          console.log(`   P1 Lives: ${data.player1_lives}, P2 Lives: ${data.player2_lives}`);
          // Don't call onEndGame here - wait for server's game:completed event
        }
      }
    };

    // Set the listeners using the service's setListeners method
    multiplayerService.setListeners({
      onOpponentFinishedFirst: handleOpponentFinishedFirst,
      onGameCompleted: handleGameCompleted,
      onLivesUpdate: handleLivesUpdate
    });

    return () => {
      // Don't disconnect socket on cleanup - keep it connected for results screen
      multiplayerService.setListeners({});
    };
  }, [multiplayerGameId, onEndGame, onechain?.walletAddress]);

  // Handle missed fruit without notification
  const handleMissedFruit = useCallback(() => {
    onLoseLiveFromMissedToken();
    // Removed addMissedNotification() to disable popup
  }, [onLoseLiveFromMissedToken]);

  const {
    items,
    slashTrail,
    particles,
    spawnItem,
    updateGame,
    render,
    cleanupExcessItems,
    showComboMessage,
    itemCount
  } = useGameLoop(canvasRef, gameState, onEndGame, updateParticles, handleMissedFruit, soloGameData?.speed || 1, multiplayerGameId);

  const {
    isSlashing,
    addTrailPoint,
    updateTrail,
    startSlashing,
    stopSlashing,
    renderBladeTrail
  } = useBladeTrail();

  // Callback to record slashes on blockchain
  const handleSlashRecorded = useCallback((slashData) => {
    if (onechain && onechain.isConnected) {
      onechain.recordSlash(slashData);
    }
  }, [onechain]);

  const {
    startSlash,
    updateSlash,
    endSlash
  } = useSlashDetection(
    canvasRef,
    items,
    gameState,
    onUpdateScore,
    onLoseLife,
    onCreateParticles,
    onCreateScreenFlash,
    addTrailPoint,
    isSlashing,
    addPopup,
    handleSlashRecorded,
    showComboMessage
  );

  // End game when target score is reached in solo stakes mode
  useEffect(() => {
    if (soloGameData && soloGameData.target && gameState.isGameRunning && !gameState.isPaused) {
      if (gameState.score >= soloGameData.target) {
        console.log(`🎯 Target reached! Score: ${gameState.score} >= Target: ${soloGameData.target}`);
        // Small delay to let the last score update render
        setTimeout(() => {
          onEndGame();
        }, 500);
      }
    }
  }, [gameState.score, soloGameData, gameState.isGameRunning, gameState.isPaused, onEndGame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctxRef.current = ctx;

    // Resize canvas to full screen
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  useEffect(() => {
    // Only run game loops when tab is visible and game is running
    if (!gameState.isGameRunning || gameState.isPaused || !isVisible) return;

    const gameLoop = setInterval(() => {
      updateGame();
      updateTrail(); // Update blade trail
    }, 16);

    // Fruit Ninja style progressive spawning - adapted for difficulty levels
    let lastSpawn = Date.now();
    const dynamicSpawner = setInterval(() => {
      const now = Date.now();
      if (!gameState.gameStartTime) return;

      const elapsed = now - gameState.gameStartTime;
      const isMultiplayer = !!multiplayerGameId;
      const difficultyLevel = soloGameData?.speed || 1.0;

      // Calculate spawn interval multiplier based on difficulty
      // Higher difficulties = faster spawns (more items = more fun + more scoring opportunities)
      let intervalMultiplier = 1.0;
      let waveBonus = 0;

      if (isMultiplayer) {
        intervalMultiplier = 0.6; // 40% faster spawns in multiplayer
        waveBonus = 1; // +1 item per wave
      } else {
        if (difficultyLevel >= 1.5) {
          intervalMultiplier = 0.5;  // Extreme: 50% faster spawns
          waveBonus = 2;
        } else if (difficultyLevel >= 1.3) {
          intervalMultiplier = 0.6;  // Hard: 40% faster spawns
          waveBonus = 1;
        } else if (difficultyLevel >= 1.15) {
          intervalMultiplier = 0.8; // Medium: 20% faster spawns
          waveBonus = 1;
        }
      }

      // REQ-P2-002: Enhanced spawn system - faster intervals, larger waves
      let waveSize, spawnInterval, staggerDelay;

      // Multiplayer: Shorter tutorial phase, more immediate action
      if (isMultiplayer) {
        if (elapsed < 5000) {
          // First 5 seconds - Quick intro
          waveSize = 3;  // was 2
          spawnInterval = 1400 * intervalMultiplier;  // was 2000 (-30%)
          staggerDelay = 120;
        } else if (elapsed < 20000) {
          // 5-20 seconds - Ramping up
          waveSize = 3 + Math.floor(Math.random() * 2); // 3-4 tokens (was 2-3)
          spawnInterval = 1200 * intervalMultiplier;  // was 1800 (-33%)
          staggerDelay = 100;
        } else if (elapsed < 40000) {
          // 20-40 seconds - Full action
          waveSize = 4 + Math.floor(Math.random() * 3); // 4-6 tokens (was 3-4)
          spawnInterval = 1000 * intervalMultiplier;  // was 1500 (-33%)
          staggerDelay = 80;
        } else {
          // After 40 seconds - Intense
          waveSize = 5 + Math.floor(Math.random() * 3); // 5-7 tokens (was 4-5)
          spawnInterval = 800 * intervalMultiplier;   // was 1200 (-33%)
          staggerDelay = 60;
        }
      }
      // Solo mode: Difficulty-aware progression with enhanced pace
      else {
        if (elapsed < 10000) {
          // REQ-P2-002: Shortened tutorial (10s vs 15s)
          const tutorialWave = difficultyLevel >= 1.3 ? 3 : 2;  // was 2:1
          waveSize = tutorialWave + waveBonus;
          spawnInterval = (difficultyLevel >= 1.3 ? 1400 : 2100) * intervalMultiplier;  // was 2000:3000 (-30%)
          staggerDelay = 100;
        } else if (elapsed < 25000) {
          // 10-25 seconds - Getting started
          waveSize = (Math.random() < 0.6 ? 2 : 3) + waveBonus;  // was 1:2
          spawnInterval = 1750 * intervalMultiplier;  // was 2500 (-30%)
          staggerDelay = 150;
        } else if (elapsed < 45000) {
          // 25-45 seconds - Mix of tokens
          waveSize = (2 + Math.floor(Math.random() * 2)) + waveBonus;  // 2-3 (was 1-2)
          spawnInterval = 1500 * intervalMultiplier;  // was 2200 (-32%)
          staggerDelay = 120;
        } else if (elapsed < 70000) {
          // 45-70 seconds - Ramping up
          waveSize = (3 + Math.floor(Math.random() * 2)) + waveBonus;  // 3-4 (was 1-3)
          spawnInterval = 1300 * intervalMultiplier;  // was 2000 (-35%)
          staggerDelay = 100;
        } else if (elapsed < 90000) {
          // 70-90 seconds - High intensity
          waveSize = (4 + Math.floor(Math.random() * 3)) + waveBonus; // 4-6 (was 2-4)
          spawnInterval = 1100 * intervalMultiplier;  // was 1800 (-39%)
          staggerDelay = 80;
        } else {
          // After 90 seconds - Expert mode
          waveSize = (5 + Math.floor(Math.random() * 3)) + waveBonus; // 5-7 (was 3-5)
          spawnInterval = 900 * intervalMultiplier;   // was 1500 (-40%)
          staggerDelay = 60;
        }
      }

      if (now - lastSpawn >= spawnInterval) {
        // Spawn wave with staggered timing
        for (let i = 0; i < waveSize; i++) {
          setTimeout(() => spawnItem(), i * staggerDelay);
        }

        lastSpawn = now;
      }
    }, 50); // Check every 50ms for precise timing

    return () => {
      clearInterval(gameLoop);
      clearInterval(dynamicSpawner);
    };
  }, [gameState.isGameRunning, gameState.isPaused, gameState.gameStartTime, updateGame, spawnItem, updateTrail, isVisible, multiplayerGameId, soloGameData]);

  // Auto-pause when tab becomes invisible, resume when visible again
  // DISABLED for multiplayer - game continues even if tab is hidden
  useEffect(() => {
    if (multiplayerGameId) return; // No auto-pause in multiplayer

    if (wasVisibleRef.current !== isVisible && gameState.isGameRunning) {
      if (!isVisible && !gameState.isPaused) {
        // Tab became invisible and game was running - auto pause
        onTogglePause();
      }
    }
    wasVisibleRef.current = isVisible;
  }, [isVisible, gameState.isGameRunning, gameState.isPaused, onTogglePause, multiplayerGameId]);

  // Clean up excess items periodically
  useEffect(() => {
    if (itemCount > 15) { // If items exceed safe threshold
      cleanupExcessItems();
    }
  }, [itemCount, cleanupExcessItems]);

  // Clear popups and notifications when game ends
  useEffect(() => {
    if (!gameState.isGameRunning) {
      clearAllPopups();
      clearAllMissedNotifications();
    }
  }, [gameState.isGameRunning, clearAllPopups, clearAllMissedNotifications]);

  // Timer countdown for Arcade and Zen modes
  useEffect(() => {
    if (!gameState.isGameRunning || gameState.isPaused || gameState.timeRemaining === null) {
      return;
    }

    const timerInterval = setInterval(() => {
      onDecrementTimer();
    }, 1000); // Decrease every second

    return () => clearInterval(timerInterval);
  }, [gameState.isGameRunning, gameState.isPaused, gameState.timeRemaining, onDecrementTimer]);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (ctx) {
      render(ctx, items, slashTrail, particles);
      // Render blade trail on top
      renderBladeTrail(ctx);
    }
  }, [items, slashTrail, particles, render, renderBladeTrail]);

  // REQ-P2-001: Hover-to-slice - mouse movement triggers slashing automatically
  const handleMouseDown = useCallback((e) => {
    // Still track position for initial setup
    startSlash(e);
  }, [startSlash]);

  const handleMouseMove = useCallback((e) => {
    // REQ-P2-001: Auto-start slashing on mouse move (hover-to-slice)
    if (!isSlashing) {
      startSlashing();
      startSlash(e);
    }
    updateSlash(e);
  }, [updateSlash, isSlashing, startSlashing, startSlash]);

  const handleMouseUp = useCallback(() => {
    stopSlashing();
    endSlash();
  }, [stopSlashing, endSlash]);

  // For mobile: touch events work similarly but clear on touch end
  const handleTouchStart = useCallback((e) => {
    e.preventDefault();
    startSlashing();
    startSlash(e.touches[0]);
  }, [startSlashing, startSlash]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    // Auto-start if not already slashing (finger may have started outside game area)
    if (!isSlashing) {
      startSlashing();
      startSlash(e.touches[0]);
    }
    updateSlash(e.touches[0]);
  }, [updateSlash, isSlashing, startSlashing, startSlash]);

  const handleTouchEnd = useCallback((e) => {
    e.preventDefault();
    stopSlashing();
    endSlash();
  }, [stopSlashing, endSlash]);

  return (
    <div className="screen game-screen fullscreen">
      {/* Win/Loss Animation Overlay */}
      {showOutcomeAnimation && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10001,
          background: gameOutcome === 'won'
            ? 'radial-gradient(circle at 50% 50%, rgba(255, 215, 0, 0.4) 0%, rgba(0, 255, 136, 0.25) 40%, rgba(0, 0, 0, 0.98) 100%)'
            : gameOutcome === 'lost'
              ? 'radial-gradient(circle at 50% 50%, rgba(255, 71, 87, 0.4) 0%, rgba(139, 0, 0, 0.25) 40%, rgba(0, 0, 0, 0.98) 100%)'
              : 'radial-gradient(circle at 50% 50%, rgba(70, 125, 255, 0.4) 0%, rgba(30, 60, 150, 0.25) 40%, rgba(0, 0, 0, 0.98) 100%)',
          overflow: 'hidden'
        }}>
          {/* Confetti for winner */}
          {gameOutcome === 'won' && [...Array(50)].map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                width: `${Math.random() * 12 + 8}px`,
                height: `${Math.random() * 12 + 8}px`,
                background: ['#ffd700', '#ff6b6b', '#00ff88', '#467DFF', '#ff00ff', '#00ffff'][Math.floor(Math.random() * 6)],
                left: `${Math.random() * 100}%`,
                top: `-20px`,
                borderRadius: Math.random() > 0.5 ? '50%' : '0',
                animation: `confettiFall ${2 + Math.random() * 2}s ease-out forwards`,
                animationDelay: `${Math.random() * 0.5}s`,
                transform: `rotate(${Math.random() * 360}deg)`,
                boxShadow: '0 0 10px rgba(255, 255, 255, 0.5)'
              }}
            />
          ))}

          {/* Rain effect for loser */}
          {gameOutcome === 'lost' && [...Array(30)].map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                width: '2px',
                height: `${20 + Math.random() * 30}px`,
                background: 'linear-gradient(transparent, rgba(255, 71, 87, 0.6))',
                left: `${Math.random() * 100}%`,
                top: `-50px`,
                animation: `rainFall ${1 + Math.random()}s linear infinite`,
                animationDelay: `${Math.random() * 2}s`
              }}
            />
          ))}

          <div style={{
            textAlign: 'center',
            zIndex: 10
          }}>
            {gameOutcome === 'won' && (
              <>
                <div style={{
                  animation: 'bounceIn 0.6s cubic-bezier(0.68, -0.55, 0.27, 1.55)'
                }}>
                  <GiTrophyCup style={{
                    fontSize: '180px',
                    color: '#ffd700',
                    marginBottom: '20px',
                    filter: 'drop-shadow(0 0 60px rgba(255, 215, 0, 0.9))',
                    animation: 'trophyPulse 0.5s ease-in-out infinite alternate'
                  }} />
                </div>
                <h1 style={{
                  fontSize: '120px',
                  fontWeight: '900',
                  background: 'linear-gradient(135deg, #ffd700 0%, #ffaa00 30%, #00ff88 70%, #00ffaa 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  margin: 0,
                  letterSpacing: '8px',
                  textShadow: '0 0 80px rgba(255, 215, 0, 0.8)',
                  animation: 'textGlow 0.4s ease-in-out infinite alternate'
                }}>VICTORY!</h1>
                <p style={{
                  fontSize: '40px',
                  color: '#00ff88',
                  marginTop: '25px',
                  fontWeight: '800',
                  letterSpacing: '6px',
                  textShadow: '0 0 30px rgba(0, 255, 136, 0.7)',
                  animation: 'pulseGlow 0.8s ease-in-out infinite'
                }}>+0.196 OCT 💰</p>
              </>
            )}
            {gameOutcome === 'lost' && (
              <>
                <div style={{
                  animation: 'shakeIn 0.6s ease'
                }}>
                  <GiCrossedSwords style={{
                    fontSize: '160px',
                    color: '#ff4757',
                    marginBottom: '20px',
                    filter: 'drop-shadow(0 0 40px rgba(255, 71, 87, 0.8))',
                    opacity: 0.9
                  }} />
                </div>
                <h1 style={{
                  fontSize: '100px',
                  fontWeight: '900',
                  background: 'linear-gradient(135deg, #ff4757 0%, #ff6b6b 50%, #8b0000 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  margin: 0,
                  letterSpacing: '8px',
                  animation: 'fadeInScale 0.5s ease'
                }}>DEFEAT</h1>
                <p style={{
                  fontSize: '28px',
                  color: 'rgba(255, 255, 255, 0.7)',
                  marginTop: '25px',
                  fontWeight: '600',
                  letterSpacing: '3px'
                }}>Better luck next time! 💪</p>
              </>
            )}
            {gameOutcome === 'draw' && (
              <>
                <GiCrossedSwords style={{
                  fontSize: '150px',
                  color: '#467DFF',
                  marginBottom: '20px',
                  filter: 'drop-shadow(0 0 40px rgba(70, 125, 255, 0.6))'
                }} />
                <h1 style={{
                  fontSize: '100px',
                  fontWeight: '900',
                  background: 'linear-gradient(135deg, #467DFF 0%, #00d4ff 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  margin: 0,
                  letterSpacing: '10px'
                }}>DRAW!</h1>
                <p style={{
                  fontSize: '32px',
                  color: 'rgba(255, 255, 255, 0.8)',
                  marginTop: '20px',
                  fontWeight: '700',
                  letterSpacing: '4px'
                }}>Stakes returned</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* CSS Keyframes - injected via style tag */}
      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes rainFall {
          0% { transform: translateY(-50px); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
        @keyframes bounceIn {
          0% { transform: scale(0); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        @keyframes shakeIn {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-10px); }
          20%, 40%, 60%, 80% { transform: translateX(10px); }
        }
        @keyframes trophyPulse {
          0% { transform: scale(1) rotate(-3deg); }
          100% { transform: scale(1.1) rotate(3deg); }
        }
        @keyframes textGlow {
          0% { filter: brightness(1) drop-shadow(0 0 20px rgba(255, 215, 0, 0.5)); }
          100% { filter: brightness(1.2) drop-shadow(0 0 40px rgba(255, 215, 0, 0.8)); }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.05); }
        }
        @keyframes fadeInScale {
          0% { opacity: 0; transform: scale(0.8); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* Top UI Layout: Score on left, Lives on right */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: '20px 30px',
        zIndex: 20,
        pointerEvents: 'none'
      }}>
        {/* Left Side: Cool Score Display */}
        {/* Left Side: Score */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(20px) saturate(180%)',
          borderRadius: '12px',
          padding: '16px 20px',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: '8px',
          minWidth: '140px',
          transition: 'all 0.3s ease'
        }}>
          {/* Current Score */}
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '6px',
            fontSize: '1.5rem',
            fontWeight: '600',
            color: '#ffffff',
            letterSpacing: '-0.02em'
          }}>
            <span style={{
              fontSize: '0.75rem',
              color: 'rgba(255, 255, 255, 0.6)',
              fontWeight: '500',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>SCORE</span>
            <span>{gameState.score}</span>
          </div>

          {/* Combo Display */}
          {gameState.combo > 1 && (() => {
            const timeSinceLastSlash = Date.now() - gameState.lastSlashTime;
            const comboTimeLeft = Math.max(0, 2000 - timeSinceLastSlash);
            const isComboWarning = comboTimeLeft < 500 && comboTimeLeft > 0;

            return (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '4px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '6px',
                  fontSize: '1.3rem',
                  fontWeight: '800',
                  backgroundImage: isComboWarning
                    ? 'linear-gradient(45deg, #ff4444, #ff6600)'
                    : 'linear-gradient(45deg, #EC796B, #FF6B9D)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  textShadow: 'none', // Removed glow
                  filter: isComboWarning
                    ? 'drop-shadow(0 2px 4px rgba(255, 68, 68, 0.4))'
                    : 'drop-shadow(0 2px 4px rgba(236, 121, 107, 0.3))', // Reduced shadow
                  animation: gameState.combo > 5 || isComboWarning ? 'comboFlash 0.4s ease-in-out infinite alternate' : 'comboPulse 1s ease-in-out infinite'
                }}>
                  <span style={{
                    fontSize: '0.7rem',
                    backgroundImage: isComboWarning
                      ? 'linear-gradient(45deg, #ff6600, #ff8800)'
                      : 'linear-gradient(45deg, #EC796B, #FF6B9D)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em'
                  }}>COMBO</span>
                  <span style={{
                    fontSize: '1.4rem',
                    fontWeight: '900',
                    textShadow: '0 2px 4px rgba(0, 0, 0, 0.4)' // Reduced shadow
                  }}>{gameState.combo}x</span>
                </div>

                {/* Combo timer bar */}
                <div style={{
                  width: '80px',
                  height: '6px',
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                  border: '1px solid rgba(236, 121, 107, 0.3)',
                  boxShadow: '0 0 4px rgba(236, 121, 107, 0.2)' // Reduced glow
                }}>
                  <div style={{
                    width: `${(comboTimeLeft / 2000) * 100}%`,
                    height: '100%',
                    backgroundImage: isComboWarning
                      ? 'linear-gradient(90deg, #ff4444, #ff6600)'
                      : 'linear-gradient(90deg, #EC796B, #FF6B9D)',
                    transition: 'width 0.1s ease-out',
                    borderRadius: '2px',
                    boxShadow: isComboWarning
                      ? '0 0 6px rgba(255, 68, 68, 0.4)'
                      : '0 0 4px rgba(236, 121, 107, 0.3)', // Reduced glow
                    animation: isComboWarning ? 'timerFlash 0.2s ease-in-out infinite' : 'none'
                  }} />
                </div>
              </div>
            );
          })()}

          {/* Timer Display for Arcade and Zen modes */}
          {gameState.timeRemaining !== null && (
            <div style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '6px',
              fontSize: '1.3rem',
              fontWeight: '700',
              color: gameState.timeRemaining <= 10 ? '#FF4444' : '#FFD700',
              animation: gameState.timeRemaining <= 10 ? 'pulse 0.5s infinite' : 'none'
            }}>
              <span style={{
                fontSize: '0.75rem',
                color: 'rgba(255, 255, 255, 0.6)',
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>TIME</span>
              <span>{gameState.timeRemaining}s</span>
            </div>
          )}

          {/* Best Score */}
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '6px',
            fontSize: '1rem',
            fontWeight: '500',
            color: 'rgba(255, 255, 255, 0.8)'
          }}>
            <span>BEST</span>
            <span>{gameState.bestScore}</span>
          </div>

          {/* Solo Game Target Progress */}
          {soloGameData && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              padding: '8px 12px',
              background: 'rgba(0, 0, 0, 0.4)',
              borderRadius: '10px',
              border: '1px solid rgba(74, 222, 128, 0.3)',
              marginTop: '8px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.75rem',
                color: 'rgba(255, 255, 255, 0.7)'
              }}>
                <span>TARGET</span>
                <span style={{
                  color: gameState.score >= soloGameData.target ? '#4ade80' : '#fbbf24',
                  fontWeight: 700
                }}>
                  {gameState.score} / {soloGameData.target}
                </span>
              </div>
              <div style={{
                width: '120px',
                height: '6px',
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '3px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${Math.min((gameState.score / soloGameData.target) * 100, 100)}%`,
                  height: '100%',
                  background: gameState.score >= soloGameData.target
                    ? 'linear-gradient(90deg, #4ade80, #22c55e)'
                    : 'linear-gradient(90deg, #fbbf24, #f59e0b)',
                  borderRadius: '3px',
                  transition: 'width 0.3s ease, background 0.3s ease'
                }} />
              </div>
              {gameState.score >= soloGameData.target && (
                <div style={{
                  fontSize: '0.7rem',
                  color: '#4ade80',
                  fontWeight: 600,
                  textAlign: 'center',
                  animation: 'pulse 1s infinite'
                }}>
                  WIN! Keep scoring for bonus!
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Lives */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '10px'
        }}>
          <div style={{
            fontSize: '1rem',
            color: '#e0e0e0',
            textShadow: '0 0 6px #222',
            marginBottom: '5px'
          }}>Lives</div>
          <div style={{
            display: 'flex',
            gap: '12px'
          }}>
            {[1, 2, 3].map(i => {
              const heartIndex = i - 1;
              const heartHealth = gameState.heartHealth ? gameState.heartHealth[heartIndex] : 100;
              const isActiveHeart = heartHealth > 0;

              return (
                <span
                  key={i}
                  style={{
                    fontSize: '2rem',
                    color: isActiveHeart ? '#ff4b6b' : '#444',
                    filter: isActiveHeart ? 'drop-shadow(0 0 8px #ff4b6b)' : 'none',
                    transition: 'color 0.2s'
                  }}
                  className={`heart ${!isActiveHeart ? 'lost' : ''}`}
                >
                  ♥
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating UI Elements */}
      <div className="game-ui-overlay">

        {itemCount > 10 && (
          <div className="performance-warning">
            <div style={{
              color: '#EC796B',
              fontSize: '12px',
              fontWeight: 'bold',
              textShadow: '0 0 10px rgba(236, 121, 107, 0.8)'
            }}>
              Items: {itemCount}
            </div>
          </div>
        )}

        {/* Pause button - HIDDEN in multiplayer mode */}
        {!multiplayerGameId && (
          <button
            className="btn btn--outline pause-btn-overlay"
            type="button"
            onClick={onTogglePause}
          >
            <span>{gameState.isPaused ? '▶️' : '⏸️'}</span>
          </button>
        )}

        {/* Keyboard Shortcuts Hint - Only show when game is running and NOT multiplayer */}
        {gameState.isGameRunning && !multiplayerGameId && (
          <div className="keyboard-shortcuts-hint">
            <div className="shortcut-hint">
              <span className="key-indicator">Space</span> or <span className="key-indicator">P</span> to pause
            </div>
          </div>
        )}
      </div>

      {/* Full Screen Canvas */}
      <canvas
        ref={canvasRef}
        className="game-canvas fullscreen-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      {/* Point Popups */}
      <PointPopup popups={popups} onRemovePopup={removePopup} />

      {/* Missed Token Notifications - Disabled */}
      {/* <MissedTokenNotification 
        notifications={missedNotifications} 
        onRemoveNotification={removeMissedNotification} 
      /> */}

      {/* Pause Menu Overlay */}
      {gameState.isPaused && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(20px)',
            borderRadius: '20px',
            padding: '3rem 2.5rem',
            border: '2px solid rgba(70, 125, 255, 0.3)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            textAlign: 'center',
            minWidth: '320px',
            animation: 'slideIn 0.3s ease-out'
          }}>
            <h2 style={{
              fontFamily: 'Orbitron, sans-serif',
              fontSize: '2.5rem',
              color: '#467DFF',
              margin: '0 0 2rem 0',
              textShadow: '0 0 20px rgba(70, 125, 255, 0.5)',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.1em'
            }}>Paused</h2>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}>
              <button
                onClick={onTogglePause}
                style={{
                  fontFamily: 'Orbitron, sans-serif',
                  padding: '1rem 2rem',
                  background: 'linear-gradient(135deg, #467DFF, #BFC1FF)',
                  border: 'none',
                  borderRadius: '50px',
                  color: 'white',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 6px 20px rgba(70, 125, 255, 0.4)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-3px) scale(1.05)';
                  e.target.style.boxShadow = '0 8px 25px rgba(70, 125, 255, 0.6)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0) scale(1)';
                  e.target.style.boxShadow = '0 6px 20px rgba(70, 125, 255, 0.4)';
                }}
              >
                ▶ Resume Game
              </button>

              <button
                onClick={onBackToHome}
                style={{
                  fontFamily: 'Orbitron, sans-serif',
                  padding: '1rem 2rem',
                  background: 'rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(10px)',
                  border: '2px solid rgba(70, 125, 255, 0.3)',
                  borderRadius: '50px',
                  color: '#467DFF',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'rgba(70, 125, 255, 0.15)';
                  e.target.style.borderColor = 'rgba(70, 125, 255, 0.5)';
                  e.target.style.transform = 'translateY(-3px) scale(1.05)';
                  e.target.style.boxShadow = '0 6px 20px rgba(70, 125, 255, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.target.style.borderColor = 'rgba(70, 125, 255, 0.3)';
                  e.target.style.transform = 'translateY(0) scale(1)';
                  e.target.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.3)';
                }}
              >
                Back to Home
              </button>
            </div>

            <p style={{
              marginTop: '2rem',
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '0.9rem',
              fontWeight: 500
            }}>
              Press <span style={{
                color: '#467DFF',
                fontWeight: 700,
                padding: '0.2rem 0.5rem',
                background: 'rgba(70, 125, 255, 0.1)',
                borderRadius: '4px'
              }}>Space</span> or <span style={{
                color: '#467DFF',
                fontWeight: 700,
                padding: '0.2rem 0.5rem',
                background: 'rgba(70, 125, 255, 0.1)',
                borderRadius: '4px'
              }}>P</span> to resume
            </p>
          </div>
        </div>
      )}

      {/* Quick Emotes for Multiplayer */}
      {multiplayerGameId && gameState.isGameRunning && !gameState.isPaused && (
        <>
          <EmoteTrigger onClick={() => setShowEmotePicker(true)} />
          <QuickEmotes
            gameId={multiplayerGameId}
            isOpen={showEmotePicker}
            onClose={() => setShowEmotePicker(false)}
          />
          <EmotePopup gameId={multiplayerGameId} />
        </>
      )}
    </div>
  );
};

export default GameScreen;