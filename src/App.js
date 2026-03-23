import React, { useState, useCallback, useEffect } from 'react';
import StartScreen from './components/StartScreen';
import GameScreen from './components/GameScreen';
import ResultsScreen from './components/ResultsScreen';
import ParticleContainer from './components/ParticleContainer';
import LandingPage from './components/LandingPage';
import ModeSelection from './components/ModeSelection';
import SoloModeSelect from './components/SoloModeSelect';
import BladeCursor from './components/BladeCursor';
import FruitNinjaLeaderboard from './components/FruitNinjaLeaderboard';
import { useGameState } from './hooks/useGameState';
import { useTaskbarControls } from './hooks/useTaskbarControls';
import { useOneChain } from './hooks/useOneChain';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import './App.css';
import { SpeedInsights } from "@vercel/speed-insights/react"
import { Analytics } from "@vercel/analytics/react"
import MultiplayerLobby from './components/MultiplayerLobby';
import multiplayerService from './services/multiplayerService';

export const BUILD_VERSION = '2026-03-23-v4-zklogin';
export const BUILD_FEATURES = ['address-copy-button', 'telegram-nickname-display', 'lobby-ui-refine', 'hide-copy-for-tg-users', 'sdk-displayname-fallback', 'zklogin-sui-address'];

function AppInner() {
  const auth = useAuth();
  const onechain = auth.onechain;

  const effectiveWalletAddress = auth.walletAddress || onechain?.walletAddress;

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
    decrementTimer,
    setSoloGameContext
  } = useGameState(effectiveWalletAddress);
  const [particles, setParticles] = useState([]);
  const [showLanding, setShowLanding] = useState(true);
  const [showMultiplayer, setShowMultiplayer] = useState(false);
  const [showModeSelection, setShowModeSelection] = useState(false);
  const [showSoloMode, setShowSoloMode] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [soloGameData, setSoloGameData] = useState(null);
  const [multiplayerGameId, setMultiplayerGameId] = useState(null);

  useEffect(() => {
    if (soloGameData && soloGameData.gameId && onechain?.walletAddress) {
      setSoloGameContext({
        gameId: soloGameData.gameId,
        walletAddress: onechain.walletAddress,
        signature: onechain.walletSignature,
        message: onechain.walletAuthMessage
      });
    } else {
      setSoloGameContext(null);
    }
  }, [soloGameData, onechain?.walletAddress, onechain?.walletSignature, onechain?.walletAuthMessage, setSoloGameContext]);

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
            onSoloReplay={handleSoloReplay}
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
    if (onechain?.isConnected) {
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
    // Clear any stale multiplayer game ID to prevent solo games from calling multiplayer APIs
    multiplayerService.clearCurrentGame();
  };

  const handleShowMultiplayer = () => {
    console.log('[TG-AUTH] handleShowMultiplayer called:', {
      'auth.isTelegram': auth.isTelegram,
      'auth.isConnected': auth.isConnected,
      'auth.isAuthenticating': auth.isAuthenticating,
      'auth.authProvider': auth.authProvider,
      'auth.walletAddress': auth.walletAddress,
      'auth.error': auth.error || 'none',
      'onechain?.isConnected': onechain?.isConnected,
    });

    if (auth.isTelegram) {
      if (!auth.isConnected) {
        if (auth.error) {
          console.log('[TG-AUTH] handleShowMultiplayer: previous login error, retrying...');
          auth.telegram?.login();
          alert('Login failed, retrying... Please try again in a moment.');
        } else {
          alert('Telegram login in progress, please wait...');
        }
        return;
      }
    } else if (!onechain?.isConnected) {
      alert('Please connect your OneWallet to play multiplayer games!');
      return;
    }
    setShowLanding(false);
    setShowMultiplayer(true);
  };

  const handleShowLeaderboard = () => {
    setShowLeaderboard(true);
  };

  const handleCloseLeaderboard = () => {
    setShowLeaderboard(false);
  };

  const handleStartMultiplayerGame = (gameId) => {
    setMultiplayerGameId(gameId);
    setShowMultiplayer(false);
    startGame();
  };

  const handleBackToMultiplayerLobby = () => {
    showStartScreen();
    setShowMultiplayer(true);
    setMultiplayerGameId(null);
    // Clear current game when returning to lobby
    multiplayerService.clearCurrentGame();
  };

  // Solo Mode Handlers (requires wallet -- not available in Telegram)
  const handleShowSoloMode = () => {
    if (auth.isTelegram) {
      alert('Staked solo games require a wallet and are not available in Telegram yet.');
      return;
    }
    if (!onechain?.isConnected) {
      alert('Please connect your OneWallet to play staked solo games!');
      return;
    }
    setShowModeSelection(false);
    setShowSoloMode(true);
  };

  // Handler for replaying solo stakes - navigates back to tier selection
  const handleSoloReplay = () => {
    // Clear the previous game data so a fresh game can be started
    setSoloGameData(null);
    // Go back to solo mode selection to pick a tier and stake again
    showStartScreen(); // Reset game state
    setShowSoloMode(true);
  };

  const handleSoloDifficultySelect = async (difficulty) => {
    console.log('Starting solo game with difficulty:', difficulty);

    try {
      // 1. Create game on-chain (stake HACK)
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
          headers: {
            'Content-Type': 'application/json',
            'X-Wallet-Address': onechain.walletAddress,
            ...(onechain.walletSignature && typeof onechain.walletSignature === 'string' && { 'X-Wallet-Signature': String(onechain.walletSignature).replace(/[\r\n]+/g, ' ') }),
            ...(onechain.walletAuthMessage && typeof onechain.walletAuthMessage === 'string' && { 'X-Wallet-Message': btoa(unescape(encodeURIComponent(onechain.walletAuthMessage))) })
          },
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

      if (onechain?.isConnected) {
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
          walletAddress={effectiveWalletAddress}
          onechain={onechain}
          auth={auth}
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
          tokenBalance={onechain?.tokenBalance || 0}
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
          onSoloStakes={auth.isTelegram ? null : handleShowSoloMode}
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
          onLeaderboard={handleShowLeaderboard}
          onechain={onechain}
          auth={auth}
        />
        {showLeaderboard && (
          <FruitNinjaLeaderboard
            onClose={handleCloseLeaderboard}
            walletAddress={effectiveWalletAddress}
          />
        )}
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

function App() {
  const onechain = useOneChain();

  useEffect(() => {
    document.title = 'OneNinja ' + BUILD_VERSION;

    console.log('%c╔══════════════════════════════════════════════╗', 'color: #00ff88; font-size: 16px; font-weight: bold;');
    console.log('%c║  NINJA BUILD: ' + BUILD_VERSION.padEnd(30) + '║', 'color: #00ff88; font-size: 16px; font-weight: bold;');
    console.log('%c╚══════════════════════════════════════════════╝', 'color: #00ff88; font-size: 16px; font-weight: bold;');
    console.log('[NINJA] BUILD_FEATURES:', BUILD_FEATURES.join(', '));
    console.log('[NINJA] Startup time:', new Date().toISOString());

    const zkEnabled = process.env.REACT_APP_ZKLOGIN_ENABLED;
    const apiBase = process.env.REACT_APP_API_BASE_URL || '(default localhost:3001)';
    const rpc = process.env.REACT_APP_ONECHAIN_RPC || '(not set)';
    const network = process.env.REACT_APP_ONECHAIN_NETWORK || '(not set)';
    const proverUrl = process.env.REACT_APP_ZKLOGIN_PROVER_URL || '(not set)';

    console.log('%c[NINJA-CONFIG] zkLogin enabled: ' + (zkEnabled !== 'false' ? 'YES ✓' : 'NO ✗') + ' (REACT_APP_ZKLOGIN_ENABLED=' + (zkEnabled || 'undefined') + ')', zkEnabled !== 'false' ? 'color: #00ff88; font-weight: bold;' : 'color: #ff4444; font-weight: bold;');
    console.log('[NINJA-CONFIG] API_BASE_URL:', apiBase);
    console.log('[NINJA-CONFIG] ONECHAIN_RPC:', rpc);
    console.log('[NINJA-CONFIG] ONECHAIN_NETWORK:', network);
    console.log('[NINJA-CONFIG] ZKLOGIN_PROVER_URL:', proverUrl);
    console.log('[NINJA-CONFIG] User-Agent:', navigator.userAgent);

    console.log('[NINJA] Telegram SDK available:', !!window.Telegram?.WebApp);
    if (window.Telegram?.WebApp) {
      const wa = window.Telegram.WebApp;
      console.log('[NINJA] Telegram WebApp info:', {
        platform: wa.platform,
        version: wa.version,
        initDataLength: wa.initData?.length || 0,
        colorScheme: wa.colorScheme,
        userId: wa.initDataUnsafe?.user?.id || 'N/A',
        firstName: wa.initDataUnsafe?.user?.first_name || 'N/A',
        lastName: wa.initDataUnsafe?.user?.last_name || 'N/A',
      });
    }
  }, []);

  return (
    <AuthProvider onechain={onechain}>
      <AppInner />
    </AuthProvider>
  );
}

export default App;