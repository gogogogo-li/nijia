import { useState, useCallback, useRef } from 'react';

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
  showComboMessage // Function to show combo on game screen
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
    if (!isSlashing || velocity.speed < 2) return; // Lower speed threshold for easier slashing
    
    items.forEach((item) => {
      if (item.slashed || slashedItems.current.has(item.id)) return;
      
      const dx = currentPos.x - item.x;
      const dy = currentPos.y - item.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Use larger hit detection area for better gameplay
      const hitRadius = item.hitBox || item.radius + 20; // Use hitBox if available, otherwise radius + 20
      
      if (distance < hitRadius) {
        item.slashed = true;
        slashedItems.current.add(item.id);
        
        const canvas = canvasRef.current;
        const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
        const popupX = rect.left + item.x;
        const popupY = rect.top + item.y;
        
        if (item.type.isGood) {
          // RULE: Fruit sliced → gain points (no heart lost)
          console.log('🍊 FRUIT SLICED! +' + item.type.points + ' points');
          
          // Create combo popup callback
          const handleComboPopup = (combo, bonusPoints) => {
            // Show combo on game screen (Fruit Ninja style)
            if (showComboMessage && combo >= 2) {
              showComboMessage(combo, bonusPoints);
            }
            
            // Also show small popup (can be removed if not wanted)
            if (addPopup) {
              setTimeout(() => {
                addPopup(popupX + 30, popupY - 20, bonusPoints, 'combo', combo);
              }, 200);
            }
          };
          
          onUpdateScore(item.type.points, handleComboPopup);
          onCreateParticles(item.x, item.y, '#00ff88', 15);
          
          if (addPopup) {
            addPopup(popupX, popupY, item.type.points, 'token');
          }
          
          const angle = Math.atan2(velocity.vy, velocity.vx);
          createSliceEffect(item, angle);
          
          // Record slash on blockchain if callback provided
          if (onSlashRecorded) {
            onSlashRecorded({
              isToken: true,
              x: item.x,
              y: item.y,
              points: item.type.points,
              combo: gameState.combo || 0
            });
          }
        } else {
          // RULE: Bomb sliced → penalty, lose 1 heart
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
  }, [items, isSlashing, onUpdateScore, onLoseLife, onCreateParticles, onCreateScreenFlash, addPopup, canvasRef, createSliceEffect, createExplosionEffect, onSlashRecorded, gameState.combo]);

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
    if (!isSlashing || gameState.screen !== 'game' || !gameState.isGameRunning || gameState.isPaused) return;
    
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
  }, [isSlashing, gameState.screen, gameState.isGameRunning, gameState.isPaused, getMousePos, addTrailPoint, checkSlashCollisions]);

  const endSlash = useCallback(() => {
    if (!isSlashing) return;
    
    setTimeout(() => {
      setSlashPath([]);
      slashedItems.current.clear();
    }, 100);
  }, [isSlashing]);

  return {
    startSlash,
    updateSlash,
    endSlash,
    slashPath
  };
};
