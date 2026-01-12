import React, { useState, useEffect } from 'react';
import multiplayerService from '../services/multiplayerService';
import TierDisplay from './TierDisplay';
import { canMintNFTAtTier, getTierByScore } from '../utils/tierSystem';
import { getWalletData, setWalletData } from '../utils/walletStorage';
import '../styles/unified-design.css';
import './ResultsScreen.css';
import { GiTrophyCup, GiCrossedSwords } from 'react-icons/gi';

const ResultsScreen = ({ gameState, onStartGame, onShowStartScreen, onechain, multiplayerGameId, onBackToMultiplayer, soloGameData }) => {
  const isNewBest = gameState.score > gameState.bestScore;
  const [mintingStatus, setMintingStatus] = useState(null); // null, 'minting', 'success', 'error'
  const [transactionHash, setTransactionHash] = useState(null);
  const [multiplayerSubmitted, setMultiplayerSubmitted] = useState(false);

  // Solo game payout state
  const [soloPayoutStatus, setSoloPayoutStatus] = useState(null); // null, 'processing', 'success', 'failed'
  const [soloPayoutTxHash, setSoloPayoutTxHash] = useState(null);
  const [soloPayoutError, setSoloPayoutError] = useState(null);
  const [soloGameCompleted, setSoloGameCompleted] = useState(false);

  // Minted NFTs state - initialize empty, load when wallet is ready
  const [mintedNFTs, setMintedNFTs] = useState([]);

  // Reload minted NFTs when wallet address changes
  useEffect(() => {
    if (onechain?.walletAddress) {
      const storedNFTs = getWalletData(onechain.walletAddress, 'mintedNFTs', []);
      console.log('📦 Loading minted NFTs for wallet:', onechain.walletAddress, storedNFTs);
      setMintedNFTs(storedNFTs);
    } else {
      setMintedNFTs([]);
    }
  }, [onechain?.walletAddress]);

  // Scroll to top when screen loads or minting status changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [mintingStatus]);

  // Check tier and NFT eligibility
  const nftEligibility = canMintNFTAtTier(gameState.totalScore, gameState.gamesPlayed, mintedNFTs);
  const currentTier = getTierByScore(gameState.totalScore);
  const canMintNFT = nftEligibility.canMint && onechain && onechain.isConnected;

  // Debug logging for NFT eligibility
  console.log('🎯 NFT Eligibility Check:', {
    totalScore: gameState.totalScore,
    gamesPlayed: gameState.gamesPlayed,
    currentTier: currentTier.name,
    tierCanMintNFT: currentTier.canMintNFT,
    nftEligibility,
    canMintNFT,
    walletConnected: onechain?.isConnected,
    mintedNFTs
  });

  // Check if this is welcome NFT
  const isWelcomeNFT = nftEligibility.isWelcomeNFT;

  // Submit multiplayer score when game ends
  useEffect(() => {
    const submitMultiplayerScore = async () => {
      if (multiplayerGameId && onechain.isConnected && !multiplayerSubmitted) {
        setMultiplayerSubmitted(true);
        console.log('🎮 Submitting multiplayer score:', gameState.score);

        try {
          const result = await multiplayerService.submitScore(gameState.score);

          if (result.success) {
            console.log('✅ Multiplayer score submitted successfully:', result);
          } else {
            console.error('❌ Failed to submit multiplayer score:', result.error);
          }
        } catch (error) {
          console.error('❌ Error submitting multiplayer score:', error);
        }
      }
    };

    submitMultiplayerScore();
  }, [multiplayerGameId, gameState.score, onechain.isConnected, multiplayerSubmitted]);

  // Complete solo game and trigger payout when game ends
  useEffect(() => {
    const completeSoloGame = async () => {
      if (soloGameData && soloGameData.gameId && onechain?.walletAddress && !soloGameCompleted) {
        setSoloGameCompleted(true);
        setSoloPayoutStatus('processing');
        console.log('🎮 Completing solo game:', soloGameData.gameId, 'Score:', gameState.score);

        try {
          const response = await fetch(`${process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001'}/api/solo/games/${soloGameData.gameId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              playerAddress: onechain.walletAddress,
              finalScore: gameState.score
            })
          });

          const result = await response.json();

          if (result.success && result.game) {
            console.log('✅ Solo game completed:', result.game);

            if (result.game.won && result.game.settlement_tx) {
              setSoloPayoutStatus('success');
              setSoloPayoutTxHash(result.game.settlement_tx);
              console.log('💰 Payout sent! TX:', result.game.settlement_tx);
            } else if (result.game.won && !result.game.settlement_tx) {
              // Won but no payout transaction (maybe admin wallet issue)
              setSoloPayoutStatus('failed');
              setSoloPayoutError('Payout not processed - contact support');
            } else {
              // Player lost, no payout expected
              setSoloPayoutStatus(null);
            }
          } else {
            console.error('❌ Failed to complete solo game:', result.error);
            setSoloPayoutStatus('failed');
            setSoloPayoutError(result.error || 'Failed to process game');
          }
        } catch (error) {
          console.error('❌ Error completing solo game:', error);
          setSoloPayoutStatus('failed');
          setSoloPayoutError(error.message);
        }
      }
    };

    completeSoloGame();
  }, [soloGameData, gameState.score, onechain?.walletAddress, soloGameCompleted]);

  return (
    <div className="unified-screen results-screen">
      <div className="unified-container results-container">
        {/* Solo Game Win/Lose Banner */}
        {soloGameData && (
          <div className="solo-result-banner" style={{
            padding: '24px 20px',
            marginTop: '10px',
            marginBottom: '20px',
            borderRadius: '16px',
            background: gameState.score >= soloGameData.target
              ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(16, 185, 129, 0.2))'
              : 'linear-gradient(135deg, rgba(139, 69, 69, 0.6), rgba(100, 40, 40, 0.5))',
            border: `2px solid ${gameState.score >= soloGameData.target ? '#22c55e' : '#b45454'}`,
            textAlign: 'center',
            width: '100%',
            maxWidth: '500px',
            boxSizing: 'border-box',
            boxShadow: gameState.score >= soloGameData.target
              ? '0 4px 20px rgba(34, 197, 94, 0.3)'
              : '0 4px 20px rgba(139, 69, 69, 0.4)'
          }}>
            <div style={{
              fontSize: '2.5rem',
              marginBottom: '8px',
              color: gameState.score >= soloGameData.target ? '#4ade80' : '#f87171'
            }}>
              {gameState.score >= soloGameData.target ? <GiTrophyCup /> : <GiCrossedSwords />}
            </div>
            <h2 style={{
              fontSize: '1.8rem',
              fontWeight: 900,
              color: gameState.score >= soloGameData.target ? '#4ade80' : '#f87171',
              margin: '0 0 12px 0',
              textTransform: 'uppercase',
              letterSpacing: '3px'
            }}>
              {gameState.score >= soloGameData.target ? 'YOU WIN!' : 'YOU LOSE'}
            </h2>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '24px',
              marginTop: '12px',
              flexWrap: 'wrap'
            }}>
              <div style={{ textAlign: 'center', minWidth: '70px' }}>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginBottom: '4px' }}>YOUR SCORE</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>{gameState.score}</div>
              </div>
              <div style={{ textAlign: 'center', minWidth: '70px' }}>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginBottom: '4px' }}>TARGET</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fbbf24' }}>{soloGameData.target}</div>
              </div>
              <div style={{ textAlign: 'center', minWidth: '70px' }}>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginBottom: '4px' }}>
                  {gameState.score >= soloGameData.target ? 'PAYOUT' : 'STAKE LOST'}
                </div>
                <div style={{
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  color: gameState.score >= soloGameData.target ? '#4ade80' : '#f87171'
                }}>
                  {gameState.score >= soloGameData.target
                    ? `+${(soloGameData.stake * 2 * 0.98).toFixed(2)} OCT`
                    : `-${soloGameData.stake} OCT`
                  }
                </div>
              </div>
            </div>

            {/* Payout Status */}
            {soloPayoutStatus && (
              <div style={{
                marginTop: '16px',
                padding: '12px 16px',
                borderRadius: '8px',
                background: soloPayoutStatus === 'success' ? 'rgba(34, 197, 94, 0.15)' :
                  soloPayoutStatus === 'processing' ? 'rgba(251, 191, 36, 0.15)' :
                    'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${soloPayoutStatus === 'success' ? 'rgba(34, 197, 94, 0.4)' :
                  soloPayoutStatus === 'processing' ? 'rgba(251, 191, 36, 0.4)' :
                    'rgba(239, 68, 68, 0.4)'
                  }`,
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                {soloPayoutStatus === 'processing' && (
                  <>
                    <span style={{ fontSize: '16px' }}>⏳</span>
                    <span style={{ color: '#fbbf24', fontSize: '0.9rem' }}>Processing payout...</span>
                  </>
                )}
                {soloPayoutStatus === 'success' && (
                  <>
                    <span style={{ fontSize: '16px' }}>✅</span>
                    <div style={{ flex: 1 }}>
                      <span style={{ color: '#4ade80', fontSize: '0.9rem' }}>Payout sent! </span>
                      <a
                        href={`https://onescan.cc/testnet/transactionBlocksDetail?digest=${soloPayoutTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#60a5fa', fontSize: '0.85rem', textDecoration: 'underline' }}
                      >
                        View Transaction
                      </a>
                    </div>
                  </>
                )}
                {soloPayoutStatus === 'failed' && (
                  <>
                    <span style={{ fontSize: '16px' }}>❌</span>
                    <span style={{ color: '#f87171', fontSize: '0.9rem' }}>{soloPayoutError || 'Payout failed'}</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Simple Game Over Title */}
        <div className="game-over-title">
          <h1 className="unified-title">
            {isNewBest && <><GiTrophyCup /> </>}Game Over{isNewBest && <> <GiTrophyCup /></>}
          </h1>
          {isNewBest && <div className="unified-badge gold new-best-badge">New Best!</div>}
        </div>

        {/* Score Section */}
        <div className="score-section">
          <div className="final-score">
            <span className="score-label">Score</span>
            <span className="score-value">{gameState.score}</span>
          </div>
        </div>

        {/* Stats Row */}
        <div className="unified-grid stats-row">
          <div className="unified-card stat">
            <span className="stat-value">{gameState.citreaSlashed || 0}</span>
            <span className="stat-label">Tokens Slashed</span>
          </div>
          <div className="unified-card stat">
            <span className="stat-value">{gameState.maxCombo || 0}</span>
            <span className="stat-label">Max Combo</span>
          </div>
          <div className="unified-card stat">
            <span className="stat-value">{gameState.bestScore || 0}</span>
            <span className="stat-label">Best Score</span>
          </div>
        </div>

        {/* Tier Progress Display */}
        <div className="tier-section">
          <TierDisplay
            totalScore={gameState.totalScore}
            gamesPlayed={gameState.gamesPlayed}
            bestScore={gameState.bestScore}
          />
        </div>

        {/* NFT Status Indicator - Show status for all tiers */}
        {!canMintNFT && onechain?.isConnected && (
          <div className="nft-status-section" style={{
            padding: '12px 16px',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '8px',
            marginBottom: '16px',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>🔒</span>
              <div>
                <div style={{ fontWeight: 600, color: '#fff' }}>NFT Status: {currentTier.name} Tier</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                  {nftEligibility.reason || (
                    currentTier.canMintNFT
                      ? `Need ${nftEligibility.gamesNeeded || 0} more games to mint`
                      : `NFTs not available at ${currentTier.name} tier. Next NFT: Silver (300+ total score)`
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* NFT Minting Section - Only shown if eligible at current tier */}
        {canMintNFT && (
          <div className="nft-minting-section">
            {mintingStatus === 'success' ? (
              <div className="unified-card mint-success">
                <div className="success-header">
                  <div className="success-icon">🎉</div>
                  <h3 className="success-title">
                    {isWelcomeNFT ? 'Welcome to OneNinja!' : 'NFT Minted Successfully!'}
                  </h3>
                  <p className="success-subtitle">
                    {isWelcomeNFT
                      ? 'Your journey begins with this commemorative NFT!'
                      : 'Your achievement is now on OneChain blockchain'}
                  </p>
                </div>

                <div className="nft-links">
                  {transactionHash && (
                    <a
                      href={`https://onescan.cc/testnet/tx/${transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="unified-button unified-button-secondary nft-link"
                    >
                      <span className="link-text">View Transaction</span>
                      <span className="link-arrow">→</span>
                    </a>
                  )}

                  <a
                    href={`https://onescan.cc/testnet/account?address=${onechain.walletAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="unified-button unified-button-secondary nft-link"
                  >
                    <span className="link-text">View Your NFTs</span>
                    <span className="link-arrow">→</span>
                  </a>
                </div>

                <div className="nft-details">
                  <div className="nft-detail-row">
                    <span className="detail-label">NFT Type:</span>
                    <code className="detail-value">
                      {isWelcomeNFT ? '🌱 Welcome Badge' : `${currentTier.icon} ${currentTier.name} Tier`}
                    </code>
                  </div>

                  {transactionHash && (
                    <div className="nft-detail-row">
                      <span className="detail-label">Transaction:</span>
                      <code className="detail-value">{transactionHash.substring(0, 20)}...</code>
                    </div>
                  )}
                </div>

                <div className="nft-note">
                  <span className="note-icon">ℹ️</span>
                  <span className="note-text">
                    {isWelcomeNFT
                      ? 'This is your first NFT! Keep playing to unlock more exclusive rewards.'
                      : `Your ${nftEligibility.nftReward} is confirmed!`}
                  </span>
                  {transactionHash && transactionHash.startsWith('0x') && (
                    <p className="note-text" style={{ marginTop: '8px', fontSize: '12px', opacity: 0.8 }}>
                      ⚠️ Note: NFT contract is in development. Transaction hash is simulated for testing.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <>
                {isWelcomeNFT && (
                  <div className="welcome-nft-banner">
                    <div className="welcome-icon">🎊</div>
                    <h3>Congratulations on Your First Game!</h3>
                    <p>Claim your free Welcome NFT to commemorate your ninja journey!</p>
                  </div>
                )}

                <div className="nft-reward-info">
                  <h4 style={{ color: currentTier.color }}>
                    {currentTier.icon} {nftEligibility.nftReward}
                  </h4>
                  <p>
                    {isWelcomeNFT
                      ? nftEligibility.nftDescription
                      : `Unlock this exclusive NFT from ${currentTier.name} tier!`}
                  </p>
                </div>
                <button
                  className="unified-button mint-nft"
                  style={{ background: isWelcomeNFT ? 'linear-gradient(135deg, #4CAF50, #8BC34A)' : currentTier.gradient }}
                  onClick={async () => {
                    setMintingStatus('minting');
                    try {
                      const duration = gameState.gameEndTime ?
                        Math.floor((gameState.gameEndTime - gameState.gameStartTime) / 1000) : 0;

                      const result = await onechain.mintGameNFT({
                        score: gameState.score,
                        maxCombo: gameState.maxCombo || 0,
                        tokensSliced: gameState.citreaSlashed || 0,
                        bombsHit: gameState.bombsHit || 0,
                        duration: duration,
                        tierName: currentTier.name,
                        tierIcon: currentTier.icon,
                        totalScore: gameState.totalScore,
                        nftType: nftEligibility.nftType || 'achievement',
                        isWelcomeNFT: isWelcomeNFT
                      });

                      console.log('🎨 NFT Mint Result:', result);
                      console.log('   - Success:', result.success);
                      console.log('   - Transaction Hash:', result.transactionHash);
                      console.log('   - Explorer URL:', result.explorerUrl);
                      console.log('   - Is Simulated:', result.transactionHash?.startsWith('0xDEV') || result._isDevelopmentMode);

                      if (result.success && result.transactionHash) {
                        setTransactionHash(result.transactionHash);

                        // Store minted NFT to prevent re-minting
                        const newMintedNFTs = [
                          ...mintedNFTs,
                          isWelcomeNFT ? 'welcome' : currentTier.id
                        ];
                        console.log('💾 Saving minted NFTs:', newMintedNFTs);
                        setMintedNFTs(newMintedNFTs);
                        if (onechain?.walletAddress) {
                          setWalletData(onechain.walletAddress, 'mintedNFTs', newMintedNFTs);
                          console.log('💾 Saved to wallet storage for:', onechain.walletAddress);
                        }
                      } else if (!result.success) {
                        console.error('❌ NFT Mint failed:', result.error);
                      }

                      setMintingStatus('success');
                    } catch (error) {
                      console.error('Failed to mint NFT:', error);
                      setMintingStatus('error');
                      setTimeout(() => setMintingStatus(null), 3000);
                    }
                  }}
                  disabled={mintingStatus === 'minting'}
                >
                  {mintingStatus === 'minting' ? (
                    <>
                      <span className="unified-spinner"></span>
                      Minting NFT...
                    </>
                  ) : mintingStatus === 'error' ? (
                    '❌ Mint Failed - Try Again'
                  ) : isWelcomeNFT ? (
                    `🎁 Claim Free Welcome NFT`
                  ) : (
                    `🎨 Mint ${currentTier.name} NFT`
                  )}
                </button>
              </>
            )}
          </div>
        )}

        {/* Show why NFT minting is not available */}
        {!canMintNFT && onechain && onechain.isConnected && (
          <div className="unified-empty nft-locked-message">
            <div className="unified-empty-icon">🔒</div>
            <p>{nftEligibility.reason}</p>
            {nftEligibility.gamesNeeded && (
              <p className="games-needed">Play {nftEligibility.gamesNeeded} more games to unlock NFT minting!</p>
            )}
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="button-row">
          {multiplayerGameId ? (
            <>
              <button
                className="unified-button unified-button-secondary back-multiplayer"
                onClick={onBackToMultiplayer}
              >
                <GiCrossedSwords /> Back to Arena
              </button>
              <button
                className="unified-button back-home"
                onClick={onShowStartScreen}
              >
                Home
              </button>
            </>
          ) : (
            <>
              <button
                className="unified-button play-again"
                onClick={onStartGame}
              >
                Replay
              </button>
              <button
                className="unified-button unified-button-secondary back-home"
                onClick={onShowStartScreen}
              >
                Home
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResultsScreen;