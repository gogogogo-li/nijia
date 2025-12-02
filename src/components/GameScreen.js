import React, { useRef, useEffect, useCallback } from 'react';
import { useGameLoop } from '../hooks/useGameLoop';
import { useSlashDetection } from '../hooks/useSlashDetection';
import { useBladeTrail } from '../hooks/useBladeTrail';
import { useVisibility } from '../hooks/useVisibility';
import { usePointPopups } from '../hooks/usePointPopups';
import { useMissedTokenNotifications } from '../hooks/useMissedTokenNotifications';
import PointPopup from './PointPopup';

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
  onechain
}) => {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const isVisible = useVisibility();
  const wasVisibleRef = useRef(isVisible);
  
  const { popups, addPopup, removePopup, clearAllPopups } = usePointPopups();
  const { 
    clearAllMissedNotifications 
  } = useMissedTokenNotifications();

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
  } = useGameLoop(canvasRef, gameState, onEndGame, updateParticles, handleMissedFruit);

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
    
    // Fruit Ninja style progressive spawning - starts very slow, gradually increases
    let lastSpawn = Date.now();
    const dynamicSpawner = setInterval(() => {
      const now = Date.now();
      if (!gameState.gameStartTime) return;
      
      const elapsed = now - gameState.gameStartTime;
      
      // Progressive difficulty system (Fruit Ninja algorithm - very gentle start)
      let waveSize, spawnInterval, staggerDelay;
      
      if (elapsed < 15000) {
        // First 15 seconds - VERY slow tutorial, 1 token at a time
        waveSize = 1;
        spawnInterval = 3000; // 3 seconds between spawns (very slow)
        staggerDelay = 0;
      } else if (elapsed < 30000) {
        // 15-30 seconds - Still gentle, start introducing pairs occasionally
        waveSize = Math.random() < 0.8 ? 1 : 2; // 80% single, 20% pairs
        spawnInterval = 2500; // 2.5 seconds
        staggerDelay = 200;
      } else if (elapsed < 50000) {
        // 30-50 seconds - Mix of 1-2 tokens, more pairs
        waveSize = Math.random() < 0.5 ? 1 : 2; // 50% single, 50% pairs
        spawnInterval = 2200;
        staggerDelay = 180;
      } else if (elapsed < 70000) {
        // 50-70 seconds - 1-3 tokens, introducing triplets
        const rand = Math.random();
        waveSize = rand < 0.3 ? 1 : rand < 0.7 ? 2 : 3; // 30% single, 40% pairs, 30% triplets
        spawnInterval = 2000;
        staggerDelay = 150;
      } else if (elapsed < 90000) {
        // 70-90 seconds - 2-4 tokens
        waveSize = 2 + Math.floor(Math.random() * 3); // 2-4 tokens
        spawnInterval = 1800;
        staggerDelay = 130;
      } else {
        // After 90 seconds - 3-5 tokens, expert mode
        waveSize = 3 + Math.floor(Math.random() * 3); // 3-5 tokens
        spawnInterval = 1500;
        staggerDelay = 100;
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
  }, [gameState.isGameRunning, gameState.isPaused, gameState.gameStartTime, updateGame, spawnItem, updateTrail, isVisible]);

  // Auto-pause when tab becomes invisible, resume when visible again
  useEffect(() => {
    if (wasVisibleRef.current !== isVisible && gameState.isGameRunning) {
      if (!isVisible && !gameState.isPaused) {
        // Tab became invisible and game was running - auto pause
        onTogglePause();
      }
    }
    wasVisibleRef.current = isVisible;
  }, [isVisible, gameState.isGameRunning, gameState.isPaused, onTogglePause]);

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

  const handleMouseDown = useCallback((e) => {
    startSlashing();
    startSlash(e);
  }, [startSlashing, startSlash]);

  const handleMouseMove = useCallback((e) => {
    updateSlash(e);
  }, [updateSlash]);

  const handleMouseUp = useCallback(() => {
    stopSlashing();
    endSlash();
  }, [stopSlashing, endSlash]);

  const handleTouchStart = useCallback((e) => {
    e.preventDefault();
    startSlashing();
    startSlash(e.touches[0]);
  }, [startSlashing, startSlash]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    updateSlash(e.touches[0]);
  }, [updateSlash]);

  const handleTouchEnd = useCallback((e) => {
    e.preventDefault();
    stopSlashing();
    endSlash();
  }, [stopSlashing, endSlash]);

  return (
    <div className="screen game-screen fullscreen">
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

          {/* Difficulty Level Indicator */}
          {gameState.gameStartTime && (() => {
            const elapsed = Date.now() - gameState.gameStartTime;
            const diffLevel = Math.floor(elapsed / 10000) + 1;
            if (elapsed > 10000) {
              return (
                <div style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '4px',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  color: diffLevel > 3 ? '#5C4FFF' : '#EC796B'
                }}>
                  <span style={{
                    fontSize: '0.6rem',
                    color: 'rgba(255, 255, 255, 0.5)',
                    textTransform: 'uppercase'
                  }}>LVL</span>
                  <span>{diffLevel}</span>
                  {diffLevel > 5 && <span style={{ fontSize: '0.7rem' }}>🔥</span>}
                </div>
              );
            }
            return null;
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
            <span style={{
              fontSize: '0.65rem',
              color: 'rgba(255, 255, 255, 0.5)',
              fontWeight: '500',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>BEST</span>
            <span>{gameState.bestScore}</span>
          </div>
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
        
        <button 
          className="btn btn--outline pause-btn-overlay" 
          type="button"
          onClick={onTogglePause}
        >
          <span>{gameState.isPaused ? '▶️' : '⏸️'}</span>
        </button>
        
        {/* Keyboard Shortcuts Hint - Only show when game is running */}
        {gameState.isGameRunning && (
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
            border: '2px solid rgba(46, 216, 167, 0.3)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            textAlign: 'center',
            minWidth: '320px',
            animation: 'slideIn 0.3s ease-out'
          }}>
            <h2 style={{
              fontFamily: 'Orbitron, sans-serif',
              fontSize: '2.5rem',
              color: '#2ED8A7',
              margin: '0 0 2rem 0',
              textShadow: '0 0 20px rgba(46, 216, 167, 0.5)',
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
                  background: 'linear-gradient(135deg, #2ED8A7, #26C799)',
                  border: 'none',
                  borderRadius: '50px',
                  color: 'white',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 6px 20px rgba(46, 216, 167, 0.4)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-3px) scale(1.05)';
                  e.target.style.boxShadow = '0 8px 25px rgba(46, 216, 167, 0.6)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0) scale(1)';
                  e.target.style.boxShadow = '0 6px 20px rgba(46, 216, 167, 0.4)';
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
                  border: '2px solid rgba(236, 121, 107, 0.3)',
                  borderRadius: '50px',
                  color: '#EC796B',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'rgba(236, 121, 107, 0.15)';
                  e.target.style.borderColor = 'rgba(236, 121, 107, 0.5)';
                  e.target.style.transform = 'translateY(-3px) scale(1.05)';
                  e.target.style.boxShadow = '0 6px 20px rgba(236, 121, 107, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.target.style.borderColor = 'rgba(236, 121, 107, 0.3)';
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
                color: '#EC796B',
                fontWeight: 700,
                padding: '0.2rem 0.5rem',
                background: 'rgba(236, 121, 107, 0.1)',
                borderRadius: '4px'
              }}>Space</span> or <span style={{ 
                color: '#EC796B',
                fontWeight: 700,
                padding: '0.2rem 0.5rem',
                background: 'rgba(236, 121, 107, 0.1)',
                borderRadius: '4px'
              }}>P</span> to resume
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameScreen;