import React, { useState, useEffect } from 'react';
import { FaWallet, FaTrophy, FaCoins, FaSignOutAlt, FaCheckCircle, FaUser, FaSync } from 'react-icons/fa';
import './OneWallet.css';

// Helper functions
const formatAddress = (address) => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const formatBalance = (balance) => {
  if (!balance) return '0.00';
  // Convert from smallest unit to ONE tokens (assuming 8 decimals)
  const balanceNum = typeof balance === 'string' ? parseFloat(balance) : balance;
  return (balanceNum / 100000000).toFixed(4);
};

const OneWallet = ({ onechain }) => {
  const [showStats, setShowStats] = useState(false);
  const [isCheckingWallet, setIsCheckingWallet] = useState(true);
  const [hasOneWallet, setHasOneWallet] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

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

  const nfts = onechain.mintedNFT ? [{
    id: 1,
    name: onechain.mintedNFT.name || 'OneNinja Achievement',
    image: '🎮',
    rarity: onechain.mintedNFT.tier || 'Legendary',
    score: onechain.mintedNFT.score
  }] : [];

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
            {onechain.isConnected && (
              <FaCheckCircle style={{ color: '#00FF88', marginLeft: 'auto' }} title="Connected" />
            )}
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
              🔐 Secure connection to OneChain network
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
                  📋
                </button>
              </div>

              {/* Balance Display */}
              <div className="balance-section">
                <div className="balance-item">
                  <FaCoins className="balance-icon" />
                  <div className="balance-info">
                    <span className="balance-label">Balance:</span>
                    <span className="balance-value">
                      {onechain.balance ? formatBalance(onechain.balance) : '...'} ONE
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

              {/* Disconnect Button */}
              <button className="disconnect-button" onClick={() => {
                handleDisconnect();
                setIsOpen(false);
              }}>
                <FaSignOutAlt /> Disconnect
              </button>
            </div>

            <div className="stats-toggle">
              <button
                className="toggle-button"
                onClick={() => setShowStats(!showStats)}
              >
                <FaTrophy className="trophy-icon" />
                {showStats ? 'Hide' : 'Show'} Achievements
              </button>
            </div>

            {showStats && (
              <div className="stats-panel">
                <div className="nft-gallery">
                  <h3 className="gallery-title">
                    <FaTrophy /> Your Achievement NFTs
                  </h3>
                  {nfts.length > 0 ? (
                    <div className="nft-grid">
                      {nfts.map((nft) => (
                        <div key={nft.id} className="nft-card">
                          <div className="nft-image">{nft.image}</div>
                          <div className="nft-details">
                            <div className="nft-name">{nft.name}</div>
                            <div className={`nft-rarity rarity-${nft.rarity.toLowerCase()}`}>
                              ⭐ {nft.rarity}
                            </div>
                            {nft.score && (
                              <div className="nft-score">
                                Score: {nft.score}
                              </div>
                            )}
                          </div>
                          <div className="nft-minted">
                            <FaCheckCircle className="check-icon" />
                            <span>Minted on OneChain</span>
                          </div>
                          {onechain.mintedNFT?.explorerUrl && (
                            <a 
                              href={onechain.mintedNFT.explorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="view-on-explorer"
                            >
                              View on OneScan →
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="no-nfts">
                      <p>No NFTs yet. Score high to earn achievements!</p>
                    </div>
                  )}
                </div>

                {onechain.mintedNFT && (
                  <div className="blockchain-info">
                    <h4>Latest Achievement</h4>
                    <div className="info-grid">
                      <div className="info-item">
                        <span className="info-label">Tier:</span>
                        <span className="info-value">{onechain.mintedNFT.tier || 'Epic'}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Score:</span>
                        <span className="info-value">{onechain.mintedNFT.score || 0}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Network:</span>
                        <span className="info-value">OneChain</span>
                      </div>
                    </div>
                  </div>
                )}
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
        </div>
      )}
    </div>
  );
};

export default OneWallet;
