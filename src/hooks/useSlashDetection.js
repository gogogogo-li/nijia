import { useState, useCallback, useRef } from 'react';
import { createHitEntry, isHitValid, calculateHitPoints } from '../utils/contributionScoring';

export const useSlashDetection = (
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
  onSlashRecorded, // Optional callback for blockchain recording
  showComboMessage, // Function to show combo on game screen
  multiplayerContext = null // REQ-P2-005: Multiplayer context for contribution tracking
) => {
  const [slashPath, setSlashPath] = useState([]);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const slashVelocity = useRef({ vx: 0, vy: 0 });
  const slashedItems = useRef(new Set());

  const getMousePos = useCallback((e) => {
    if (!canvasRef.current) return { x: 0, y: 0 };

    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }, [canvasRef]);

  const createSliceEffect = useCallback((item, angle) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const tokenColor = item.token?.ringColor || item.token?.color || '#FFD700';

    // Create more prominent scratch/slash mark on background
    const scratchMark = document.createElement('div');
    scratchMark.className = 'scratch-mark';
    scratchMark.style.position = 'fixed';
    scratchMark.style.left = (rect.left + item.x - 40) + 'px';
    scratchMark.style.top = (rect.top + item.y - 40) + 'px';
    scratchMark.style.width = '80px';
    scratchMark.style.height = '80px';
    scratchMark.style.pointerEvents = 'none';
    scratchMark.style.zIndex = '1';
    scratchMark.style.opacity = '0';

    // Create slash line effect - more visible
    const slashLine = document.createElement('div');
    slashLine.style.position = 'absolute';
    slashLine.style.left = '40px';
    slashLine.style.top = '0';
    slashLine.style.width = '3px';
    slashLine.style.height = '80px';
    slashLine.style.background = `linear-gradient(180deg, transparent, ${tokenColor}55, ${tokenColor}aa, ${tokenColor}55, transparent)`;
    slashLine.style.transform = `rotate(${angle}rad)`;
    slashLine.style.transformOrigin = 'center center';
    slashLine.style.filter = 'blur(1.5px)';
    slashLine.style.boxShadow = `0 0 12px ${tokenColor}99, 0 0 6px ${tokenColor}cc`;
    scratchMark.appendChild(slashLine);

    document.body.appendChild(scratchMark);

    // Fade in quickly, then fade out slowly
    requestAnimationFrame(() => {
      scratchMark.style.transition = 'opacity 0.15s ease-out';
      scratchMark.style.opacity = '0.75';
    });

    setTimeout(() => {
      scratchMark.style.transition = 'opacity 2.5s ease-out';
      scratchMark.style.opacity = '0';
    }, 150);

    setTimeout(() => {
      if (document.body.contains(scratchMark)) {
        document.body.removeChild(scratchMark);
      }
    }, 2650);

    // Create token shatter particles (crumbly effect)
    const shatterCount = 12 + Math.floor(Math.random() * 8); // 12-20 pieces
    for (let i = 0; i < shatterCount; i++) {
      const shard = document.createElement('div');
      shard.className = 'token-shard';
      shard.style.position = 'fixed';
      shard.style.left = (rect.left + item.x) + 'px';
      shard.style.top = (rect.top + item.y) + 'px';

      // Random shard size (smaller, more subtle)
      const size = 4 + Math.random() * 8; // 4-12px
      shard.style.width = size + 'px';
      shard.style.height = size + 'px';

      // Mix of colors - token color and white/light fragments
      const isWhiteFragment = Math.random() > 0.6;
      shard.style.background = isWhiteFragment
        ? `rgba(255, 255, 255, ${0.7 + Math.random() * 0.3})`
        : tokenColor;

      // Random shapes for variety
      const shapeRand = Math.random();
      if (shapeRand < 0.3) {
        shard.style.borderRadius = '50%'; // Circle
      } else if (shapeRand < 0.6) {
        shard.style.borderRadius = '2px'; // Square
      } else {
        shard.style.borderRadius = '30%'; // Slightly rounded
      }

      shard.style.pointerEvents = 'none';
      shard.style.zIndex = '999';
      shard.style.opacity = '0.9';
      shard.style.boxShadow = `0 1px 3px rgba(0, 0, 0, 0.3)`;

      // Random velocity (more subtle, less chaotic)
      const shatterAngle = Math.random() * Math.PI * 2;
      const shatterSpeed = 40 + Math.random() * 80; // Slower, more controlled
      const vx = Math.cos(shatterAngle) * shatterSpeed;
      const vy = Math.sin(shatterAngle) * shatterSpeed - 15; // Slight upward bias
      const rotation = Math.random() * 360;

      shard.style.transition = 'all 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94)';

      document.body.appendChild(shard);

      requestAnimationFrame(() => {
        shard.style.transform = `translate(${vx}px, ${vy}px) rotate(${rotation}deg) scale(0.3)`;
        shard.style.opacity = '0';
      });

      setTimeout(() => {
        if (document.body.contains(shard)) {
          document.body.removeChild(shard);
        }
      }, 700);
    }
  }, [canvasRef]);

  const createExplosionEffect = useCallback((item) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const explosion = document.createElement('div');
    explosion.className = 'bomb-explosion';
    explosion.style.position = 'fixed';
    explosion.style.left = (rect.left + item.x - 50) + 'px';
    explosion.style.top = (rect.top + item.y - 50) + 'px';
    explosion.style.width = '100px';
    explosion.style.height = '100px';
    explosion.style.background = 'radial-gradient(circle, #ff4444, #ff8888, transparent)';
    explosion.style.borderRadius = '50%';
    explosion.style.pointerEvents = 'none';
    explosion.style.zIndex = '999';
    explosion.style.animation = 'explode 0.6s ease-out forwards';

    document.body.appendChild(explosion);

    setTimeout(() => {
      if (document.body.contains(explosion)) {
        document.body.removeChild(explosion);
      }
    }, 600);
  }, [canvasRef]);

  const checkSlashCollisions = useCallback((currentPos, velocity) => {
    // REQ-P2-001: Hover-to-slice - no button hold required
    // Only require movement speed above threshold for slicing
    const VELOCITY_THRESHOLD = 3; // Slightly higher threshold for hover-slice to avoid accidental slices
    if (velocity.speed < VELOCITY_THRESHOLD) return;

    items.forEach((item) => {
      if (item.slashed || slashedItems.current.has(item.id)) return;

      const dx = currentPos.x - item.x;
      const dy = currentPos.y - item.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Use larger hit detection area for better gameplay
      const hitRadius = item.hitBox || item.radius + 20; // Use hitBox if available, otherwise radius + 20

      if (distance < hitRadius) {
        const canvas = canvasRef.current;
        const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
        const popupX = rect.left + item.x;
        const popupY = rect.top + item.y;

        if (item.type.isGood) {
          // REQ-P2-003: Handle super fruits with HP
          if (item.isSuperFruit && item.hp > 1) {
            // REQ-P2-005: In multiplayer, validate hit timing and track contribution
            const playerAddress = multiplayerContext?.playerAddress || 'player';

            if (multiplayerContext && !isHitValid(item.hitLog, playerAddress)) {
              // Hit too fast, skip
              return;
            }

            // Super fruit hit but not destroyed - reduce HP
            item.hp -= 1;
            item.lastHitBy = playerAddress;
            item.hitLog.push(createHitEntry(playerAddress, 1));

            // Show hit effect but don't destroy
            console.log(`⚡ SUPER FRUIT HIT! ${item.superFruit.name} HP: ${item.hp}/${item.maxHp}`);

            // Create smaller hit particles
            onCreateParticles(item.x, item.y, item.superFruit.color, 8);

            // REQ-P2-005: Calculate points using contribution scoring
            const hitPoints = calculateHitPoints(item.superFruit, item.maxHp - item.hp, false);
            if (addPopup) {
              addPopup(popupX, popupY, hitPoints, 'hit');
            }

            // Award partial points for the hit
            onUpdateScore(hitPoints, null);

            // REQ-P2-005: Report hit to multiplayer service if in room
            if (multiplayerContext?.roomId && multiplayerContext?.onSuperFruitHit) {
              multiplayerContext.onSuperFruitHit({
                fruitId: item.id,
                hitNumber: item.maxHp - item.hp,
                damage: 1,
                fruitType: item.superFruit.name,
                fruitMaxHp: item.maxHp,
                isFinalHit: false
              });
            }

            // Mark as recently hit to prevent rapid multi-hit
            slashedItems.current.add(item.id);
            setTimeout(() => {
              slashedItems.current.delete(item.id);
            }, 150); // Allow next hit after 150ms

            return; // Don't destroy the fruit yet
          }

          // Normal fruit or super fruit final hit
          item.slashed = true;
          slashedItems.current.add(item.id);

          // REQ-P2-005: Track final hit in multiplayer
          const playerAddress = multiplayerContext?.playerAddress || 'player';
          if (item.isSuperFruit) {
            item.lastHitBy = playerAddress;
            item.hitLog.push(createHitEntry(playerAddress, 1));
          }

          // Calculate final points
          let finalPoints = item.type.points;
          if (item.isSuperFruit && item.superFruit) {
            // REQ-P2-005: Use contribution scoring for final hit
            finalPoints = calculateHitPoints(item.superFruit, item.maxHp, true);
            console.log(`🌟 SUPER FRUIT DESTROYED! ${item.superFruit.name} +${finalPoints} (${item.superFruit.scoreMultiplier}x multiplier)`);

            // REQ-P2-005: Report final hit to multiplayer service
            if (multiplayerContext?.roomId && multiplayerContext?.onSuperFruitHit) {
              multiplayerContext.onSuperFruitHit({
                fruitId: item.id,
                hitNumber: item.maxHp,
                damage: 1,
                fruitType: item.superFruit.name,
                fruitMaxHp: item.maxHp,
                isFinalHit: true
              });
            }
          } else {
            console.log('🍊 FRUIT SLICED! +' + finalPoints + ' points');
          }

          // Create combo popup callback
          const handleComboPopup = (combo, bonusPoints) => {
            // Show combo on game screen (Fruit Ninja style)
            if (showComboMessage && combo >= 2) {
              showComboMessage(combo, bonusPoints);
            }

            // Also show small popup
            if (addPopup) {
              setTimeout(() => {
                addPopup(popupX + 30, popupY - 20, bonusPoints, 'combo', combo);
              }, 200);
            }
          };

          onUpdateScore(finalPoints, handleComboPopup);

          // Create particles with appropriate color
          const particleColor = item.isSuperFruit && item.superFruit ? item.superFruit.color : '#00ff88';
          const particleCount = item.isSuperFruit ? 25 : 15;
          onCreateParticles(item.x, item.y, particleColor, particleCount);

          if (addPopup) {
            const popupType = item.isSuperFruit ? 'super' : 'token';
            addPopup(popupX, popupY, finalPoints, popupType);
          }

          const angle = Math.atan2(velocity.vy, velocity.vx);
          createSliceEffect(item, angle);

          // Record slash on blockchain if callback provided
          if (onSlashRecorded) {
            onSlashRecorded({
              isToken: true,
              isSuperFruit: item.isSuperFruit || false,
              x: item.x,
              y: item.y,
              points: finalPoints,
              combo: gameState.combo || 0
            });
          }
        } else {
          // RULE: Bomb sliced → penalty, lose 1 heart
          item.slashed = true;
          slashedItems.current.add(item.id);

          console.log('💣 BOMB SLICED! Penalty - losing 1 heart!');
          onLoseLife();
          onCreateParticles(item.x, item.y, '#ff4444', 25);
          onCreateScreenFlash();

          if (addPopup) {
            addPopup(popupX, popupY, 1, 'bomb');
          }

          createExplosionEffect(item);

          // Record bomb slash on blockchain if callback provided
          if (onSlashRecorded) {
            onSlashRecorded({
              isToken: false,
              x: item.x,
              y: item.y,
              points: 0,
              combo: gameState.combo || 0
            });
          }
        }
      }
    });
  }, [items, onUpdateScore, onLoseLife, onCreateParticles, onCreateScreenFlash, addPopup, canvasRef, createSliceEffect, createExplosionEffect, onSlashRecorded, gameState.combo, showComboMessage, multiplayerContext]);

  const startSlash = useCallback((e) => {
    if (gameState.screen !== 'game' || !gameState.isGameRunning || gameState.isPaused) return;

    const pos = getMousePos(e);
    lastMousePos.current = pos;
    slashVelocity.current = { vx: 0, vy: 0, speed: 0 };
    slashedItems.current.clear();

    addTrailPoint(pos.x, pos.y);
    setSlashPath([pos]);
  }, [gameState.screen, gameState.isGameRunning, gameState.isPaused, getMousePos, addTrailPoint]);

  const updateSlash = useCallback((e) => {
    // REQ-P2-001: Hover-to-slice - no button hold required
    if (gameState.screen !== 'game' || !gameState.isGameRunning || gameState.isPaused) return;

    const currentPos = getMousePos(e);
    const lastPos = lastMousePos.current;

    const vx = currentPos.x - lastPos.x;
    const vy = currentPos.y - lastPos.y;
    const speed = Math.sqrt(vx * vx + vy * vy);

    slashVelocity.current = { vx, vy, speed };

    // Check collisions along the entire slash line (not just current point)
    if (speed > 1) { // Lower threshold for better detection
      const steps = Math.max(5, Math.floor(speed / 2)); // More steps for better coverage
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const interpX = lastPos.x + (currentPos.x - lastPos.x) * t;
        const interpY = lastPos.y + (currentPos.y - lastPos.y) * t;

        checkSlashCollisions({ x: interpX, y: interpY }, slashVelocity.current);
      }
    }

    addTrailPoint(currentPos.x, currentPos.y);
    setSlashPath(prev => [...prev, currentPos]);

    checkSlashCollisions(currentPos, slashVelocity.current);
    lastMousePos.current = currentPos;
  }, [gameState.screen, gameState.isGameRunning, gameState.isPaused, getMousePos, addTrailPoint, checkSlashCollisions]);

  const endSlash = useCallback(() => {
    // REQ-P2-001: Clear slashed items tracking after brief delay
    setTimeout(() => {
      setSlashPath([]);
      slashedItems.current.clear();
    }, 100);
  }, []);

  return {
    startSlash,
    updateSlash,
    endSlash,
    slashPath
  };
};
