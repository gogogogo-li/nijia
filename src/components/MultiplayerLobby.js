import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import multiplayerService from '../services/multiplayerService';
import './MultiplayerLobby.css';
import { GiCrossedSwords, GiTwoCoins, GiTrophyCup, GiLightningBow, GiDiamondHard, GiGamepad, GiCrossedSabres, GiTargetArrows } from 'react-icons/gi';
import { FaChartLine } from 'react-icons/fa';
import { IoMdRefresh } from 'react-icons/io';

// Use environment variable or fallback to localhost
const SOCKET_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';

const socket = io(SOCKET_URL, {
  autoConnect: false
});

const MultiplayerLobby = ({ walletAddress, onStartGame, onBack }) => {
  const [activeTab, setActiveTab] = useState('create'); // 'create', 'join', 'stats'
  const [selectedTier, setSelectedTier] = useState(null);
  const [availableGames, setAvailableGames] = useState([]);
  const [playerStats, setPlayerStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  const fetchPlayerStats = React.useCallback(async () => {
    if (!walletAddress) return;
    const result = await multiplayerService.getPlayerStats(walletAddress);
    if (result.success) {
      setPlayerStats(result.stats);
    }
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

  // WebSocket connection for real-time updates
  useEffect(() => {
    // Initialize multiplayer service with wallet address
    if (walletAddress) {
      console.log('🔌 Connecting multiplayer service with wallet:', walletAddress);
      multiplayerService.connect(walletAddress).catch(err => {
        console.error('Failed to connect multiplayer service:', err);
      });
    }
    
    socket.connect();

    socket.on('connect', () => {
      console.log('✅ Connected to backend');
    });

    socket.on('game_created', (game) => {
      console.log(' New game created:', game);
      fetchAvailableGames();
    });

    socket.on('game_joined', (game) => {
      console.log(' Game joined:', game);
      
      // Check if this is YOUR game that was joined (you are player1)
      if (walletAddress && multiplayerService.compareAddresses(game.player1, walletAddress)) {
        showNotification('Opponent joined! Starting match...', 'success');
        setTimeout(() => {
          onStartGame(game.game_id);
        }, 2000);
      } else {
        fetchAvailableGames();
      }
    });

    socket.on('games_updated', (games) => {
      console.log('Games list updated:', games);
      setAvailableGames(games);
    });

    socket.on('game_finished', (data) => {
      console.log('Game finished:', data);
      fetchAvailableGames();
    });

    return () => {
      socket.off('connect');
      socket.off('game_created');
      socket.off('game_joined');
      socket.off('games_updated');
      socket.off('game_finished');
      socket.disconnect();
      
      // Disconnect multiplayer service
      multiplayerService.disconnect();
    };
  }, [walletAddress, onStartGame]);

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

    setLoading(true);
    const result = await multiplayerService.createGame(selectedTier.id);
    
    if (result.success) {
      showNotification(`Game created! Waiting for opponent...`, 'success');
      await fetchPlayerStats();
      setTimeout(async () => {
        await fetchAvailableGames();
        setActiveTab('join');
      }, 1000);
    } else {
      showNotification(`Failed to create game: ${result.error}`, 'error');
    }
    setLoading(false);
  };

  const handleJoinGame = async (gameId) => {
    try {
      setLoading(true);
      const result = await multiplayerService.joinGame(gameId);
      
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
  
  // Debug: Log bet tiers to console
  console.log('🪙 Bet Tiers Data:', betTiers);

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
        <div className="wallet-badge">
          {multiplayerService.formatAddress(walletAddress)}
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
                   
                    Create Game - Stake {selectedTier?.amount || '?'} OCT
                  </>
                )}
              </button>
            </div>
          )}

          {activeTab === 'join' && (
            <div className="join-game-section">
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
                      const betAmountOctas = parseInt(game.bet_amount);
                      const tier = betTiers.find(t => t.octas === betAmountOctas);
                      
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
                                  {tier?.amount || (betAmountOctas / 100000000)} {tier?.token || 'OCT'}
                                </span>
                              </div>
                              <div className="info-row prize">
                                <span className="info-icon"><GiTrophyCup /></span>
                                <span className="info-label">Prize:</span>
                                <span className="info-value gold" style={{ color: tier?.borderColor || '#FFD700' }}>
                                  {(tier?.amount || (betAmountOctas / 100000000)) * 2} {tier?.token || 'OCT'}
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
              ) : (
                <div className="loading-stats">
                  <div className="loading-spinner"></div>
                  <p>Loading stats...</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MultiplayerLobby;
