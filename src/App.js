import React, { useState, useCallback } from 'react';
import StartScreen from './components/StartScreen';
import GameScreen from './components/GameScreen';
import ResultsScreen from './components/ResultsScreen';
import ParticleContainer from './components/ParticleContainer';
import LandingPage from './components/LandingPage';
import ModeSelection from './components/ModeSelection';
import SoloModeSelect from './components/SoloModeSelect';
import BladeCursor from './components/BladeCursor';
import { useGameState } from './hooks/useGameState';
import { useTaskbarControls } from './hooks/useTaskbarControls';
import { useOneChain } from './hooks/useOneChain';
import './App.css';
import { SpeedInsights } from "@vercel/speed-insights/react"
import { Analytics } from "@vercel/analytics/react"
import MultiplayerLobby from './components/MultiplayerLobby';

function App() {
  // OneChain wallet and blockchain integration - must be first to get wallet address
  const onechain = useOneChain();

  const {
    gameState,
    startGame,
    endGame,
    showStartScreen,
    updateScore,
    loseLife,
    loseLiveFromMissedToken,
    togglePause,
    createScreenFlash,
    decrementTimer
  } = useGameState(onechain?.walletAddress); // Pass wallet address for wallet-scoped storage
  const [particles, setParticles] = useState([]);
  const [showLanding, setShowLanding] = useState(true);
  const [showMultiplayer, setShowMultiplayer] = useState(false);
  const [showModeSelection, setShowModeSelection] = useState(false);
  const [showSoloMode, setShowSoloMode] = useState(false);
  const [soloGameData, setSoloGameData] = useState(null);
  const [multiplayerGameId, setMultiplayerGameId] = useState(null);

  // Add taskbar controls (pass multiplayer flag to disable pause in multiplayer)
  useTaskbarControls(gameState, togglePause, multiplayerGameId);

  const handleCreateParticles = useCallback((x, y, color, count) => {
    const newParticles = [];
    // Create fewer, token-based particles
    const tokenEmojis = ['⭐', '✨', '💰'];
    const tokenCount = Math.min(count, 8); // Limit to 8 tokens max

    for (let i = 0; i < tokenCount; i++) {
      const angle = (Math.PI * 2 * i) / tokenCount;
      const velocity = 2 + Math.random() * 3;
      const particle = {
        id: Math.random(),
        x: x,
        y: y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 1, // Slight upward bias
        color: color,
        life: 1.0,
        decay: 0.02 + Math.random() * 0.01,
        size: 16 + Math.random() * 8, // Bigger size for emojis
        emoji: tokenEmojis[Math.floor(Math.random() * tokenEmojis.length)],
        isToken: true // Flag to render as emoji
      };
      newParticles.push(particle);
    }
    setParticles(prev => [...prev, ...newParticles]);
  }, []);

  const updateParticles = useCallback(() => {
    setParticles(prev => prev
      .map(particle => ({
        ...particle,
        x: particle.x + particle.vx,
        y: particle.y + particle.vy,
        life: particle.life - particle.decay,
        vy: particle.vy + 0.15,
        vx: particle.vx * 0.98
      }))
      .filter(particle => particle.life > 0)
    );
  }, []);

  const renderScreen = () => {
    switch (gameState.screen) {
      case 'start':
        return (
          <StartScreen
            bestScore={gameState.bestScore}
            onStartGame={startGame}
          />
        );
      case 'game':
        return (
          <GameScreen
            gameState={gameState}
            onEndGame={endGame}
            onUpdateScore={updateScore}
            onLoseLife={loseLife}
            onLoseLiveFromMissedToken={loseLiveFromMissedToken}
            onTogglePause={togglePause}
            onCreateParticles={handleCreateParticles}
            onCreateScreenFlash={createScreenFlash}
            onDecrementTimer={decrementTimer}
            updateParticles={updateParticles}
            onBackToHome={handleBackToLanding}
            onechain={onechain}
            multiplayerGameId={multiplayerGameId}
            soloGameData={soloGameData}
          />
        );
      case 'results':
        return (
          <ResultsScreen
            gameState={gameState}
            onStartGame={startGame}
            onShowStartScreen={handleBackToLanding}
            onechain={onechain}
            multiplayerGameId={multiplayerGameId}
            onBackToMultiplayer={handleBackToMultiplayerLobby}
            soloGameData={soloGameData}
          />
        );
      default:
        return null;
    }
  };

  const handleStartFromLanding = useCallback(() => {
    setShowLanding(false);
    setShowModeSelection(true);
  }, []);

  const handleModeSelect = (mode) => {
    setShowModeSelection(false);
    startGame(mode);
    // Start blockchain game session if wallet is connected
    if (onechain.isConnected) {
      onechain.startGameSession();
    }
  };

  const handleBackToLanding = () => {
    showStartScreen(); // Reset game state to start screen
    setShowLanding(true);
    setShowMultiplayer(false);
    setShowModeSelection(false);
    setShowSoloMode(false);
    setMultiplayerGameId(null);
    setSoloGameData(null);
  };

  const handleShowMultiplayer = () => {
    if (!onechain.isConnected) {
      alert('Please connect your OneWallet to play multiplayer games!');
      return;
    }
    setShowLanding(false);
    setShowMultiplayer(true);
  };

  const handleStartMultiplayerGame = (gameId) => {
    setMultiplayerGameId(gameId);
    setShowMultiplayer(false);
    startGame();
  };

  const handleBackToMultiplayerLobby = () => {
    showStartScreen();
    setShowMultiplayer(true);
  };

  // Solo Mode Handlers
  const handleShowSoloMode = () => {
    if (!onechain.isConnected) {
      alert('Please connect your OneWallet to play staked solo games!');
      return;
    }
    setShowModeSelection(false);
    setShowSoloMode(true);
  };

  const handleSoloDifficultySelect = async (difficulty) => {
    console.log('Starting solo game with difficulty:', difficulty);

    try {
      // 1. Create game on-chain (stake OCT)
      console.log('📝 Creating game on-chain...');
      const txResult = await onechain.createSoloGame(difficulty.id);

      if (!txResult.success) {
        throw new Error(txResult.error || 'Failed to create game on-chain');
      }

      console.log('✅ On-chain game created:', txResult.transactionHash);

      // 2. Register game with backend for payout tracking
      let backendGameId = txResult.gameId;
      try {
        console.log('📝 Registering game with backend...');
        const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001'}/api/solo/games/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            txHash: txResult.transactionHash,
            playerAddress: onechain.walletAddress,
            difficulty: difficulty.id
          })
        });
        const registerResult = await response.json();
        if (registerResult.success && registerResult.game) {
          backendGameId = registerResult.game.game_id;
          console.log('✅ Game registered with backend, ID:', backendGameId);
        } else {
          console.warn('⚠️ Backend registration failed:', registerResult.error);
        }
      } catch (err) {
        console.warn('⚠️ Backend registration failed:', err.message);
      }

      // 3. Store solo game data with transaction info
      const gameData = {
        difficulty: difficulty.id,
        stake: difficulty.stake,
        target: difficulty.target,
        speed: parseFloat(difficulty.speed),
        txHash: txResult.transactionHash,
        gameId: backendGameId,
        isDevelopmentMode: txResult.isDevelopmentMode
      };

      setSoloGameData(gameData);
      setShowSoloMode(false);

      // 4. Start the game with 60-second timer for solo stakes
      startGame('classic', { timeLimit: 60 });

      // 5. Track game start with blockchain session
      if (onechain.isConnected) {
        onechain.startGameSession();
      }

      console.log('🎮 Solo game started successfully!');
    } catch (error) {
      console.error('❌ Failed to start solo game:', error);
      alert(`Failed to start game: ${error.message}`);
    }
  };

  if (showMultiplayer) {
    return (
      <div className="App">
        <BladeCursor />

        <MultiplayerLobby
          walletAddress={onechain.walletAddress}
          onechain={onechain}
          onStartGame={handleStartMultiplayerGame}
          onBack={handleBackToLanding}
        />
        <SpeedInsights />
        <Analytics />
      </div>
    );
  }

  if (showSoloMode) {
    return (
      <div className="App">
        <BladeCursor />

        <SoloModeSelect
          onSelectDifficulty={handleSoloDifficultySelect}
          onBack={() => { setShowSoloMode(false); setShowModeSelection(true); }}
          onechain={onechain}
          octBalance={onechain.octBalance || 0}
        />
        <SpeedInsights />
        <Analytics />
      </div>
    );
  }

  if (showModeSelection) {
    return (
      <div className="App">
        <BladeCursor />

        <ModeSelection
          onSelectMode={handleModeSelect}
          onBack={handleBackToLanding}
          onSoloStakes={handleShowSoloMode}
          bestScores={{
            classic: gameState.bestScoreClassic,
            arcade: gameState.bestScoreArcade,
            zen: gameState.bestScoreZen
          }}
        />
        <SpeedInsights />
        <Analytics />
      </div>
    );
  }

  if (showLanding) {
    return (
      <div className="App">
        <BladeCursor />

        <LandingPage
          onStartGame={handleStartFromLanding}
          onMultiplayer={handleShowMultiplayer}
          onechain={onechain}
        />
        <SpeedInsights />
        <Analytics />
      </div>
    );
  }

  return (
    <div className="App">
      <BladeCursor />
      {renderScreen()}
      <ParticleContainer particles={particles} />
      <SpeedInsights />
      <Analytics />
    </div>
  );
}

export default App;