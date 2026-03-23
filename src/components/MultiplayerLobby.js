import React, { useState, useEffect } from 'react';
import multiplayerService from '../services/multiplayerService';
import onechainService from '../services/onechainService';
import { createGameTransaction, joinGameTransaction } from '../services/multiplayerContract';
import './MultiplayerLobby.css';
import { GiCrossedSwords, GiTwoCoins, GiTrophyCup, GiLightningBow, GiDiamondHard, GiGamepad, GiCrossedSabres, GiTargetArrows, GiMagnifyingGlass } from 'react-icons/gi';
import { FaChartLine, FaCopy, FaCheck } from 'react-icons/fa';
import { IoMdRefresh } from 'react-icons/io';
import LobbyChat from './LobbyChat';
import { BUILD_VERSION, BUILD_FEATURES } from '../App';

const MultiplayerLobby = ({ walletAddress, onechain, auth, onStartGame, onBack }) => {
  const [activeTab, setActiveTab] = useState('create'); // 'create', 'join', 'stats'
  const [selectedTier, setSelectedTier] = useState(null);
  const [roomType, setRoomType] = useState('public'); // 'public' or 'private'
  const [joinCode, setJoinCode] = useState(''); // Input for joining by code
  const [createdCode, setCreatedCode] = useState(null); // Join code from created private game
  const [availableGames, setAvailableGames] = useState([]);
  const [playerStats, setPlayerStats] = useState(null);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [quickMatchSearching, setQuickMatchSearching] = useState(false);

  // REQ-P2-004: Player count for 2-4 player rooms
  const [maxPlayers, setMaxPlayers] = useState(2);

  // Player nickname - persisted per wallet
  const [playerNickname, setPlayerNickname] = useState('');
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);

  const isTelegram = auth?.isTelegram;

  const telegramDisplayName = React.useMemo(() => {
    const fromAuth = auth?.user?.displayName;
    if (fromAuth && !fromAuth.startsWith('tg_')) return fromAuth;
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (tgUser) {
      const name = tgUser.username || [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ');
      if (name) return name;
    }
    return fromAuth || '';
  }, [auth?.user?.displayName]);

  const hasRealWalletAddress = walletAddress && !walletAddress.startsWith('tg_');

  console.log('[LOBBY-UI] render (build=' + BUILD_VERSION + '):', {
    walletAddress,
    hasRealWalletAddress,
    isTelegram,
    telegramDisplayName,
    authUser: auth?.user,
    playerNickname,
    features: BUILD_FEATURES,
  });

  // Load nickname from localStorage on mount
  React.useEffect(() => {
    if (walletAddress) {
      const savedNickname = localStorage.getItem(`ninja_nickname_${walletAddress}`);
      if (savedNickname) {
        setPlayerNickname(savedNickname);
      }
    }
  }, [walletAddress]);

  // Save nickname to localStorage
  const saveNickname = (nickname) => {
    const trimmed = nickname.trim().slice(0, 15); // Max 15 chars
    setPlayerNickname(trimmed);
    if (walletAddress && trimmed) {
      localStorage.setItem(`ninja_nickname_${walletAddress}`, trimmed);
    }
    setIsEditingNickname(false);
  };

  const handleCopyAddress = () => {
    console.log('[LOBBY-UI] handleCopyAddress called, walletAddress:', walletAddress);
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress).then(() => {
      console.log('[LOBBY-UI] Address copied to clipboard:', walletAddress);
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 2000);
    }).catch(err => {
      console.error('[LOBBY-UI] Clipboard copy failed:', err);
    });
  };

  const fetchPlayerStats = React.useCallback(async () => {
    if (!walletAddress) {
      setStatsLoaded(true);
      return;
    }
    try {
      const result = await multiplayerService.getPlayerStats(walletAddress);
      if (result.success) {
        setPlayerStats(result.stats);
      } else {
        // Set default stats on failure
        setPlayerStats({
          gamesPlayed: 0,
          gamesWon: 0,
          winRate: 0,
          totalWagered: 0,
          totalWinnings: 0
        });
      }
    } catch (error) {
      console.error('Failed to fetch player stats:', error);
      // Set default stats on error
      setPlayerStats({
        gamesPlayed: 0,
        gamesWon: 0,
        winRate: 0,
        totalWagered: 0,
        totalWinnings: 0
      });
    }
    setStatsLoaded(true);
  }, [walletAddress]);

  useEffect(() => {
    if (walletAddress) {
      fetchPlayerStats();
    }
    if (activeTab === 'join') {
      fetchAvailableGames();

      // Auto-refresh every 3 seconds when on join tab
      const interval = setInterval(() => {
        fetchAvailableGames();
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [walletAddress, activeTab, fetchPlayerStats]);

  // Force initial fetch on component mount
  useEffect(() => {
    fetchAvailableGames();
  }, []);

  // Listen for localStorage changes from other tabs
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'onechain_multiplayer_games') {
        fetchAvailableGames();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // WebSocket connection for real-time updates - use multiplayerService's socket
  useEffect(() => {
    if (!walletAddress) return;

    console.log('[TG-AUTH] MultiplayerLobby connecting:', {
      walletAddress,
      authProvider: auth?.authProvider,
      hasJwtToken: !!auth?.token,
      hasWalletSignature: !!onechain?.walletSignature,
    });
    multiplayerService.connect(walletAddress, onechain?.walletSignature, onechain?.walletAuthMessage, { token: auth?.token }).then(() => {
      console.log('[TG-AUTH] MultiplayerLobby: multiplayer service connected OK');
      multiplayerService.subscribeToGames();
    }).catch(err => {
      console.error('[TG-AUTH] MultiplayerLobby: connect FAILED:', err.message || err);
    });

    // Use multiplayerService's socket for event listening
    const setupListeners = () => {
      const socket = multiplayerService.getSocket();
      if (!socket) {
        console.log('⏳ Waiting for socket to be ready...');
        setTimeout(setupListeners, 500);
        return;
      }

      console.log('🎧 Setting up lobby socket listeners on multiplayerService socket');

      socket.on('game:created', (game) => {
        console.log(' New game created:', game);
        fetchAvailableGames();
      });

      socket.on('game:joined', (game) => {
        console.log('👥 Game joined event received:', {
          gameId: game.game_id,
          player1: game.player1,
          player2: game.player2,
          myWallet: walletAddress
        });

        // Check if this is YOUR game that was joined (you are player1)
        const isPlayer1 = multiplayerService.compareAddresses(game.player1, walletAddress);
        console.log('🔍 Am I player1?', isPlayer1, '- Comparison:', game.player1, 'vs', walletAddress);

        if (walletAddress && isPlayer1) {
          console.log('🎮 I am player1! Starting game in 2 seconds...');
          showNotification('Opponent joined! Starting match...', 'success');
          setTimeout(() => {
            onStartGame(game.game_id);
          }, 2000);
        } else {
          console.log('📝 Not player1, refreshing available games');
          fetchAvailableGames();
        }
      });

      socket.on('games:updated', (games) => {
        console.log('Games list updated:', games);
        setAvailableGames(games);
      });

      socket.on('game:finished', (data) => {
        console.log('Game finished:', data);
        fetchAvailableGames();
      });

      socket.on('game:completed', (game) => {
        console.log('✅ Game completed:', game);
        console.log(`   Winner: ${game.winner || 'DRAW'}`);
        console.log(`   Player1 Score: ${game.player1_score}`);
        console.log(`   Player2 Score: ${game.player2_score}`);
        fetchAvailableGames();
      });
    };

    setupListeners();

    return () => {
      const socket = multiplayerService.getSocket();
      if (socket) {
        socket.off('game:created');
        socket.off('game:joined');
        socket.off('games:updated');
        socket.off('game:finished');
        socket.off('game:completed');
      }

      // Disconnect multiplayer service
      multiplayerService.disconnect();
    };
  }, [walletAddress, onStartGame, onechain?.walletSignature, onechain?.walletAuthMessage]);

  const fetchAvailableGames = async () => {
    const games = await multiplayerService.getAvailableGames();
    setAvailableGames(games);
  };

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleCreateGame = async () => {
    if (!selectedTier) {
      showNotification('Please select a bet tier', 'error');
      return;
    }

    if (!onechain || !onechain.isConnected) {
      showNotification('Please connect your wallet first', 'error');
      return;
    }

    setLoading(true);

    try {
      // Step 1: Check balance
      showNotification(`Creating game with ${selectedTier.amount} DIAMOND stake...`, 'info');
      console.log(`🎮 Creating game with bet tier ${selectedTier.id}`);

      const balanceResult = await onechainService.getBalance();
      const balance = parseFloat(balanceResult.amount);

      if (balance < selectedTier.amount) {
        throw new Error(`Insufficient balance. Need ${selectedTier.amount} DIAMOND, have ${balance.toFixed(2)} DIAMOND`);
      }

      // Step 2: Create contract transaction
      // Fetch DIAMOND coins to pay the bet (do NOT use tx.gas)
      const coinObjects = await onechainService.getCoinObjects();
      let selectedCoinId = null;
      if (coinObjects.length > 0) {
        // Use largest coin
        const bestCoin = coinObjects.sort((a, b) => Number(b.balance) - Number(a.balance))[0];
        selectedCoinId = bestCoin.objectId;
      }

      const tx = createGameTransaction({
        betTierId: selectedTier.id,
        coinObjectId: selectedCoinId
      });

      // Step 3: Execute transaction on blockchain
      const txResult = await onechainService.executeTransaction(tx);

      if (!txResult.success) {
        throw new Error('Failed to create game on blockchain');
      }

      console.log('✅ Game created on blockchain, tx:', txResult.transactionHash);

      showNotification('Registering game with backend...', 'info');

      // Step 4: Register game with backend (with room type)
      const result = await multiplayerService.createGame(selectedTier.id, txResult.transactionHash, roomType);

      if (result.success) {
        // If private room, show the join code
        if (result.game?.join_code) {
          setCreatedCode(result.game.join_code);
          showNotification(`Private room created! Share code: ${result.game.join_code}`, 'success');
        } else {
          showNotification(`Game created! Waiting for opponent...`, 'success');
          setTimeout(async () => {
            await fetchAvailableGames();
            setActiveTab('join');
          }, 1000);
        }
        await fetchPlayerStats();
      } else {
        showNotification(`Failed to create game: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('Error creating game:', error);
      showNotification(`Error: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGame = async (gameId) => {
    if (!onechain || !onechain.isConnected) {
      showNotification('Please connect your wallet first', 'error');
      return;
    }

    try {
      setLoading(true);

      // Find the game to get bet amount
      const game = availableGames.find(g => g.game_id === gameId);
      if (!game) {
        throw new Error('Game not found');
      }

      const betAmountToken = parseFloat(game.bet_amount) / 1000000000; // Convert from MIST to DIAMOND (9 decimals)
      const betTierId = game.bet_tier; // Database stores 1-indexed tier directly

      showNotification(`Joining game with ${betAmountToken} DIAMOND stake...`, 'info');
      console.log(`🎮 Joining game ${gameId} with bet tier ${betTierId} (${betAmountToken} DIAMOND)`);

      // Check balance
      const balanceResult = await onechainService.getBalance();
      const balance = parseFloat(balanceResult.amount);

      if (balance < betAmountToken) {
        throw new Error(`Insufficient balance. Need ${betAmountToken} DIAMOND, have ${balance.toFixed(2)} DIAMOND`);
      }

      // Get coin object ID (do NOT use tx.gas)
      const coinObjects = await onechainService.getCoinObjects();
      let selectedCoinId = null;
      if (coinObjects.length > 0) {
        const bestCoin = coinObjects.sort((a, b) => Number(b.balance) - Number(a.balance))[0];
        selectedCoinId = bestCoin.objectId;
      }

      // Create contract transaction
      const tx = joinGameTransaction({
        gameId: game.game_id,
        betTierId: betTierId,
        coinObjectId: selectedCoinId
      });

      // Execute transaction on blockchain
      const txResult = await onechainService.executeTransaction(tx);

      if (!txResult.success) {
        throw new Error('Failed to join game on blockchain');
      }

      console.log('✅ Joined game on blockchain, tx:', txResult.transactionHash);

      showNotification('Registering join with backend...', 'info');

      // Register join with backend
      const result = await multiplayerService.joinGame(gameId, txResult.transactionHash);

      if (result.success) {
        showNotification('Joined game! Starting match...', 'success');
        setTimeout(() => {
          onStartGame(gameId);
        }, 2000);
      } else {
        showNotification(`Failed to join game: ${result.error}`, 'error');
      }
    } catch (error) {
      // Show user-friendly error message
      const errorMsg = error.message || 'Failed to join game';
      showNotification(errorMsg, 'error');
      console.error('Join game error:', error);
    } finally {
      setLoading(false);
    }
  };

  const betTiers = multiplayerService.getBetTiers();

  return (
    <div className="multiplayer-lobby">
      {/* Animated Background */}
      <div className="lobby-bg-animation">
        <div className="floating-icon icon-1"><GiCrossedSwords /></div>
        <div className="floating-icon icon-2"><GiTwoCoins /></div>
        <div className="floating-icon icon-3"><GiTrophyCup /></div>
        <div className="floating-icon icon-4"><GiLightningBow /></div>
        <div className="floating-icon icon-5"><GiDiamondHard /></div>
        <div className="floating-icon icon-6"><GiGamepad /></div>
      </div>

      {notification && (
        <div className={`lobby-notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div className="lobby-header">
        <button className="lobby-back-btn" onClick={onBack}>
          <span className="back-arrow">←</span>
          <span className="back-text">BACK</span>
        </button>
        {hasRealWalletAddress && (
          <div className="address-copy-badge" onClick={handleCopyAddress} title="Copy wallet address">
            <span className="address-text">{multiplayerService.formatAddress(walletAddress)}</span>
            <span className="copy-icon">{addressCopied ? <FaCheck /> : <FaCopy />}</span>
          </div>
        )}
        <div className="wallet-badge">
          {isTelegram && telegramDisplayName
            ? telegramDisplayName
            : multiplayerService.formatAddress(walletAddress)}
        </div>
      </div>

      {/* Main Title with Slash Effect */}
      <div className="lobby-title-container">
        <h1 className="lobby-main-title">
          <span className="title-text"><GiCrossedSwords /> MULTIPLAYER ARENA</span>
          <div className="title-slash"></div>
        </h1>
        <p className="lobby-subtitle">COMPETE FOR REAL STAKES</p>
      </div>

      {/* Player Nickname Section */}
      <div className="player-nickname-section">
        {isEditingNickname ? (
          <div className="nickname-edit-container">
            <input
              type="text"
              className="nickname-input"
              placeholder="Enter nickname..."
              defaultValue={playerNickname}
              maxLength={15}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  saveNickname(e.target.value);
                } else if (e.key === 'Escape') {
                  setIsEditingNickname(false);
                }
              }}
              onBlur={(e) => saveNickname(e.target.value)}
            />
            <span className="nickname-hint">Max 15 chars • Press Enter to save</span>
          </div>
        ) : (
          <div className="nickname-display" onClick={() => setIsEditingNickname(true)}>
            <span className="nickname-label">Playing as:</span>
            <span className="nickname-value">
              {playerNickname || telegramDisplayName || multiplayerService.formatAddress(walletAddress)}
            </span>
            <button className="nickname-edit-btn" title="Edit nickname">✏️</button>
          </div>
        )}
      </div>

      <div className="lobby-content-wrapper">
        {/* Tabs */}
        <div className="lobby-tabs">
          <button
            className={`lobby-tab ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => setActiveTab('create')}
          >
            <span className="tab-icon"><GiCrossedSabres /></span>
            <span className="tab-text">Create</span>
          </button>
          <button
            className={`lobby-tab ${activeTab === 'join' ? 'active' : ''}`}
            onClick={() => setActiveTab('join')}
          >
            <span className="tab-icon"><GiTargetArrows /></span>
            <span className="tab-text">Join</span>
          </button>
          <button
            className={`lobby-tab ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveTab('stats')}
          >
            <span className="tab-icon"><GiTrophyCup /></span>
            <span className="tab-text">Stats</span>
          </button>
          <button
            className={`lobby-tab quickmatch-tab ${activeTab === 'quickmatch' ? 'active' : ''}`}
            onClick={() => setActiveTab('quickmatch')}
          >
            <span className="tab-icon"><GiMagnifyingGlass /></span>
            <span className="tab-text">Quick Match</span>
          </button>
        </div>

        <div className="lobby-content">
          {activeTab === 'create' && (
            <div className="create-game-section">
              <h2 className="section-title">Choose Your Stake</h2>
              <p className="section-description">Winner takes all! Select your bet tier to create a new game.</p>

              <div className="bet-tiers-grid">
                {betTiers.map((tier, index) => (
                  <div
                    key={tier.id}
                    className={`bet-tier-card ${selectedTier?.id === tier.id ? 'selected' : ''}`}
                    onClick={() => setSelectedTier(tier)}
                    style={{
                      animationDelay: `${index * 0.1}s`,
                      borderColor: selectedTier?.id === tier.id ? tier.borderColor : 'rgba(255, 255, 255, 0.1)',
                      boxShadow: selectedTier?.id === tier.id ? `0 0 40px ${tier.glowColor}` : 'none'
                    }}
                  >
                    <div
                      className="tier-glow"
                      style={{
                        background: `linear-gradient(135deg, ${tier.borderColor} 0%, ${tier.color} 100%)`,
                        opacity: selectedTier?.id === tier.id ? 0.5 : 0
                      }}
                    ></div>
                    <div className="tier-content">
                      <div className="tier-icon"><GiTwoCoins /></div>
                      <div className="tier-label" style={{ color: tier.borderColor }}>{tier.label}</div>
                      <div className="tier-token-name" style={{ color: tier.color, fontSize: '14px', marginTop: '4px' }}>
                        {tier.tokenName} ({tier.token})
                      </div>
                      <div className="tier-amount">{tier.amount} {tier.token}</div>
                      <div className="tier-prize"><GiTrophyCup /> Win: {tier.amount * 2} {tier.token}</div>
                      <div className="tier-description">{tier.description}</div>
                    </div>
                    <div
                      className="tier-slash"
                      style={{
                        background: `linear-gradient(90deg, transparent, ${tier.glowColor}, transparent)`
                      }}
                    ></div>
                  </div>
                ))}
              </div>

              {/* Room Type Toggle */}
              <div className="room-type-section">
                <h3 className="room-type-title">Room Type</h3>
                <div className="room-type-toggle">
                  <button
                    className={`room-type-btn ${roomType === 'public' ? 'active' : ''}`}
                    onClick={() => setRoomType('public')}
                  >
                    🌐 Public Room
                  </button>
                  <button
                    className={`room-type-btn ${roomType === 'private' ? 'active' : ''}`}
                    onClick={() => setRoomType('private')}
                  >
                    🔒 Private Room
                  </button>
                </div>
                <p className="room-type-hint">
                  {roomType === 'public'
                    ? 'Anyone can join from the lobby'
                    : 'Share a 6-char code with your friend'}
                </p>
              </div>

              {/* REQ-P2-004: Player Count Selector */}
              <div className="player-count-section">
                <h3 className="room-type-title">👥 Number of Players</h3>
                <div className="player-count-toggle">
                  {[2, 3, 4].map(count => (
                    <button
                      key={count}
                      className={`player-count-btn ${maxPlayers === count ? 'active' : ''}`}
                      onClick={() => setMaxPlayers(count)}
                    >
                      <span className="count-number">{count}</span>
                      <span className="count-label">{count === 2 ? 'Duel' : count === 3 ? 'Triple' : 'Squad'}</span>
                    </button>
                  ))}
                </div>
                <p className="room-type-hint">
                  {maxPlayers === 2 ? 'Winner takes all!' :
                    maxPlayers === 3 ? '1st: 70%, 2nd: 30%' :
                      '1st: 50%, 2nd: 30%, 3rd: 20%'}
                </p>
              </div>

              {/* Created Join Code Display */}
              {createdCode && (
                <div className="created-code-section">
                  <h3>🔑 Share This Code</h3>
                  <div className="join-code-display">
                    <span className="join-code">{createdCode}</span>
                    <button
                      className="copy-code-btn"
                      onClick={() => {
                        navigator.clipboard.writeText(createdCode);
                        showNotification('Code copied!', 'success');
                      }}
                    >
                      📋 Copy
                    </button>
                  </div>
                  <p className="code-hint">Waiting for opponent to join...</p>
                </div>
              )}

              <button
                className="create-game-btn"
                onClick={handleCreateGame}
                disabled={!selectedTier || loading}
                style={selectedTier ? {
                  background: `linear-gradient(135deg, ${selectedTier.borderColor} 0%, ${selectedTier.color} 100%)`,
                  boxShadow: `0 8px 32px ${selectedTier.glowColor}`
                } : {}}
              >
                {loading ? (
                  <>
                    <span className="btn-spinner"></span>
                    Creating Game...
                  </>
                ) : (
                  <>

                    Create {roomType === 'private' ? 'Private' : 'Public'} Game - Stake {selectedTier?.amount || '?'} DIAMOND
                  </>
                )}
              </button>
            </div>
          )}

          {activeTab === 'join' && (
            <div className="join-game-section">
              {/* Join by Code Section */}
              <div className="join-by-code-section">
                <h3>🔑 Join Private Room</h3>
                <div className="join-code-input-wrapper">
                  <input
                    type="text"
                    className="join-code-input"
                    placeholder="Enter 6-char code"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                    maxLength={6}
                  />
                  <button
                    className="join-by-code-btn"
                    disabled={joinCode.length !== 6 || loading}
                    onClick={async () => {
                      if (joinCode.length !== 6) return;
                      setLoading(true);
                      try {
                        // Fetch coins for payment
                        const coinObjects = await onechainService.getCoinObjects();
                        let selectedCoinId = null;
                        if (coinObjects.length > 0) {
                          const bestCoin = coinObjects.sort((a, b) => Number(b.balance) - Number(a.balance))[0];
                          selectedCoinId = bestCoin.objectId;
                        }

                        // First create transaction with default tier
                        const tx = createGameTransaction({
                          betTierId: 1,
                          coinObjectId: selectedCoinId
                        });
                        const txResult = await onechainService.executeTransaction(tx);
                        if (!txResult.success) throw new Error('Transaction failed');

                        const result = await multiplayerService.joinByCode(joinCode, txResult.transactionHash);
                        if (result.success) {
                          showNotification('Joined private room!', 'success');
                          if (typeof onStartGame === 'function') {
                            // Pass game_id, not the whole game object (matching public room behavior)
                            onStartGame(result.game.game_id);
                          }
                        }
                      } catch (error) {
                        showNotification(`Error: ${error.message}`, 'error');
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    Join
                  </button>
                </div>
              </div>

              <div className="section-divider">
                <span>OR</span>
              </div>

              <h2 className="section-title">Available Games</h2>
              <p className="section-description">Join an open game and compete for the prize pool!</p>

              <button
                className="refresh-btn"
                onClick={() => fetchAvailableGames()}
                disabled={loading}
              >
                <span className="refresh-icon"><IoMdRefresh /></span>
                Refresh Games
              </button>

              <div className="available-games">
                {availableGames.length === 0 ? (
                  <div className="no-games-state">
                    <div className="no-games-icon"><GiGamepad /></div>
                    <p className="no-games-text">No games available</p>
                    <p className="no-games-hint">Create your own game to get started!</p>
                  </div>
                ) : (
                  <div className="games-list">
                    {availableGames.map((game, index) => {
                      const betAmountMist = parseInt(game.bet_amount);
                      const tier = betTiers.find(t => Math.floor(t.amount * 1_000_000_000) === betAmountMist);

                      const isOwnGame = multiplayerService.compareAddresses(game.player1, walletAddress);
                      const isDisabled = loading || isOwnGame;

                      return (
                        <div
                          key={index}
                          className="game-card"
                          style={{
                            borderColor: tier?.borderColor || 'rgba(255, 255, 255, 0.1)',
                            boxShadow: tier ? `0 4px 20px ${tier.glowColor}` : 'none'
                          }}
                        >
                          <div
                            className="card-glow-effect"
                            style={{
                              background: tier ? `linear-gradient(135deg, ${tier.borderColor} 0%, ${tier.color} 100%)` : 'none'
                            }}
                          ></div>
                          <div className="game-card-content">
                            <div className="game-header">
                              <span
                                className="tier-badge"
                                style={{
                                  background: tier?.borderColor || '#FFD700',
                                  color: '#000',
                                  fontWeight: 'bold'
                                }}
                              >
                                {tier?.label || 'Unknown'}
                              </span>
                              <span className="game-status">🟢 Open</span>
                            </div>
                            <div className="game-info">
                              <div className="info-row">
                                <span className="info-icon"><GiTwoCoins /></span>
                                <span className="info-label">Stake:</span>
                                <span className="info-value" style={{ color: tier?.color || '#fff' }}>
                                  {tier?.amount || (betAmountMist / 1_000_000_000)} {tier?.token || 'DIAMOND'}
                                </span>
                              </div>
                              <div className="info-row prize">
                                <span className="info-icon"><GiTrophyCup /></span>
                                <span className="info-label">Prize:</span>
                                <span className="info-value gold" style={{ color: tier?.borderColor || '#FFD700' }}>
                                  {(tier?.amount || (betAmountMist / 1_000_000_000)) * 2} {tier?.token || 'DIAMOND'}
                                </span>
                              </div>
                              <div className="info-row">
                                <span className="info-icon"><GiGamepad /></span>
                                <span className="info-label">Host:</span>
                                <span className="info-value host">{multiplayerService.formatAddress(game.player1)}</span>
                              </div>
                            </div>
                          </div>
                          <button
                            className="join-game-btn"
                            onClick={() => handleJoinGame(game.game_id)}
                            disabled={isDisabled}
                            style={tier && !isDisabled ? {
                              background: `linear-gradient(135deg, ${tier.borderColor} 0%, ${tier.color} 100%)`,
                              boxShadow: `0 4px 16px ${tier.glowColor}`
                            } : {}}
                          >
                            {isOwnGame ? (
                              <>
                                <span className="btn-icon"><GiGamepad /></span>
                                Your Game
                              </>
                            ) : (
                              <>
                                <span className="btn-icon"><GiCrossedSwords /></span>
                                Join Battle
                                <span className="btn-arrow">→</span>
                              </>
                            )}
                          </button>
                          <div className="card-slash-effect"></div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="stats-section">
              <h2 className="section-title">Your Statistics</h2>

              {playerStats ? (
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-glow"></div>
                    <div className="stat-content">
                      <div className="stat-icon"><GiGamepad /></div>
                      <div className="stat-value">{playerStats.gamesPlayed}</div>
                      <div className="stat-label">Games Played</div>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-glow"></div>
                    <div className="stat-content">
                      <div className="stat-icon"><GiTrophyCup /></div>
                      <div className="stat-value">{playerStats.gamesWon}</div>
                      <div className="stat-label">Games Won</div>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-glow"></div>
                    <div className="stat-content">
                      <div className="stat-icon"><GiTargetArrows /></div>
                      <div className="stat-value">{playerStats?.winRate || 0}%</div>
                      <div className="stat-label">Win Rate</div>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-glow"></div>
                    <div className="stat-content">
                      <div className="stat-icon"><GiTwoCoins /></div>
                      <div className="stat-value">{playerStats?.totalWagered?.toFixed(2) || '0.00'}</div>
                      <div className="stat-label">Total Wagered</div>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-glow"></div>
                    <div className="stat-content">
                      <div className="stat-icon"><GiDiamondHard /></div>
                      <div className="stat-value">{playerStats?.totalWinnings?.toFixed(2) || '0.00'}</div>
                      <div className="stat-label">Total Winnings</div>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-glow"></div>
                    <div className="stat-content">
                      <div className="stat-icon"><FaChartLine /></div>
                      <div className="stat-value">
                        {(playerStats.totalWinnings - playerStats.totalWagered).toFixed(2)}
                      </div>
                      <div className="stat-label">Net Profit</div>
                    </div>
                  </div>
                </div>
              ) : !statsLoaded ? (
                <div className="loading-stats">
                  <div className="loading-spinner"></div>
                  <p>Loading stats...</p>
                </div>
              ) : (
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-glow"></div>
                    <div className="stat-content">
                      <div className="stat-icon"><GiGamepad /></div>
                      <div className="stat-value">0</div>
                      <div className="stat-label">Games Played</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'quickmatch' && (
            <div className="quickmatch-section">
              {!quickMatchSearching ? (
                <>
                  <h2 className="section-title"><GiMagnifyingGlass /> Quick Match</h2>
                  <p className="section-description">
                    Find an opponent automatically! Select your stake and we'll match you with another player.
                  </p>

                  <div className="bet-tiers-grid">
                    {betTiers.map((tier, index) => (
                      <div
                        key={tier.id}
                        className={`bet-tier-card ${selectedTier?.id === tier.id ? 'selected' : ''}`}
                        onClick={() => setSelectedTier(tier)}
                        style={{
                          animationDelay: `${index * 0.1}s`,
                          borderColor: selectedTier?.id === tier.id ? tier.borderColor : 'rgba(255, 255, 255, 0.1)',
                          boxShadow: selectedTier?.id === tier.id ? `0 0 40px ${tier.glowColor}` : 'none'
                        }}
                      >
                        <div
                          className="tier-glow"
                          style={{
                            background: `linear-gradient(135deg, ${tier.borderColor} 0%, ${tier.color} 100%)`,
                            opacity: selectedTier?.id === tier.id ? 0.5 : 0
                          }}
                        ></div>
                        <div className="tier-content">
                          <div className="tier-icon"><GiTwoCoins /></div>
                          <div className="tier-label" style={{ color: tier.borderColor }}>{tier.label}</div>
                          <div className="tier-amount">{tier.amount} DIAMOND</div>
                          <div className="tier-prize"><GiTrophyCup /> Win: {tier.amount * 2} DIAMOND</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    className="quickmatch-btn"
                    onClick={async () => {
                      if (!selectedTier) {
                        showNotification('Please select a stake tier', 'error');
                        return;
                      }
                      if (!onechain || !onechain.isConnected) {
                        showNotification('Please connect your wallet first', 'error');
                        return;
                      }

                      setLoading(true);
                      try {
                        // Check balance
                        const balanceResult = await onechainService.getBalance();
                        const balance = parseFloat(balanceResult.amount);
                        if (balance < selectedTier.amount) {
                          throw new Error(`Insufficient balance. Need ${selectedTier.amount} DIAMOND`);
                        }

                        showNotification('Creating transaction...', 'info');

                        // Fetch DIAMOND coins to pay the bet (do NOT use tx.gas which is OCT)
                        const coinObjects = await onechainService.getCoinObjects();
                        let selectedCoinId = null;
                        if (coinObjects.length > 0) {
                          const bestCoin = coinObjects.sort((a, b) => Number(b.balance) - Number(a.balance))[0];
                          selectedCoinId = bestCoin.objectId;
                        }

                        // Create transaction
                        const tx = createGameTransaction({
                          betTierId: selectedTier.id,
                          coinObjectId: selectedCoinId
                        });

                        const txResult = await onechainService.executeTransaction(tx);
                        if (!txResult.success) {
                          throw new Error('Transaction failed');
                        }

                        showNotification('Searching for opponent...', 'info');
                        setQuickMatchSearching(true);

                        // Setup socket listeners for match events
                        multiplayerService.setupQuickMatchListeners({
                          onMatched: (data) => {
                            showNotification('Match found! Starting game...', 'success');
                            setQuickMatchSearching(false);
                            setTimeout(() => {
                              onStartGame(data.game_id);
                            }, 1500);
                          },
                          onExpired: () => {
                            showNotification('Matchmaking timed out. Please try again.', 'error');
                            setQuickMatchSearching(false);
                          }
                        });

                        // Join matchmaking queue
                        const result = await multiplayerService.joinQuickMatch(
                          selectedTier.id,
                          txResult.transactionHash
                        );

                        if (result.status === 'matched') {
                          // Matched immediately
                          showNotification('Match found! Starting game...', 'success');
                          setQuickMatchSearching(false);
                          setTimeout(() => {
                            onStartGame(result.game.game_id);
                          }, 1500);
                        }
                      } catch (error) {
                        showNotification(`Error: ${error.message}`, 'error');
                        setQuickMatchSearching(false);
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={!selectedTier || loading}
                    style={selectedTier ? {
                      background: `linear-gradient(135deg, ${selectedTier.borderColor} 0%, ${selectedTier.color} 100%)`,
                      boxShadow: `0 8px 32px ${selectedTier.glowColor}`
                    } : {}}
                  >
                    {loading ? (
                      <>
                        <span className="btn-spinner"></span>
                        Processing...
                      </>
                    ) : (
                      <>
                        <GiMagnifyingGlass /> Find Match - {selectedTier?.amount || '?'} DIAMOND
                      </>
                    )}
                  </button>
                </>
              ) : (
                <div className="quickmatch-searching">
                  <div className="searching-animation">
                    <div className="searching-ring"></div>
                    <div className="searching-ring ring-2"></div>
                    <div className="searching-ring ring-3"></div>
                    <GiMagnifyingGlass className="searching-icon" />
                  </div>
                  <h2 className="searching-title">Searching for Opponent...</h2>
                  <p className="searching-subtitle">Looking for a player in the {selectedTier?.label} tier</p>
                  <p className="searching-stake"><GiTwoCoins /> Stake: {selectedTier?.amount} DIAMOND</p>

                  <button
                    className="cancel-search-btn"
                    onClick={async () => {
                      try {
                        await multiplayerService.leaveQuickMatch();
                        showNotification('Search cancelled', 'info');
                      } catch (error) {
                        console.error('Error cancelling search:', error);
                      }
                      setQuickMatchSearching(false);
                    }}
                  >
                    Cancel Search
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lobby Chat */}
      <LobbyChat walletAddress={walletAddress} playerNickname={playerNickname} />
    </div>
  );
};

export default MultiplayerLobby;
