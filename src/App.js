import React, { useState, useCallback } from 'react';
import StartScreen from './components/StartScreen';
import GameScreen from './components/GameScreen';
import ResultsScreen from './components/ResultsScreen';
import ParticleContainer from './components/ParticleContainer';
import LandingPage from './components/LandingPage';
import ModeSelection from './components/ModeSelection';
import { useGameState } from './hooks/useGameState';
import { useTaskbarControls } from './hooks/useTaskbarControls';
import { useOneChain } from './hooks/useOneChain';
import './App.css';
import { SpeedInsights } from "@vercel/speed-insights/react"
import { Analytics } from "@vercel/analytics/react"
import MultiplayerLobby from './components/MultiplayerLobby';

function App() {
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
  } = useGameState();

  // OneChain wallet and blockchain integration
  const onechain = useOneChain();
  const [particles, setParticles] = useState([]);
  const [showLanding, setShowLanding] = useState(true);
  const [showMultiplayer, setShowMultiplayer] = useState(false);
  const [showModeSelection, setShowModeSelection] = useState(false);
  const [multiplayerGameId, setMultiplayerGameId] = useState(null);

  // Add taskbar controls
  useTaskbarControls(gameState, togglePause);

  const handleCreateParticles = useCallback((x, y, color, count) => {
    const newParticles = [];
    // Create fewer, token-based particles
    const tokenEmojis =  ['⭐', '✨', '💰'];
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
    setMultiplayerGameId(null);
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

  if (showMultiplayer) {
    return (
      <div className="App">
        <div className="beta-tag">
          <span className="beta-text">BETA v0.1</span>
        </div>
        
        <MultiplayerLobby 
          walletAddress={onechain.walletAddress}
          onStartGame={handleStartMultiplayerGame}
          onBack={handleBackToLanding}
        />
        <SpeedInsights />
        <Analytics />
      </div>
    );
  }

  if (showModeSelection) {
    return (
      <div className="App">
        <div className="beta-tag">
          <span className="beta-text">BETA v0.1</span>
        </div>
        
        <ModeSelection
          onSelectMode={handleModeSelect}
          onBack={handleBackToLanding}
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
        {/* Beta Version Tag */}
        <div className="beta-tag">
          <span className="beta-text">BETA v0.1</span>
        </div>
        
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
      
      {renderScreen()}
      <ParticleContainer particles={particles} />
      <SpeedInsights />
      <Analytics />
    </div>
  );
}

export default App;