import { useState, useCallback, useEffect, useRef } from 'react';
import { useVisibility } from './useVisibility';
import { ITEM_CONFIG, SPEED_CONFIG, DIFFICULTY_CONFIG, SUPER_FRUIT_CONFIG } from '../config/gameConfig';

// OneChain ecosystem tokens - distinct logos per coin
const TOKEN_TYPES = [
  { name: "OCT", image: "https://cryptologos.cc/logos/optimism-op-logo.svg?v=029", color: "#FF0420", ringColor: "#FF0420", glowColor: "#FF042066", points: 15, speedMod: 1.1, size: 1.0, difficulty: "Easy", spawnWeight: 0.20, ringWidth: 3 },
  { name: "USDH", image: "https://cryptologos.cc/logos/usd-coin-usdc-logo.svg?v=029", color: "#2775CA", ringColor: "#2775CA", glowColor: "#2775CA66", points: 20, speedMod: 1.2, size: 1.0, difficulty: "Easy", spawnWeight: 0.16, ringWidth: 4 },
  { name: "USDO", image: "https://cryptologos.cc/logos/multi-collateral-dai-dai-logo.svg?v=029", color: "#F5AC37", ringColor: "#F5AC37", glowColor: "#F5AC3766", points: 25, speedMod: 1.3, size: 1.05, difficulty: "Medium", spawnWeight: 0.12, ringWidth: 4 },
  { name: "OUSDT", image: "https://cryptologos.cc/logos/tether-usdt-logo.svg?v=029", color: "#26A17B", ringColor: "#26A17B", glowColor: "#26A17B66", points: 30, speedMod: 1.4, size: 1.05, difficulty: "Medium", spawnWeight: 0.10, ringWidth: 4 },
  { name: "Gold OCT", image: "https://cryptologos.cc/logos/optimism-op-logo.svg?v=029", color: "#F39C12", ringColor: "#F39C12", glowColor: "#F39C1266", points: 50, speedMod: 1.75, size: 1.15, difficulty: "Hard", spawnWeight: 0.05, ringWidth: 5 },
  { name: "Diamond USDH", image: "https://cryptologos.cc/logos/usd-coin-usdc-logo.svg?v=029", color: "#B9F2FF", ringColor: "#B9F2FF", glowColor: "#B9F2FF88", points: 60, speedMod: 1.9, size: 1.2, difficulty: "Expert", spawnWeight: 0.04, ringWidth: 5, shimmer: true },
  { name: "DIAMOND", image: "/logo.svg", color: "#467DFF", ringColor: "#467DFF", glowColor: "#467DFF66", points: 10, speedMod: 1.0, size: 1.0, difficulty: "Easy", spawnWeight: 0.22, ringWidth: 3 },
  { name: "Gold DIAMOND", image: "/logo.svg", color: "#FFD700", ringColor: "#FFD700", glowColor: "#FFD70066", points: 40, speedMod: 1.6, size: 1.1, difficulty: "Hard", spawnWeight: 0.08, ringWidth: 5 },
  { name: "Legendary DIAMOND", image: "/logo.svg", color: "#FF4500", ringColor: "#FF4500", glowColor: "#FF450088", points: 75, speedMod: 2.0, size: 1.25, difficulty: "Expert", spawnWeight: 0.02, ringWidth: 6, shimmer: true, doubleRing: true },
  { name: "Mythic OCT", image: "https://cryptologos.cc/logos/optimism-op-logo.svg?v=029", color: "#FF00FF", ringColor: "#FF00FF", glowColor: "#FF00FF88", points: 100, speedMod: 2.2, size: 1.3, difficulty: "Expert", spawnWeight: 0.01, ringWidth: 6, shimmer: true, doubleRing: true },
];

const ITEM_TYPES = [
  { name: "Token", symbol: "IMAGE", color: "#FF8C00", isGood: true, points: 10, spawnWeight: 0.9 },
  { name: "Bomb", symbol: "💣", color: "#ff4444", isGood: false, points: 0, spawnWeight: 0.1 }
];

// REQ-P2-002: Increased max items from 12 to 20 (+67%)
const MAX_ITEMS = ITEM_CONFIG.maxItems;

// Spawn interval multiplier based on difficulty - higher difficulties spawn MORE items
// This is separate from speed - we want more items, not just faster items
// NOTE: This logic is duplicated in GameScreen.js for the spawn interval calculations
// eslint-disable-next-line no-unused-vars
const getSpawnIntervalMultiplier = (difficultyLevel, isMultiplayer = false) => {
  // Multiplayer always uses faster spawning for competitive gameplay
  if (isMultiplayer) return 0.6; // 40% faster spawns in multiplayer

  // Solo mode difficulty-based spawning
  if (difficultyLevel >= 1.5) return 0.5;  // Extreme: 50% faster spawns
  if (difficultyLevel >= 1.3) return 0.6;  // Hard: 40% faster spawns
  if (difficultyLevel >= 1.15) return 0.8; // Medium: 20% faster spawns
  return 1.0; // Easy: normal spawn rate
};

// Get wave size bonus based on difficulty - higher difficulties get more items per wave
// NOTE: This logic is duplicated in GameScreen.js for the spawn interval calculations
// eslint-disable-next-line no-unused-vars
const getDifficultyWaveBonus = (difficultyLevel, isMultiplayer = false) => {
  if (isMultiplayer) return 1; // +1 extra item per wave in multiplayer

  if (difficultyLevel >= 1.5) return 2;  // Extreme: +2 items per wave
  if (difficultyLevel >= 1.3) return 1;  // Hard: +1 item per wave
  if (difficultyLevel >= 1.15) return 1; // Medium: +1 item per wave sometimes
  return 0; // Easy: no bonus
};

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

// Get random token type from TOKEN_TYPES using weighted selection
const getRandomToken = () => {
  const totalWeight = TOKEN_TYPES.reduce((sum, t) => sum + t.spawnWeight, 0);
  let random = Math.random() * totalWeight;

  for (const token of TOKEN_TYPES) {
    random -= token.spawnWeight;
    if (random <= 0) return token;
  }
  return TOKEN_TYPES[0];
};

// REQ-P2-003: Get random super fruit type based on spawn weights
const getRandomSuperFruit = () => {
  if (!SUPER_FRUIT_CONFIG.enabled || SUPER_FRUIT_CONFIG.types.length === 0) {
    return null;
  }

  const totalWeight = SUPER_FRUIT_CONFIG.types.reduce((sum, type) => sum + type.spawnWeight, 0);
  let random = Math.random() * totalWeight;

  for (const fruitType of SUPER_FRUIT_CONFIG.types) {
    random -= fruitType.spawnWeight;
    if (random <= 0) {
      return fruitType;
    }
  }

  return SUPER_FRUIT_CONFIG.types[0];
};

// REQ-P2-003: Check if should spawn super fruit based on elapsed time
const shouldSpawnSuperFruit = (elapsedTime) => {
  if (!SUPER_FRUIT_CONFIG.enabled) return false;
  if (elapsedTime < SUPER_FRUIT_CONFIG.minTimeToSpawn) return false;

  // Calculate spawn probability based on elapsed time
  const minutesElapsed = elapsedTime / 60000;
  const probability = Math.min(
    SUPER_FRUIT_CONFIG.baseSpawnProbability + (minutesElapsed * SUPER_FRUIT_CONFIG.probabilityIncreasePerMinute),
    SUPER_FRUIT_CONFIG.maxSpawnProbability
  );

  return Math.random() < probability;
};

export const useGameLoop = (canvasRef, gameState, onEndGame, updateParticles, onFruitMissed, difficultyLevel = 1, multiplayerGameId = null) => {
  const [items, setItems] = useState([]);
  const [slashTrail, setSlashTrail] = useState([]);
  const [particles, setParticles] = useState([]);
  const [comboMessage, setComboMessage] = useState(null); // For on-screen combo display
  const [loadedImages, setLoadedImages] = useState({});
  const isVisible = useVisibility();
  const penalizedFruits = useRef(new Set()); // Track fruits that already had penalties applied

  // Load all distinct coin images
  useEffect(() => {
    const imagesToLoad = [...new Set(TOKEN_TYPES.map(t => t.image).filter(Boolean))];

    imagesToLoad.forEach(src => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        setLoadedImages(prev => ({ ...prev, [src]: img }));
      };
      img.src = src;
    });
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
    // In multiplayer, continue spawning even if tab is hidden
    const shouldCheckVisibility = !multiplayerGameId;
    if (!gameState.isGameRunning || gameState.isPaused || !canvasRef.current || (shouldCheckVisibility && !isVisible)) return;

    // Prevent spawning if there are too many items already
    if (items.length >= MAX_ITEMS) return;

    const canvas = canvasRef.current;
    const itemType = getRandomItemType(gameState.mode);

    // Select a weighted random token type for good items
    let randomToken = getRandomToken();

    // Calculate progressive difficulty based on elapsed time (Fruit Ninja style)
    // REQ-P2-002: Apply base speed multiplier for faster gameplay
    let speedMultiplier = SPEED_CONFIG.baseMultiplier; // 1.4x base speed
    const isMultiplayer = !!multiplayerGameId;

    if (gameState.gameStartTime) {
      const elapsed = Date.now() - gameState.gameStartTime;

      // Multiplayer: Skip tutorial phase, start with action immediately
      if (isMultiplayer) {
        // Faster progression for competitive gameplay
        if (elapsed < DIFFICULTY_CONFIG.phases.tutorial) {
          speedMultiplier = SPEED_CONFIG.baseMultiplier * (0.8 + (elapsed / DIFFICULTY_CONFIG.phases.tutorial) * 0.2);
        } else if (elapsed < DIFFICULTY_CONFIG.phases.early) {
          speedMultiplier = SPEED_CONFIG.baseMultiplier * (1.0 + ((elapsed - DIFFICULTY_CONFIG.phases.tutorial) / 15000) * 0.3);
        } else {
          const level = Math.floor((elapsed - DIFFICULTY_CONFIG.phases.early) / 15000);
          // REQ-P2-002: Exponential curve for later stages
          speedMultiplier = SPEED_CONFIG.baseMultiplier * Math.min(
            1.3 * Math.pow(DIFFICULTY_CONFIG.exponentialFactor, level),
            SPEED_CONFIG.maxSpeedMultiplier
          );
        }
        // All tokens available from start in multiplayer
      }
      // Solo mode: Applies difficultyLevel modifier with enhanced base speed
      else {
        // Shortened tutorial phase (10 seconds instead of 15)
        if (elapsed < DIFFICULTY_CONFIG.phases.tutorial) {
          speedMultiplier = SPEED_CONFIG.baseMultiplier * (0.6 + (elapsed / DIFFICULTY_CONFIG.phases.tutorial) * 0.4);

          // Only spawn easy-difficulty fruits in tutorial for Easy/Medium
          if (itemType.isGood && difficultyLevel < 1.3) {
            const easyTokens = TOKEN_TYPES.filter(t => t.difficulty === 'Easy');
            randomToken = easyTokens[Math.floor(Math.random() * easyTokens.length)];
          } else if (itemType.isGood && difficultyLevel >= 1.3) {
            // Hard/Extreme: Allow Easy + Medium fruits from start
            const allowedTokens = TOKEN_TYPES.filter(t => t.difficulty === 'Easy' || t.difficulty === 'Medium');
            randomToken = allowedTokens[Math.floor(Math.random() * allowedTokens.length)];
          }
        }
        // Early game progression
        else if (elapsed < DIFFICULTY_CONFIG.phases.mid) {
          speedMultiplier = SPEED_CONFIG.baseMultiplier * (1.0 + ((elapsed - DIFFICULTY_CONFIG.phases.tutorial) / 35000) * 0.4);

          // Restrict Expert-tier fruits in early game - reroll to easier options
          if (itemType.isGood && (randomToken.difficulty === 'Expert' || randomToken.difficulty === 'Hard')) {
            const earlyTokens = TOKEN_TYPES.filter(t => t.difficulty === 'Easy' || t.difficulty === 'Medium');
            randomToken = earlyTokens[Math.floor(Math.random() * earlyTokens.length)];
          }
        }
        // REQ-P2-002: Exponential difficulty progression after mid-game
        else {
          const timeLevel = Math.floor((elapsed - DIFFICULTY_CONFIG.phases.mid) / 20000);
          speedMultiplier = SPEED_CONFIG.baseMultiplier * Math.min(
            1.4 * Math.pow(DIFFICULTY_CONFIG.exponentialFactor, timeLevel),
            SPEED_CONFIG.maxSpeedMultiplier
          );
        }

        // Apply difficulty level modifier
        const difficultyMod = SPEED_CONFIG.difficultySpeed[
          difficultyLevel >= 1.5 ? 'extreme' :
            difficultyLevel >= 1.3 ? 'hard' :
              difficultyLevel >= 1.15 ? 'medium' : 'easy'
        ] || 1.0;
        speedMultiplier *= difficultyMod;
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

      switch (bouncePattern) {
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

      switch (motionPattern) {
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

    // REQ-P2-003: Check if this should be a super fruit
    const elapsed = gameState.gameStartTime ? Date.now() - gameState.gameStartTime : 0;
    const isSuperFruit = itemType.isGood && shouldSpawnSuperFruit(elapsed);
    const superFruitType = isSuperFruit ? getRandomSuperFruit() : null;

    // Calculate radius based on item type, token size, and super fruit
    const baseRadius = itemType.name === 'Bomb' ? 28 : 38;
    let itemRadius = itemType.isGood && randomToken.size ? baseRadius * randomToken.size : baseRadius;
    if (superFruitType) {
      itemRadius = 38 * superFruitType.size; // Apply size modifier
    }

    const item = {
      id: Math.random(),
      x: spawnX,
      y: spawnY,
      vx: vx,
      vy: vy,
      gravity: gravity,
      radius: itemRadius,
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
      hitBox: itemType.name === 'Bomb' ? 35 : (superFruitType ? 45 * superFruitType.size : 45),
      spawnedFromBottom: spawnFromBottom,
      // REQ-P2-003: Super fruit properties
      isSuperFruit: isSuperFruit,
      superFruit: superFruitType,
      hp: superFruitType ? superFruitType.hp : 1,
      maxHp: superFruitType ? superFruitType.maxHp : 1,
      hitLog: [], // Track who hit this for multiplayer contribution scoring
      lastHitBy: null
    };

    setItems(prev => [...prev, item]);
  }, [gameState.isGameRunning, gameState.isPaused, gameState.gameStartTime, gameState.mode, canvasRef, isVisible, items.length, multiplayerGameId, difficultyLevel]);

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

        // REQ-P2-003: Special rendering for super fruits
        if (item.isSuperFruit && item.superFruit) {
          const sf = item.superFruit;

          // Outer glow for super fruits
          ctx.shadowColor = sf.glowColor;
          ctx.shadowBlur = 25 + (Math.sin(Date.now() / 200) * 5); // Pulsing glow

          // Draw gradient background
          const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, item.radius);
          gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
          gradient.addColorStop(0.4, sf.glowColor);
          gradient.addColorStop(1, sf.color);

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
          ctx.fill();

          // Draw colored ring
          ctx.strokeStyle = sf.color;
          ctx.lineWidth = 5;
          ctx.stroke();

          // Reset shadow for emoji
          ctx.shadowBlur = 0;

          // Draw super fruit emoji
          ctx.font = `${item.radius * 1.2}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#000';
          ctx.fillText(sf.emoji, 0, 3);

          ctx.restore();

          // Draw HP bar above super fruit (outside rotation context)
          ctx.save();
          const barWidth = item.radius * 1.6;
          const barHeight = 8;
          const barX = item.x - barWidth / 2;
          const barY = item.y - item.radius - 18;

          // HP bar background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(barX, barY, barWidth, barHeight, 4);
          ctx.fill();
          ctx.stroke();

          // HP fill
          const hpPercent = item.hp / item.maxHp;
          const fillColor = hpPercent > 0.5 ? '#00ff00' : hpPercent > 0.25 ? '#ffff00' : '#ff4444';
          const fillWidth = barWidth * hpPercent;

          ctx.fillStyle = fillColor;
          ctx.shadowColor = fillColor;
          ctx.shadowBlur = 5;
          ctx.beginPath();
          ctx.roundRect(barX, barY, fillWidth, barHeight, 4);
          ctx.fill();

          // HP text
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 10px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${item.hp}/${item.maxHp}`, item.x, barY + barHeight / 2);

          ctx.restore();
        } else {
          // Regular token rendering - OneChain coin tiers with unique visuals
          const tokenColor = item.token?.ringColor || item.token?.color || '#FFD700';
          const rw = item.token?.ringWidth || 3;

          // Shimmer effect for rare coins
          if (item.token?.shimmer) {
            ctx.shadowColor = item.token.glowColor || tokenColor;
            ctx.shadowBlur = 22 + Math.sin(Date.now() / 150) * 6;
          }

          // Draw circular background with tier-colored gradient
          const gradient = ctx.createRadialGradient(
            0, 0, 0,
            0, 0, item.radius * 1.1
          );
          gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
          gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.7)');
          gradient.addColorStop(1, tokenColor);

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
          ctx.fill();

          // Double ring effect for legendary/mythic
          if (item.token?.doubleRing) {
            ctx.strokeStyle = tokenColor;
            ctx.lineWidth = rw;
            ctx.stroke();
            // Outer ring
            ctx.beginPath();
            ctx.arc(0, 0, item.radius + rw + 2, 0, Math.PI * 2);
            ctx.strokeStyle = tokenColor;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
          } else {
            // Single ring with tier-specific width
            ctx.shadowColor = item.token?.glowColor || tokenColor;
            ctx.shadowBlur = 18;
            ctx.strokeStyle = tokenColor;
            ctx.lineWidth = rw;
            ctx.stroke();
          }

          // Reset shadow for image drawing
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;

          // Draw individual coin logo image
          const currentImg = loadedImages[item.token?.image];
          if (currentImg && currentImg.complete && currentImg.naturalHeight !== 0) {
            const imgSize = item.radius * 1.5;
            ctx.drawImage(currentImg, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
          } else {
            // Fallback: draw token initial
            ctx.fillStyle = tokenColor;
            ctx.beginPath();
            ctx.arc(0, 0, item.radius * 0.5, 0, Math.PI * 2);
            ctx.fill();
            if (item.token?.name) {
              ctx.fillStyle = '#FFFFFF';
              ctx.font = `bold ${item.radius * 0.8}px Arial`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(item.token.name[0], 0, 0);
            }
          }

          // Draw point value for coins worth more than base
          if (item.token?.points && item.token.points > 10) {
            ctx.font = `bold ${Math.max(10, item.radius * 0.35)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.lineWidth = 2;
            const labelY = item.radius + 12;
            ctx.strokeText(`+${item.token.points}`, 0, labelY);
            ctx.fillText(`+${item.token.points}`, 0, labelY);
          }

          ctx.restore();
        }
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
  }, [canvasRef, loadedImages, comboMessage]);

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