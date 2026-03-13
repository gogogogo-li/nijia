import React, { useState, useEffect } from 'react';
import { FaWallet, FaTrophy, FaCoins, FaSignOutAlt, FaCheckCircle, FaUser, FaSync, FaCopy, FaArrowLeft } from 'react-icons/fa';
import { getWalletData } from '../utils/walletStorage';
import { getTierByScore, TIERS } from '../utils/tierSystem';
import { explorerAccountUrl } from '../utils/explorer';
import './OneWallet.css';

// Helper functions
const formatAddress = (address) => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const formatBalance = (balance) => {
  console.log('💰 formatBalance called with:', balance, 'type:', typeof balance);
  if (!balance) return '0.0000';
  // Balance is already formatted from service (DIAMOND with 9 decimals: 1 DIAMOND = 1,000,000,000 MIST)
  if (typeof balance === 'object' && balance.amount) {
    console.log('   Using balance.amount:', balance.amount);
    return balance.amount;
  }
  // Fallback for raw numbers
  const balanceNum = typeof balance === 'string' ? parseFloat(balance) : balance;
  console.log('   Using balanceNum:', balanceNum);
  return balanceNum.toFixed(4);
};

const OneWallet = ({ onechain }) => {
  const [showStats, setShowStats] = useState(false);
  const [isCheckingWallet, setIsCheckingWallet] = useState(true);
  const [hasOneWallet, setHasOneWallet] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [mintedNFTsList, setMintedNFTsList] = useState([]);
  const [gameStats, setGameStats] = useState({ totalScore: 0, gamesPlayed: 0, bestScore: 0 });

  // Load minted NFTs and game stats from wallet-scoped storage
  useEffect(() => {
    if (onechain?.walletAddress) {
      const storedNFTs = getWalletData(onechain.walletAddress, 'mintedNFTs', []);
      const totalScore = getWalletData(onechain.walletAddress, 'totalScore', 0);
      const gamesPlayed = getWalletData(onechain.walletAddress, 'gamesPlayed', 0);
      const bestScore = getWalletData(onechain.walletAddress, 'bestScore', 0);

      console.log('🏆 Loading achievements for wallet:', onechain.walletAddress);
      console.log('   Minted NFTs:', storedNFTs);
      console.log('   Stats:', { totalScore, gamesPlayed, bestScore });

      // Convert stored NFT IDs to display objects
      const nftDisplayList = storedNFTs.map((nftId, index) => {
        // Find tier info for this NFT
        const tier = nftId === 'welcome'
          ? TIERS[0] // Beginner/Welcome tier
          : TIERS.find(t => t.id === nftId) || { name: 'Unknown', icon: '🎮', color: '#fff' };

        return {
          id: index + 1,
          tierId: nftId,
          name: nftId === 'welcome' ? 'Welcome Ninja Badge' : `${tier.name} Ninja NFT`,
          image: tier.icon,
          rarity: tier.name,
          color: tier.color,
        };
      });

      setMintedNFTsList(nftDisplayList);
      setGameStats({ totalScore, gamesPlayed, bestScore });
    } else {
      setMintedNFTsList([]);
      setGameStats({ totalScore: 0, gamesPlayed: 0, bestScore: 0 });
    }
  }, [onechain?.walletAddress, onechain?.mintedNFT]); // Also reload when new NFT is minted

  useEffect(() => {
    const checkWallet = () => {
      console.log('OneWallet component mounted');
      console.log('🔍 Searching for OneWallet...');

      // Check ONLY for window.onechain (official OneWallet injection point)
      if (window.onechain) {
        console.log('✅ Found OneWallet (window.onechain):', window.onechain);
        console.log('  Available methods:', Object.keys(window.onechain));
      } else {
        console.log('⚠️ OneWallet not found, waiting...');
      }

      console.log('📊 onechain hook state:', {
        isConnected: onechain?.isConnected,
        address: onechain?.walletAddress,
        balance: onechain?.balance
      });
    };

    // Check immediately
    checkWallet();

    // Check again after a delay (wallet might still be injecting)
    const timer = setTimeout(checkWallet, 1000);
    return () => clearTimeout(timer);
  }, [onechain]);

  useEffect(() => {
    const checkForWallet = () => {
      // Check ONLY for window.onechain (official OneWallet injection point)
      if (window.onechain) {
        setHasOneWallet(true);
        setIsCheckingWallet(false);
      }
    };

    // Check multiple times as OneWallet takes time to inject
    checkForWallet();
    const timer1 = setTimeout(checkForWallet, 500);
    const timer2 = setTimeout(checkForWallet, 1000);
    const timer3 = setTimeout(() => {
      checkForWallet();
      setIsCheckingWallet(false);
    }, 2000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isOpen && !event.target.closest('.onechain-wallet')) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleConnect = async () => {
    if (!onechain) {
      console.error('❌ onechain hook is missing');
      return;
    }

    try {
      console.log('🔵 Connect button clicked');
      const result = await onechain.connectWallet();

      if (result.success) {
        console.log('✅ Wallet connected successfully:', result.address);
      } else {
        console.error('❌ Connection failed:', result.error);
        alert(`Connection failed: ${result.error}`);
      }
    } catch (error) {
      console.error('❌ Connection error:', error);
      alert(`Error: ${error.message}`);
    }
  };

  const handleDisconnect = () => {
    if (onechain) {
      onechain.disconnectWallet();
    }
  };

  const handleRefreshBalance = async () => {
    if (onechain && onechain.refreshBalance) {
      try {
        await onechain.refreshBalance();
        console.log('✅ Balance refreshed');
      } catch (error) {
        console.error('❌ Failed to refresh balance:', error);
      }
    }
  };

  if (isCheckingWallet) {
    return (
      <div className="onechain-wallet">
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <div className="spinner"></div>
          <p style={{ marginTop: '10px', fontSize: '14px' }}>Checking for OneWallet...</p>
        </div>
      </div>
    );
  }

  if (!hasOneWallet) {
    return (
      <div className="onechain-wallet">
        <div className="wallet-install-prompt">
          <FaWallet className="wallet-icon-large" />
          <h3>OneWallet Not Detected</h3>
          <p>Please install the OneWallet browser extension and refresh this page.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            <a
              href="https://chrome.google.com/webstore/search/onewallet"
              target="_blank"
              rel="noopener noreferrer"
              className="install-button"
            >
              Install OneWallet
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Use minted NFTs from storage, with current tier info
  const currentTier = getTierByScore(gameStats.totalScore);
  const nfts = mintedNFTsList;

  return (
    <div className="onechain-wallet">
      {/* Compact Wallet Button */}
      <button
        className={`wallet-trigger-button ${onechain.isConnected ? 'connected' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <FaWallet />
        {onechain.isConnected ? (
          <>
            <span>{formatAddress(onechain.walletAddress)}</span>
            <FaCheckCircle style={{ color: '#00FF88', fontSize: '12px' }} />
          </>
        ) : (
          <span>Connect Wallet</span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="wallet-dropdown">
          <div className="wallet-header">
            <div className="wallet-title">
              <FaWallet className="wallet-icon" />
              <span>OneWallet</span>
            </div>
          </div>

          <div className="wallet-content">
            {!onechain.isConnected ? (
              /* Disconnected State */
              <div className="wallet-disconnected">
                {onechain.error && (
                  <div className="wallet-error-message">
                    ⚠️ {onechain.error}
                  </div>
                )}
                <button
                  className="connect-button"
                  onClick={handleConnect}
                  disabled={onechain.isConnecting}
                >
                  {onechain.isConnecting ? (
                    <>
                      <span className="spinner"></span>
                      Connecting...
                    </>
                  ) : (
                    <>
                      <FaWallet /> Connect OneWallet
                    </>
                  )}
                </button>
                <p className="wallet-hint">
                  Secure connection to OneChain network
                </p>
                <p className="wallet-help">
                  New to OneChain? <a href="https://docs.onelabs.cc" target="_blank" rel="noopener noreferrer">Learn more</a>
                </p>
              </div>
            ) : (
              /* Connected State */
              <div className="wallet-connected">
                <div className="wallet-info">
                  {/* User Profile */}
                  {onechain.userProfile && (
                    <div className="user-profile">
                      <FaUser className="profile-icon" />
                      <span className="profile-name">
                        {onechain.userProfile.username || 'Ninja Player'}
                      </span>
                    </div>
                  )}

                  {/* Wallet Address */}
                  <div className="address-section">
                    <span className="address-label">Address:</span>
                    <span className="address-text" title={onechain.walletAddress}>
                      {formatAddress(onechain.walletAddress)}
                    </span>
                    <button
                      className="copy-button"
                      onClick={() => {
                        navigator.clipboard.writeText(onechain.walletAddress);
                        alert('Address copied!');
                      }}
                      title="Copy address"
                    >
                      <FaCopy />
                    </button>
                  </div>

                  {/* Balance Display */}
                  <div className="balance-section">
                    <div className="balance-item">
                      <FaCoins className="balance-icon" />
                      <div className="balance-info">
                        <span className="balance-label">Balance (DIAMOND):</span>
                        <span className="balance-value">
                          {onechain.balance ? formatBalance(onechain.balance) : '...'} DIAMOND
                        </span>
                      </div>
                      <button
                        className="refresh-button"
                        onClick={handleRefreshBalance}
                        title="Refresh balance"
                      >
                        <FaSync />
                      </button>
                    </div>
                  </div>

                  {/* Action Buttons Row */}
                  <div className="wallet-actions">
                    <button
                      className="toggle-button"
                      onClick={() => setShowStats(!showStats)}
                      title={showStats ? 'Hide Achievements' : 'Show Achievements'}
                    >
                      <FaTrophy className="trophy-icon" />
                    </button>
                    <button className="disconnect-button" onClick={() => {
                      handleDisconnect();
                      setIsOpen(false);
                    }}>
                      <FaSignOutAlt /> Disconnect
                    </button>
                  </div>
                </div>

                {showStats && (
                  <div className="stats-panel">
                    <button
                      className="stats-back-button"
                      onClick={() => setShowStats(false)}
                      title="Close"
                    >
                      <FaArrowLeft /> Back
                    </button>
                    <div className="nft-gallery">
                      <h3 className="gallery-title">
                        <FaTrophy /> Your Achievement NFTs
                      </h3>
                      {nfts.length > 0 ? (
                        <div className="nft-grid">
                          {nfts.map((nft) => (
                            <div key={nft.id} className="nft-card" style={{ borderColor: nft.color }}>
                              <div className="nft-image" style={{ background: nft.color }}>{nft.image}</div>
                              <div className="nft-details">
                                <div className="nft-name">{nft.name}</div>
                                <div className="nft-rarity" style={{ color: nft.color }}>
                                  {nft.rarity} Tier
                                </div>
                              </div>
                              <div className="nft-minted">
                                <FaCheckCircle className="check-icon" />
                                <span>Minted</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="no-nfts">
                          <p>No NFTs yet. Play games to earn achievements!</p>
                        </div>
                      )}
                      {onechain?.walletAddress && (
                        <a
                          href={explorerAccountUrl(onechain.walletAddress)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="view-on-explorer"
                          style={{ display: 'block', textAlign: 'center', marginTop: '12px', fontSize: '12px', color: '#00D9FF' }}
                        >
                          View all NFTs on OneScan →
                        </a>
                      )}
                    </div>

                    {/* Game Stats Section */}
                    <div className="blockchain-info">
                      <h4>📊 Your Stats</h4>
                      <div className="info-grid">
                        <div className="info-item">
                          <span className="info-label">Current Tier:</span>
                          <span className="info-value" style={{ color: currentTier.color }}>
                            {currentTier.icon} {currentTier.name}
                          </span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">Total Score:</span>
                          <span className="info-value">{gameStats.totalScore.toLocaleString()}</span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">Games Played:</span>
                          <span className="info-value">{gameStats.gamesPlayed}</span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">Best Score:</span>
                          <span className="info-value">{gameStats.bestScore}</span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">NFTs Minted:</span>
                          <span className="info-value">{nfts.length}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {onechain.error && (
              <div className="wallet-error-message">
                {onechain.error}
              </div>
            )}
          </div>
        </div >
      )}
    </div >
  );
};

export default OneWallet;
