import { useState, useCallback, useEffect, useRef } from 'react';
import { useVisibility } from './useVisibility';

// OneChain tokens with different colored rings - each has different speed and difficulty
const TOKEN_TYPES = [
  { name: "Yellow Ring", image: "/logo.svg", color: "#FFD700", ringColor: "#FFD700", points: 10, speedMod: 1.0, difficulty: "Easy" },
  { name: "Green Ring", image: "/logo.svg", color: "#00FF88", ringColor: "#00FF88", points: 15, speedMod: 1.3, difficulty: "Medium" },
  { name: "Blue Ring", image: "/logo.svg", color: "#4169E1", ringColor: "#4169E1", points: 20, speedMod: 1.6, difficulty: "Hard" },
  { name: "Red Ring", image: "/logo.svg", color: "#FF4444", ringColor: "#FF4444", points: 25, speedMod: 2.0, difficulty: "Expert" },
];

const ITEM_TYPES = [
  { name: "Token", symbol: "IMAGE", color: "#FF8C00", isGood: true, points: 10, spawnWeight: 0.9 },
  { name: "Bomb", symbol: "💣", color: "#ff4444", isGood: false, points: 0, spawnWeight: 0.1 }
];

const MAX_ITEMS = 12; // Limit maximum items on screen

const getRandomItemType = (mode = null) => {
  // In Zen mode, never spawn bombs
  if (mode === 'zen') {
    return ITEM_TYPES[0]; // Always return Token
  }
  
  const random = Math.random();
  let cumulative = 0;
  
  for (let itemType of ITEM_TYPES) {
    cumulative += itemType.spawnWeight;
    if (random <= cumulative) {
      return itemType;
    }
  }
  
  return ITEM_TYPES[0];
};

// Get random token type from TOKEN_TYPES
const getRandomToken = () => {
  return TOKEN_TYPES[Math.floor(Math.random() * TOKEN_TYPES.length)];
};

export const useGameLoop = (canvasRef, gameState, onEndGame, updateParticles, onFruitMissed, difficultyLevel = 1) => {
  const [items, setItems] = useState([]);
  const [slashTrail, setSlashTrail] = useState([]);
  const [particles, setParticles] = useState([]);
  const [comboMessage, setComboMessage] = useState(null); // For on-screen combo display
  const [tokenImages, setTokenImages] = useState({});
  const isVisible = useVisibility();
  const penalizedFruits = useRef(new Set()); // Track fruits that already had penalties applied

  // Load all token images with better error handling
  useEffect(() => {
    const loadedImages = {};
    let loadedCount = 0;
    const totalTokens = TOKEN_TYPES.length;
    
    console.log(`🔄 Loading OneChain token image...`);
    
    TOKEN_TYPES.forEach((token) => {
      const img = new Image();
      
      // Set crossOrigin if needed for CORS
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        loadedImages[token.name] = img;
        loadedCount++;
        console.log(`✅ Loaded ${token.name} (${loadedCount}/${totalTokens})`);
        
        if (loadedCount === totalTokens) {
          setTokenImages(loadedImages);
          console.log('✨ OneChain token image loaded successfully!');
        }
      };
      
      img.onerror = (error) => {
        console.error(`❌ Failed to load ${token.name} from ${token.image}`, error);
        // Still increment count to prevent hanging
        loadedCount++;
        
        if (loadedCount === totalTokens) {
          setTokenImages(loadedImages);
          console.log(`⚠️ Token loading complete with ${totalTokens - Object.keys(loadedImages).length} errors`);
        }
      };
      
      // Set source last to trigger loading
      img.src = token.image;
    });
    
    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up token image loaders');
    };
  }, []);

  // Clean up items when tab becomes visible again to prevent accumulation
  useEffect(() => {
    if (isVisible && items.length > MAX_ITEMS) {
      setItems(prev => prev.slice(-MAX_ITEMS)); // Keep only the most recent items
    }
  }, [isVisible, items.length]);

  // Clear all trails when tab is not visible to prevent memory issues
  useEffect(() => {
    if (!isVisible) {
      setItems(prev => prev.map(item => ({ ...item, trail: [] })));
    }
  }, [isVisible]);

  const spawnItem = useCallback(() => {
    if (!gameState.isGameRunning || gameState.isPaused || !canvasRef.current || !isVisible) return;
    
    // Prevent spawning if there are too many items already
    if (items.length >= MAX_ITEMS) return;
    
    const canvas = canvasRef.current;
    const itemType = getRandomItemType(gameState.mode);
    
    // Randomly select a token for good items
    let randomToken = getRandomToken();
    
    // Calculate progressive difficulty based on elapsed time (Fruit Ninja style)
    let speedMultiplier = 1;
    
    if (gameState.gameStartTime) {
      const elapsed = Date.now() - gameState.gameStartTime;
      
      // Very gentle start for first 15 seconds
      if (elapsed < 15000) {
        speedMultiplier = 0.4 + (elapsed / 15000) * 0.6; // Gradually increase from 0.4x to 1x over 15 seconds
        
        // Only use yellow (easy) tokens in first 15 seconds
        if (itemType.isGood) {
          randomToken = TOKEN_TYPES[0]; // Force yellow ring (easiest)
        }
      }
      // Gradual progression 15-45 seconds
      else if (elapsed < 45000) {
        speedMultiplier = 1.0 + ((elapsed - 15000) / 30000) * 0.5; // 1.0x to 1.5x
        
        // Only yellow and green tokens (easy/medium) in first 45 seconds
        if (itemType.isGood && randomToken === TOKEN_TYPES[2]) { // If blue was selected
          randomToken = Math.random() < 0.5 ? TOKEN_TYPES[0] : TOKEN_TYPES[1]; // Replace with yellow or green
        }
        if (itemType.isGood && randomToken === TOKEN_TYPES[3]) { // If red was selected
          randomToken = Math.random() < 0.5 ? TOKEN_TYPES[0] : TOKEN_TYPES[1]; // Replace with yellow or green
        }
      }
      // Progressive difficulty after 45 seconds
      else if (elapsed > 45000) {
        const difficultyLevel = Math.floor((elapsed - 45000) / 20000); // Level up every 20 seconds after 45s
        speedMultiplier = 1.5 + (difficultyLevel * 0.3); // 1.5x, 1.8x, 2.1x, etc.
      }
    }
    
    // Apply token-specific speed modifier for good items
    if (itemType.isGood && randomToken.speedMod) {
      speedMultiplier *= randomToken.speedMod;
    }
    
    // Always spawn from top
    const spawnFromBottom = false;
    
    // Define safe spawn area (with margins to prevent tokens going off-screen)
    const MARGIN = 80; // Margin from edges
    const safeWidth = canvas.width - (MARGIN * 2);
    const spawnX = MARGIN + (Math.random() * safeWidth);
    
    let vx, vy, motionType, spawnY, gravity;
    
    if (spawnFromBottom) {
      // Spawn from bottom with upward trajectory and bounce
      spawnY = canvas.height + 40;
      
      const baseUpwardSpeed = -(8 + Math.random() * 4); // Negative for upward motion
      const bouncePattern = Math.floor(Math.random() * 2);
      
      switch(bouncePattern) {
        case 0: // High arc with bounce
          vx = (Math.random() - 0.5) * 2 * speedMultiplier; // Minimal horizontal drift
          vy = baseUpwardSpeed * speedMultiplier * 1.2;
          motionType = 'bounce-high';
          gravity = 0.35; // Gravity for bounce effect
          break;
        case 1: // Medium arc with faster bounce
          vx = (Math.random() - 0.5) * 1.5 * speedMultiplier;
          vy = baseUpwardSpeed * speedMultiplier;
          motionType = 'bounce-medium';
          gravity = 0.3;
          break;
        default:
          vx = (Math.random() - 0.5) * 1.5 * speedMultiplier;
          vy = baseUpwardSpeed * speedMultiplier;
          motionType = 'bounce-medium';
          gravity = 0.3;
          break;
      }
    } else {
      // Spawn from top with controlled descent
      spawnY = -40;
      gravity = 0.15; // Slight gravity for natural fall
      
      const motionPattern = Math.floor(Math.random() * 3);
      const baseSpeed = 3 + Math.random() * 2;
      
      switch(motionPattern) {
        case 0: // Pure straight fall
          vx = 0;
          vy = baseSpeed * speedMultiplier;
          motionType = 'straight';
          break;
        case 1: // Slight wobble
          vx = (Math.random() - 0.5) * 0.5 * speedMultiplier;
          vy = baseSpeed * speedMultiplier;
          motionType = 'wobble';
          break;
        case 2: // Fast straight drop
          vx = 0;
          vy = (baseSpeed * 1.3) * speedMultiplier;
          motionType = 'fast';
          break;
        default:
          vx = 0;
          vy = baseSpeed * speedMultiplier;
          motionType = 'straight';
          break;
      }
    }
    
    // Update item type points based on token for good items
    const finalItemType = itemType.isGood 
      ? { ...itemType, points: randomToken.points } 
      : itemType;
    
    const item = {
      id: Math.random(),
      x: spawnX,
      y: spawnY,
      vx: vx,
      vy: vy,
      gravity: gravity,
      radius: itemType.name === 'Bomb' ? 28 : 38,
      rotation: 0,
      rotationSpeed: (Math.random() - 0.5) * 0.15 * speedMultiplier,
      type: finalItemType,
      token: itemType.isGood ? randomToken : null,
      slashed: false,
      penaltyApplied: false,
      trail: [],
      motionType: motionType,
      motionTime: 0,
      amplitude: 10,
      frequency: 0.1,
      hitBox: itemType.name === 'Bomb' ? 35 : 45,
      spawnedFromBottom: spawnFromBottom
    };
    
    setItems(prev => [...prev, item]);
  }, [gameState.isGameRunning, gameState.isPaused, gameState.gameStartTime, gameState.mode, canvasRef, isVisible, items.length]);

  const updateGame = useCallback(() => {
    if (!gameState.isGameRunning || gameState.isPaused || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const now = Date.now();
    const MARGIN = 80; // Keep tokens within this margin from edges
    
    setItems(prev => prev
      .map(item => {
        item.motionTime += 0.1;
        
        let newX, newY, newVx, newVy;
        
        // Apply gravity to vertical velocity
        newVy = item.vy + (item.gravity || 0);
        newVx = item.vx;
        
        // Handle different motion patterns
        if (item.motionType === 'bounce-high' || item.motionType === 'bounce-medium') {
          // Bouncing tokens from bottom
          newX = item.x + newVx;
          newY = item.y + newVy;
          
          // Keep within horizontal bounds with bounce
          if (newX < MARGIN) {
            newX = MARGIN;
            newVx = Math.abs(newVx) * 0.7; // Bounce back with damping
          } else if (newX > canvas.width - MARGIN) {
            newX = canvas.width - MARGIN;
            newVx = -Math.abs(newVx) * 0.7; // Bounce back with damping
          }
          
        } else if (item.motionType === 'wobble') {
          // Slight wobble while falling
          const wobbleOffset = Math.sin(item.motionTime * 0.15) * 8;
          newX = item.x + newVx + wobbleOffset;
          newY = item.y + newVy;
          
          // Clamp horizontal position to stay in bounds
          newX = Math.max(MARGIN, Math.min(canvas.width - MARGIN, newX));
          
        } else if (item.motionType === 'fast') {
          // Fast straight drop
          newX = item.x;
          newY = item.y + newVy;
          
        } else {
          // Straight fall (default)
          newX = item.x + newVx;
          newY = item.y + newVy;
          
          // Clamp horizontal position
          newX = Math.max(MARGIN, Math.min(canvas.width - MARGIN, newX));
        }
        
        // Only update trails if tab is visible to prevent accumulation
        let filteredTrail = item.trail || [];
        if (isVisible) {
          const newTrail = [...item.trail, { 
            x: item.x, 
            y: item.y, 
            timestamp: now,
            alpha: 1.0
          }];
          
          filteredTrail = newTrail
            .map(point => ({
              ...point,
              alpha: Math.max(0, 1 - (now - point.timestamp) / 1000)
            }))
            .filter(point => point.alpha > 0)
            .slice(-8);
        }
        
        // Check for missed fruit penalty
        let updatedPenaltyApplied = item.penaltyApplied;
        
        // For tokens spawned from bottom, penalize if they go too low after bouncing
        // For tokens from top, penalize if they pass bottom of screen
        const missedCondition = item.spawnedFromBottom 
          ? (newY > canvas.height + 100 && item.vy > 0) // Going down and past screen
          : (newY > canvas.height + 50); // Regular tokens past screen
        
        const shouldPenalize = missedCondition && 
                              item.type.isGood && 
                              !item.slashed && 
                              !updatedPenaltyApplied && 
                              !penalizedFruits.current.has(item.id);
                              
        if (shouldPenalize && onFruitMissed) {
          console.log(`🍊 FRUIT MISSED! ID: ${item.id}, Y: ${newY}`);
          updatedPenaltyApplied = true;
          penalizedFruits.current.add(item.id);
          console.log(`✅ Fruit ID ${item.id} marked for penalty. Total penalized: ${penalizedFruits.current.size}`);
          
          requestAnimationFrame(() => {
            if (penalizedFruits.current.has(item.id)) {
              onFruitMissed();
            }
          });
        }
        
        // Log bomb missed (no penalty)
        if (newY > canvas.height + 50 && !item.type.isGood && !item.slashed) {
          console.log('💣 BOMB MISSED! No penalty - bomb fell off screen.');
        }

        return {
          ...item,
          x: newX,
          y: newY,
          vx: newVx,
          vy: newVy,
          rotation: item.rotation + item.rotationSpeed,
          trail: filteredTrail,
          penaltyApplied: updatedPenaltyApplied
        };
      })
      .filter(item => {
        const shouldKeep = item.y <= canvas.height + 100 && 
                          item.x >= -100 && 
                          item.x <= canvas.width + 100;
        
        // Clean up penalized fruits set when items are removed
        if (!shouldKeep && penalizedFruits.current.has(item.id)) {
          penalizedFruits.current.delete(item.id);
          console.log(`🧹 Cleaned up penalized fruit ID: ${item.id}. Remaining: ${penalizedFruits.current.size}`);
        }
        
        return shouldKeep;
      })
    );

    updateParticles();
  }, [gameState.isGameRunning, gameState.isPaused, updateParticles, canvasRef, isVisible, onFruitMissed]);

  const render = useCallback((ctx, itemsToRender, trail, particlesToRender) => {
    if (!ctx || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    
    // Clear canvas completely transparent to show wooden background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw items (onechain tokens and bombs)
    itemsToRender.forEach(item => {
      if (item.slashed) return;
      
      // Draw fluid trail first (before the object)
      if (item.trail && item.trail.length > 1) {
        ctx.save();
        
        // Create gradient trail
        for (let i = 1; i < item.trail.length; i++) {
          const prev = item.trail[i - 1];
          const curr = item.trail[i];
          
          if (prev && curr) {
            ctx.strokeStyle = item.type.name === 'Bomb' 
              ? `rgba(255, 68, 68, ${curr.alpha * 0.6})` // Red trail for bombs
              : `rgba(255, 215, 0, ${curr.alpha * 0.6})`; // Yellow trail for tokens
            
            ctx.lineWidth = Math.max(1, 3 * curr.alpha); // Thin trail that fades
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(curr.x, curr.y);
            ctx.stroke();
          }
        }
        
        ctx.restore();
      }
      
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(item.rotation);
      
      // Draw item shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.beginPath();
      ctx.arc(2, 2, item.radius, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw item
      if (item.type.name === 'Bomb') {
        // Special styling for bombs
        ctx.fillStyle = '#2A2A2A';
        ctx.beginPath();
        ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Add bomb border
        ctx.strokeStyle = '#FF4444';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Draw bomb emoji
        ctx.font = `${item.radius}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.type.symbol, 0, 0);
      } else {
        // Draw Token with image
        ctx.save();
        
        // Draw circular background with subtle glow
        const gradient = ctx.createRadialGradient(
          0, 0, 0,
          0, 0, item.radius * 1.1
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.7)');
        gradient.addColorStop(1, item.token?.ringColor || item.token?.color || '#FF8C00');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Add subtle outer glow with ring color
        ctx.shadowColor = item.token?.ringColor || item.token?.color || '#FF8C00';
        ctx.shadowBlur = 20;
        ctx.strokeStyle = item.token?.ringColor || item.token?.color || '#FF8C00';
        ctx.lineWidth = 4;
        ctx.stroke();
        
        // Reset shadow for image drawing
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        
        // Draw token image if loaded - larger and centered
        if (item.token && tokenImages[item.token.name]) {
          const img = tokenImages[item.token.name];
          const imgSize = item.radius * 1.6; // Larger image size
          
          // Ensure image is fully loaded before drawing
          if (img.complete && img.naturalHeight !== 0) {
            ctx.drawImage(img, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
          } else {
            // Fallback while loading
            ctx.fillStyle = item.token?.color || '#FF8C00';
            ctx.beginPath();
            ctx.arc(0, 0, item.radius * 0.5, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          // Fallback: draw colored circle with token name initial
          ctx.fillStyle = item.token?.color || '#FF8C00';
          ctx.beginPath();
          ctx.arc(0, 0, item.radius * 0.6, 0, Math.PI * 2);
          ctx.fill();
          
          // Draw first letter of token name
          if (item.token?.name) {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = `bold ${item.radius * 0.8}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(item.token.name[0], 0, 0);
          }
        }
        
        ctx.restore();
      }
      
      ctx.restore();
    });
    
    // Draw slash trail
    if (trail.length > 1) {
      ctx.save();
      ctx.strokeStyle = '#FF6B35';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = '#FF6B35';
      ctx.shadowBlur = 15;
      
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      
      for (let i = 1; i < trail.length; i++) {
        ctx.lineTo(trail[i].x, trail[i].y);
      }
      
      ctx.stroke();
      ctx.restore();
    }
    
    // Draw particles on canvas
    particlesToRender.forEach(particle => {
      ctx.save();
      ctx.globalAlpha = particle.life;
      
      // Regular particle rendering for all particles
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();
    });
    
    // Draw combo message on screen (Fruit Ninja style)
    if (comboMessage && comboMessage.visible) {
      ctx.save();
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2 - 100;
      
      // Calculate scale based on time
      const progress = (Date.now() - comboMessage.startTime) / comboMessage.duration;
      let scale = 1;
      let opacity = 1;
      
      if (progress < 0.2) {
        // Scale in
        scale = 0.5 + (progress / 0.2) * 0.7; // 0.5 to 1.2
      } else if (progress > 0.8) {
        // Fade out
        opacity = 1 - ((progress - 0.8) / 0.2);
        scale = 1.2 - ((progress - 0.8) / 0.2) * 0.2;
      } else {
        scale = 1.2;
      }
      
      ctx.globalAlpha = opacity;
      ctx.translate(centerX, centerY);
      ctx.scale(scale, scale);
      ctx.rotate(-5 * Math.PI / 180); // -5 degrees rotation
      
      // Draw combo text with bold outline
      ctx.font = 'bold 96px Impact, Arial Black, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Black outline (thick)
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 12;
      ctx.lineJoin = 'round';
      ctx.strokeText(`X${comboMessage.combo}`, 0, 0);
      
      // Yellow fill with gradient
      const gradient = ctx.createLinearGradient(0, -50, 0, 50);
      gradient.addColorStop(0, '#FFE55C');
      gradient.addColorStop(1, '#FFD700');
      ctx.fillStyle = gradient;
      ctx.fillText(`X${comboMessage.combo}`, 0, 0);
      
      // Glow effect
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 30;
      ctx.fillText(`X${comboMessage.combo}`, 0, 0);
      
      // Draw bonus points below
      ctx.shadowBlur = 0;
      ctx.font = 'bold 48px Impact, Arial Black, sans-serif';
      
      // Black outline for bonus
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 8;
      ctx.strokeText(`+${comboMessage.points}`, 0, 70);
      
      // White fill for bonus
      ctx.fillStyle = '#FFF';
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 20;
      ctx.fillText(`+${comboMessage.points}`, 0, 70);
      
      ctx.restore();
    }
  }, [canvasRef, tokenImages, comboMessage]);

  const clearAllItems = useCallback(() => {
    setItems([]);
    setSlashTrail([]);
    setParticles([]);
    penalizedFruits.current.clear(); // Clear penalty tracking when game resets
    console.log('🧹 Cleared all items and penalty tracking');
  }, []);

  const cleanupExcessItems = useCallback(() => {
    setItems(prev => {
      if (prev.length > MAX_ITEMS) {
        // Remove oldest items and clear their trails
        return prev.slice(-MAX_ITEMS).map(item => ({ ...item, trail: [] }));
      }
      return prev;
    });
  }, []);

  const showComboMessage = useCallback((combo, points) => {
    setComboMessage({
      combo,
      points,
      visible: true,
      startTime: Date.now(),
      duration: 1000 // Show for 1 second
    });
    
    // Auto-hide after duration
    setTimeout(() => {
      setComboMessage(prev => prev ? { ...prev, visible: false } : null);
    }, 1000);
  }, []);

  return {
    items,
    slashTrail,
    particles,
    setItems,
    setSlashTrail,
    setParticles,
    spawnItem,
    updateGame,
    render,
    clearAllItems,
    cleanupExcessItems,
    showComboMessage,
    itemCount: items.length
  };
};