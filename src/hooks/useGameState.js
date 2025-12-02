import { useState, useCallback, useRef } from 'react';

export const useGameState = () => {
  const lastPenaltyTime = useRef(0); // Track last penalty time to prevent rapid successive calls
  
  const [gameState, setGameState] = useState({
    screen: 'start',
    mode: null, // 'classic', 'arcade', 'zen'
    score: 0,
    lives: 3,
    heartHealth: [100, 100, 100], // Health for each heart [heart1, heart2, heart3]
    maxHealth: 100,
    bestScore: parseInt(localStorage.getItem('fruitNinjaBestScore')) || 0,
    bestScoreClassic: parseInt(localStorage.getItem('bestScoreClassic')) || 0,
    bestScoreArcade: parseInt(localStorage.getItem('bestScoreArcade')) || 0,
    bestScoreZen: parseInt(localStorage.getItem('bestScoreZen')) || 0,
    totalScore: parseInt(localStorage.getItem('totalScore')) || 0,
    gamesPlayed: parseInt(localStorage.getItem('gamesPlayed')) || 0,
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

  const startGame = useCallback(async (mode = 'classic') => {
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
    setGameState(prev => {
      // Update mode-specific best score
      let updatedState = { ...prev };
      
      if (prev.mode === 'classic') {
        const newBest = Math.max(prev.score, prev.bestScoreClassic);
        if (newBest > prev.bestScoreClassic) {
          localStorage.setItem('bestScoreClassic', newBest.toString());
          updatedState.bestScoreClassic = newBest;
        }
      } else if (prev.mode === 'arcade') {
        const newBest = Math.max(prev.score, prev.bestScoreArcade);
        if (newBest > prev.bestScoreArcade) {
          localStorage.setItem('bestScoreArcade', newBest.toString());
          updatedState.bestScoreArcade = newBest;
        }
      } else if (prev.mode === 'zen') {
        const newBest = Math.max(prev.score, prev.bestScoreZen);
        if (newBest > prev.bestScoreZen) {
          localStorage.setItem('bestScoreZen', newBest.toString());
          updatedState.bestScoreZen = newBest;
        }
      }
      
      // Overall best score
      const newBestScore = prev.score > prev.bestScore ? prev.score : prev.bestScore;
      if (newBestScore > prev.bestScore) {
        localStorage.setItem('fruitNinjaBestScore', newBestScore.toString());
        updatedState.bestScore = newBestScore;
      }
      
      // Update total score and games played for tier system
      const newTotalScore = prev.totalScore + prev.score;
      const newGamesPlayed = prev.gamesPlayed + 1;
      localStorage.setItem('totalScore', newTotalScore.toString());
      localStorage.setItem('gamesPlayed', newGamesPlayed.toString());
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
      
      const newState = {
        ...prev,
        lives: newLives,
        heartHealth: newHeartHealth,
        bombsHit: prev.bombsHit + 1,
        totalSlashes: prev.totalSlashes + 1,
        combo: 0 // Break combo when hitting bomb
      };
      
      // Check if we should end the game after this life loss
      if (newLives <= 0) {
        setTimeout(async () => {
          await endGame();
        }, 1000);
      }
      
      return newState;
    });
  }, [endGame]);
      


  const loseLiveFromMissedToken = useCallback(async () => {
    const timestamp = Date.now();
    console.log(`🚨 loseLiveFromMissedToken() CALLED at ${timestamp} - This should be called ONLY ONCE per missed fruit!`);
    
    // Debounce: Prevent calls within 1000ms of each other
    if (timestamp - lastPenaltyTime.current < 1000) {
      console.log(`🛡️ DEBOUNCED! Last penalty was ${timestamp - lastPenaltyTime.current}ms ago. Ignoring this call.`);
      return;
    }
    
    lastPenaltyTime.current = timestamp;
    console.trace('Call stack trace:'); // This will show us who called this function
    
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
      
      const newState = {
        ...prev,
        lives: newLives,
        heartHealth: newHeartHealth,
        combo: 0 // Break combo when missing fruit
      };
      
      // Check if we should end the game after this life loss
      if (newLives <= 0) {
        setTimeout(async () => {
          await endGame();
        }, 1000);
      }
      
      return newState;
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