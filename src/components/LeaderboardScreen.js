import React, { useState, useEffect } from 'react';
import onechainService from '../services/onechainService';
import { explorerAccountUrl } from '../utils/explorer';

const LeaderboardScreen = ({ onShowStartScreen }) => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [playerRank, setPlayerRank] = useState(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [gameStats, setGameStats] = useState(null);

  useEffect(() => {
    loadLeaderboard();
    checkWalletConnection();
  }, []);

  const checkWalletConnection = async () => {
    if (onechainService.isWalletConnected()) {
      const address = onechainService.getWalletAddress();
      setWalletAddress(address);
      loadGameStats(address);
    }
  };

  const loadGameStats = async (address) => {
    try {
      const stats = await onechainService.getGameState();
      setGameStats(stats);
    } catch (err) {
      console.error('Failed to load game stats:', err);
    }
  };

  const loadLeaderboard = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const leaderboardData = await onechainService.getLeaderboard();
      setLeaderboard(leaderboardData);
      
      // Find player's rank if wallet is connected
      if (walletAddress) {
        const rank = leaderboardData.findIndex(entry => 
          entry.player.toLowerCase() === walletAddress.toLowerCase()
        );
        setPlayerRank(rank >= 0 ? rank + 1 : null);
      }
    } catch (err) {
      setError('Failed to load leaderboard');
      console.error('Leaderboard error:', err);
    }
    
    setLoading(false);
  };

  const formatAddress = (address) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  const getRankEmoji = (rank) => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${rank}`;
    }
  };

  return (
    <div className="screen leaderboard-screen" style={{
      background: 'linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '800px',
        width: '100%',
        background: 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(20px)',
        borderRadius: '20px',
        padding: '30px',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        boxShadow: '0 8px 48px rgba(0, 0, 0, 0.3)'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1 style={{
            color: '#ffd700',
            fontSize: '2.5rem',
            fontWeight: 'bold',
            textShadow: '0 0 20px rgba(255, 215, 0, 0.5)',
            marginBottom: '10px'
          }}>
            Global Leaderboard
          </h1>
          <p style={{
            color: 'rgba(255, 255, 255, 0.7)',
            fontSize: '1rem',
            margin: 0
          }}>
            Scores stored permanently on OneChain blockchain
          </p>
          {gameStats && (
            <div style={{
              marginTop: '15px',
              padding: '10px 20px',
              background: 'rgba(31, 216, 204, 0.1)',
              border: '1px solid #2ED8A7',
              borderRadius: '12px',
              display: 'inline-block'
            }}>
              <span style={{ color: '#2ED8A7', fontWeight: 'bold' }}>
                Total Games: {gameStats.totalGames} | Total Slashes: {gameStats.totalSlashes}
              </span>
            </div>
          )}
          {playerRank && (
            <div style={{
              marginTop: '15px',
              padding: '10px 20px',
              background: 'rgba(0, 212, 170, 0.1)',
              border: '1px solid #2ED8A7',
              borderRadius: '12px',
              display: 'inline-block',
              marginLeft: '10px'
            }}>
              <span style={{ color: '#2ED8A7', fontWeight: 'bold' }}>
                Your Rank: #{playerRank}
              </span>
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '4px solid rgba(255, 215, 0, 0.3)',
              borderTop: '4px solid #ffd700',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 20px'
            }} />
            <p style={{ color: '#ffffff' }}>Loading leaderboard...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div style={{
            textAlign: 'center',
            padding: '20px',
            background: 'rgba(255, 68, 68, 0.1)',
            border: '1px solid #ff4444',
            borderRadius: '12px',
            marginBottom: '20px'
          }}>
            <p style={{ color: '#ff4444', margin: 0 }}>❌ {error}</p>
            <button
              onClick={loadLeaderboard}
              style={{
                marginTop: '10px',
                padding: '8px 16px',
                background: '#ff4444',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Leaderboard Table */}
        {!loading && !error && (
          <div style={{
            overflowX: 'auto',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            {leaderboard.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '40px',
                color: 'rgba(255, 255, 255, 0.6)'
              }}>
                <p>No scores submitted yet. Be the first!</p>
              </div>
            ) : (
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                background: 'rgba(0, 0, 0, 0.2)'
              }}>
                <thead>
                  <tr style={{
                    background: 'rgba(255, 215, 0, 0.1)',
                    borderBottom: '2px solid rgba(255, 215, 0, 0.3)'
                  }}>
                    <th style={{ padding: '15px', color: '#ffd700', textAlign: 'left', fontSize: '14px', fontWeight: 'bold' }}>Rank</th>
                    <th style={{ padding: '15px', color: '#ffd700', textAlign: 'left', fontSize: '14px', fontWeight: 'bold' }}>Player</th>
                    <th style={{ padding: '15px', color: '#ffd700', textAlign: 'center', fontSize: '14px', fontWeight: 'bold' }}>Score</th>
                    <th style={{ padding: '15px', color: '#ffd700', textAlign: 'center', fontSize: '14px', fontWeight: 'bold' }}>Address</th>
                    <th style={{ padding: '15px', color: '#ffd700', textAlign: 'center', fontSize: '14px', fontWeight: 'bold' }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, index) => {
                    const isCurrentPlayer = walletAddress && 
                      entry.player.toLowerCase() === walletAddress.toLowerCase();
                    
                    return (
                      <tr
                        key={entry.player + index}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                          background: isCurrentPlayer ? 'rgba(31, 216, 204, 0.05)' : 'transparent',
                          transition: 'background-color 0.2s'
                        }}
                      >
                        <td style={{
                          padding: '15px',
                          color: '#ffffff',
                          fontWeight: 'bold',
                          fontSize: '16px'
                        }}>
                          {getRankEmoji(index + 1)}
                        </td>
                        <td style={{
                          padding: '15px',
                          color: isCurrentPlayer ? '#2ED8A7' : '#ffffff',
                          fontWeight: isCurrentPlayer ? 'bold' : 'normal'
                        }}>
                          {formatAddress(entry.player)}
                          {isCurrentPlayer && ' (You)'}
                        </td>
                        <td style={{
                          padding: '15px',
                          color: '#ffd700',
                          textAlign: 'center',
                          fontWeight: 'bold',
                          fontSize: '18px'
                        }}>
                          {entry.score.toLocaleString()}
                        </td>
                        <td style={{
                          padding: '15px',
                          color: 'rgba(255, 255, 255, 0.6)',
                          textAlign: 'center',
                          fontSize: '12px',
                          fontFamily: 'monospace'
                        }}>
                          <a
                            href={explorerAccountUrl(entry.address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: 'rgba(255, 255, 255, 0.6)',
                              textDecoration: 'none'
                            }}
                          >
                            {formatAddress(entry.address)}
                          </a>
                        </td>
                        <td style={{
                          padding: '15px',
                          color: 'rgba(255, 255, 255, 0.6)',
                          textAlign: 'center',
                          fontSize: '12px'
                        }}>
                          {formatDate(entry.timestamp)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Refresh Button */}
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button
            onClick={loadLeaderboard}
            disabled={loading}
            style={{
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #00ff88, #00cc6a)',
              color: '#000',
              border: 'none',
              borderRadius: '12px',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginRight: '10px',
              opacity: loading ? 0.6 : 1
            }}
          >
            🔄 Refresh
          </button>
          <button
            onClick={onShowStartScreen}
            style={{
              padding: '12px 24px',
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '12px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Back to Game
          </button>
        </div>
      </div>

      {/* CSS for spinner animation */}
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default LeaderboardScreen;