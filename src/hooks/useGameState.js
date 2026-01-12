import { useState, useCallback, useRef, useEffect } from 'react';
import multiplayerService from '../services/multiplayerService';
import { getWalletData, setWalletData } from '../utils/walletStorage';

// Initial state without wallet-specific data
const getInitialState = () => ({
  screen: 'start',
  mode: null, // 'classic', 'arcade', 'zen'
  score: 0,
  lives: 3,
  heartHealth: [100, 100, 100], // Health for each heart [heart1, heart2, heart3]
  maxHealth: 100,
  bestScore: 0,
  bestScoreClassic: 0,
  bestScoreArcade: 0,
  bestScoreZen: 0,
  totalScore: 0,
  gamesPlayed: 0,
  isGameRunning: false,
  isPaused: false,
  totalSlashes: 0,
  limesSlashed: 0,
  bombsHit: 0,
  gameStartTime: null,
  timeRemaining: null, // For Arcade mode
  combo: 0,
  maxCombo: 0,
  lastSlashTime: 0
});

export const useGameState = (walletAddress = null) => {
  const lastPenaltyTime = useRef(0); // Track last penalty time to prevent rapid successive calls
  const currentWalletRef = useRef(walletAddress); // Track current wallet to detect changes

  const [gameState, setGameState] = useState(getInitialState());

  // Load wallet-specific game stats when wallet address changes
  useEffect(() => {
    console.log('🔄 Wallet changed:', currentWalletRef.current, '->', walletAddress);
    currentWalletRef.current = walletAddress;

    if (walletAddress) {
      // Load saved stats for this wallet
      const savedStats = {
        bestScore: getWalletData(walletAddress, 'bestScore', 0),
        bestScoreClassic: getWalletData(walletAddress, 'bestScoreClassic', 0),
        bestScoreArcade: getWalletData(walletAddress, 'bestScoreArcade', 0),
        bestScoreZen: getWalletData(walletAddress, 'bestScoreZen', 0),
        totalScore: getWalletData(walletAddress, 'totalScore', 0),
        gamesPlayed: getWalletData(walletAddress, 'gamesPlayed', 0),
      };
      console.log('📊 Loaded wallet stats:', savedStats);

      setGameState(prev => ({
        ...prev,
        ...savedStats,
        screen: 'start', // Reset to start screen when wallet changes
      }));
    } else {
      // No wallet - reset to initial state
      console.log('🔓 No wallet connected - resetting stats');
      setGameState(getInitialState());
    }
  }, [walletAddress]);

  const startGame = useCallback(async (mode = 'classic', options = {}) => {
    lastPenaltyTime.current = 0; // Reset debounce timer for new game

    // Mode-specific settings
    let initialLives = 3;
    let initialTime = null;

    if (mode === 'arcade') {
      initialLives = 3;
      initialTime = 60; // 60 seconds for Arcade mode
    } else if (mode === 'zen') {
      initialLives = 999; // Effectively unlimited in Zen mode
      initialTime = 90; // 90 seconds for Zen mode
    } else if (mode === 'classic') {
      initialLives = 3;
      // For solo stakes games, use custom time limit from options
      initialTime = options.timeLimit || null;
    }

    setGameState(prev => ({
      ...prev,
      screen: 'game',
      mode: mode,
      score: 0,
      lives: initialLives,
      heartHealth: [100, 100, 100], // Reset all hearts to full health
      isGameRunning: true,
      isPaused: false,
      totalSlashes: 0,
      citreaSlashed: 0,
      bombsHit: 0,
      gameStartTime: Date.now(),
      timeRemaining: initialTime,
      combo: 0,
      maxCombo: 0,
      lastSlashTime: 0
    }));

  }, []);

  const endGame = useCallback(async () => {
    const wallet = currentWalletRef.current;

    setGameState(prev => {
      // Update mode-specific best score
      let updatedState = { ...prev };

      if (prev.mode === 'classic') {
        const newBest = Math.max(prev.score, prev.bestScoreClassic);
        if (newBest > prev.bestScoreClassic) {
          if (wallet) setWalletData(wallet, 'bestScoreClassic', newBest);
          updatedState.bestScoreClassic = newBest;
        }
      } else if (prev.mode === 'arcade') {
        const newBest = Math.max(prev.score, prev.bestScoreArcade);
        if (newBest > prev.bestScoreArcade) {
          if (wallet) setWalletData(wallet, 'bestScoreArcade', newBest);
          updatedState.bestScoreArcade = newBest;
        }
      } else if (prev.mode === 'zen') {
        const newBest = Math.max(prev.score, prev.bestScoreZen);
        if (newBest > prev.bestScoreZen) {
          if (wallet) setWalletData(wallet, 'bestScoreZen', newBest);
          updatedState.bestScoreZen = newBest;
        }
      }

      // Overall best score
      const newBestScore = prev.score > prev.bestScore ? prev.score : prev.bestScore;
      if (newBestScore > prev.bestScore) {
        if (wallet) setWalletData(wallet, 'bestScore', newBestScore);
        updatedState.bestScore = newBestScore;
      }

      // Update total score and games played for tier system
      const newTotalScore = prev.totalScore + prev.score;
      const newGamesPlayed = prev.gamesPlayed + 1;
      if (wallet) {
        setWalletData(wallet, 'totalScore', newTotalScore);
        setWalletData(wallet, 'gamesPlayed', newGamesPlayed);
      }
      updatedState.totalScore = newTotalScore;
      updatedState.gamesPlayed = newGamesPlayed;

      return {
        ...updatedState,
        screen: 'results',
        isGameRunning: false,
        isPaused: false,
        bestScore: newBestScore
      };
    });

  }, []);

  const showStartScreen = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      screen: 'start'
    }));
  }, []);

  const updateScore = useCallback(async (points, onComboPopup) => {
    setGameState(prev => {
      const now = Date.now();
      const timeSinceLastSlash = now - prev.lastSlashTime;

      // Combo continues if slash is within 2 seconds of previous slash
      const newCombo = timeSinceLastSlash < 2000 ? prev.combo + 1 : 1;
      const comboMultiplier = Math.min(Math.floor(newCombo / 3) + 1, 5); // Max 5x multiplier
      const bonusPoints = points * (comboMultiplier - 1);

      // Trigger combo popup if we have a multiplier > 1 and callback provided
      if (comboMultiplier > 1 && bonusPoints > 0 && onComboPopup) {
        onComboPopup(newCombo, bonusPoints);
      }

      return {
        ...prev,
        score: prev.score + points + bonusPoints,
        citreaSlashed: prev.citreaSlashed + 1,
        totalSlashes: prev.totalSlashes + 1,
        combo: newCombo,
        maxCombo: Math.max(prev.maxCombo, newCombo),
        lastSlashTime: now
      };
    });
  }, []);

  const loseLife = useCallback(async () => {
    setGameState(prev => {
      // Only remove one heart if we have any hearts left
      if (prev.lives <= 0) return prev;

      const newLives = prev.lives - 1;
      const newHeartHealth = [...prev.heartHealth];

      // Remove one heart - find the last active heart and set it to 0
      for (let i = newHeartHealth.length - 1; i >= 0; i--) {
        if (newHeartHealth[i] > 0) {
          newHeartHealth[i] = 0;
          break;
        }
      }

      // NEW: Send life update to backend in multiplayer
      if (multiplayerService.currentGameId) {
        multiplayerService.updateLives(newLives, prev.score).catch(err => {
          console.error('Failed to update lives:', err);
        });
      }

      // Check if we should end the game after this life loss
      // In multiplayer, the server controls game end - don't end locally
      if (newLives <= 0 && !multiplayerService.currentGameId) {
        setTimeout(() => {
          endGame();
        }, 1000);
      }

      return {
        ...prev,
        lives: newLives,
        heartHealth: newHeartHealth,
        bombsHit: prev.bombsHit + 1,
        totalSlashes: prev.totalSlashes + 1,
        combo: 0 // Break combo when hitting bomb
      };
    });
  }, [endGame]);



  const loseLiveFromMissedToken = useCallback(async () => {
    const timestamp = Date.now();
    console.log(`🚨 loseLiveFromMissedToken() CALLED at ${timestamp} - This should be called ONLY ONCE per missed fruit!`);

    // Debounce: Prevent duplicate calls for the same miss (100ms is enough)
    // Reduced from 1000ms to allow legitimate rapid successive misses
    if (timestamp - lastPenaltyTime.current < 100) {
      console.log(`🛡️ DEBOUNCED! Last penalty was ${timestamp - lastPenaltyTime.current}ms ago. Ignoring duplicate call.`);
      return;
    }

    lastPenaltyTime.current = timestamp;

    setGameState(prev => {
      console.log(`💔 Current lives before loss: ${prev.lives}`);
      // Only remove one heart if we have any hearts left
      if (prev.lives <= 0) {
        console.log('❌ No lives left, ignoring penalty');
        return prev;
      }

      const newLives = prev.lives - 1;
      console.log(`💔 New lives after loss: ${newLives}`);
      const newHeartHealth = [...prev.heartHealth];

      // Remove one heart - find the last active heart and set it to 0
      for (let i = newHeartHealth.length - 1; i >= 0; i--) {
        if (newHeartHealth[i] > 0) {
          newHeartHealth[i] = 0;
          break;
        }
      }

      // NEW: Send life update to backend in multiplayer
      if (multiplayerService.currentGameId) {
        console.log(`📡 Sending life update to backend: lives=${newLives}, score=${prev.score}`);
        multiplayerService.updateLives(newLives, prev.score).catch(err => {
          console.error('Failed to update lives:', err);
        });
      }

      // Check if we should end the game after this life loss
      // In multiplayer, the server controls game end - don't end locally
      if (newLives <= 0 && !multiplayerService.currentGameId) {
        console.log(`💀 No lives left! Ending game in 1 second...`);
        setTimeout(() => {
          endGame();
        }, 1000);
      } else if (newLives <= 0) {
        console.log(`💀 No lives left! Waiting for server to end multiplayer game...`);
      }

      return {
        ...prev,
        lives: newLives,
        heartHealth: newHeartHealth,
        combo: 0 // Break combo when missing fruit
      };
    });
  }, [endGame]);

  const togglePause = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      isPaused: !prev.isPaused
    }));
  }, []);

  const createParticles = useCallback((x, y, color, count) => {
    // This will be handled by the App component
    console.log('Creating particles:', { x, y, color, count });
  }, []);

  const createScreenFlash = useCallback(() => {
    const flash = document.createElement('div');
    flash.className = 'screen-flash';
    document.body.appendChild(flash);

    setTimeout(() => {
      if (document.body.contains(flash)) {
        document.body.removeChild(flash);
      }
    }, 300);
  }, []);

  const decrementTimer = useCallback(() => {
    setGameState(prev => {
      if (prev.timeRemaining === null || prev.timeRemaining <= 0) {
        return prev;
      }

      const newTime = prev.timeRemaining - 1;

      // End game when timer hits 0
      if (newTime <= 0) {
        setTimeout(() => {
          endGame();
        }, 100);
        return {
          ...prev,
          timeRemaining: 0
        };
      }

      return {
        ...prev,
        timeRemaining: newTime
      };
    });
  }, [endGame]);

  return {
    gameState,
    startGame,
    endGame,
    showStartScreen,
    updateScore,
    loseLife,
    loseLiveFromMissedToken,
    togglePause,
    createParticles,
    createScreenFlash,
    decrementTimer
  };
};