import React, { useState, useEffect } from 'react';
import multiplayerService from '../services/multiplayerService';
import TierDisplay from './TierDisplay';
import { canMintNFTAtTier, getTierByScore } from '../utils/tierSystem';
import '../styles/unified-design.css';
import './ResultsScreen.css';
import { GiTrophyCup, GiCrossedSwords } from 'react-icons/gi';

const ResultsScreen = ({ gameState, onStartGame, onShowStartScreen, onechain, multiplayerGameId, onBackToMultiplayer }) => {
  const isNewBest = gameState.score > gameState.bestScore;
  const [mintingStatus, setMintingStatus] = useState(null); // null, 'minting', 'success', 'error'
  const [transactionHash, setTransactionHash] = useState(null);
  const [multiplayerSubmitted, setMultiplayerSubmitted] = useState(false);
  
  // Check tier and NFT eligibility
  const nftEligibility = canMintNFTAtTier(gameState.totalScore, gameState.gamesPlayed);
  const currentTier = getTierByScore(gameState.totalScore);
  const canMintNFT = nftEligibility.canMint && onechain && onechain.isConnected;

  // Submit multiplayer score when game ends
  useEffect(() => {
    const submitMultiplayerScore = async () => {
      if (multiplayerGameId && onechain.isConnected && !multiplayerSubmitted) {
        setMultiplayerSubmitted(true);
        console.log('🎮 Submitting multiplayer score:', gameState.score);
        
        const result = await multiplayerService.submitScore(multiplayerGameId, gameState.score);
        
        if (result.success) {
          console.log('✅ Multiplayer score submitted successfully');
        } else {
          console.error('❌ Failed to submit multiplayer score:', result.error);
        }
      }
    };

    submitMultiplayerScore();
  }, [multiplayerGameId, gameState.score, onechain.isConnected, multiplayerSubmitted]);

  return (
    <div className="unified-screen results-screen">
      <div className="unified-container results-container">
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
        
        {/* NFT Minting Section - Only shown if eligible at current tier */}
        {canMintNFT && (
          <div className="nft-minting-section">
            {mintingStatus === 'success' ? (
              <div className="unified-card mint-success">
                <div className="success-header">
                  <div className="success-icon">🎉</div>
                  <h3 className="success-title">NFT Minted Successfully!</h3>
                  <p className="success-subtitle">Your achievement is now on OneChain blockchain</p>
                </div>
                
                <div className="nft-links">
                  {transactionHash && (
                    <a 
                      href={`https://explorer.onelabs.cc/tx/${transactionHash}?network=testnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="unified-button unified-button-secondary nft-link"
                    >
                      <span className="link-text">View Transaction</span>
                      <span className="link-arrow">→</span>
                    </a>
                  )}
                  
                  <a 
                    href={`https://explorer.onelabs.cc/account/${onechain.walletAddress}?network=testnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="unified-button unified-button-secondary nft-link"
                  >
                    <span className="link-text">View Your Account</span>
                    <span className="link-arrow">→</span>
                  </a>
                </div>

                <div className="nft-details">
                  <div className="nft-detail-row">
                    <span className="detail-label">Your Wallet:</span>
                    <code className="detail-value">{onechain.walletAddress}</code>
                  </div>
                  
                  {transactionHash && (
                    <div className="nft-detail-row">
                      <span className="detail-label">Transaction:</span>
                      <code className="detail-value">{transactionHash}</code>
                    </div>
                  )}
                </div>

                <div className="nft-note">
                  <span className="note-icon">ℹ️</span>
                  <span className="note-text">
                    Your {nftEligibility.nftReward} is confirmed on-chain. View it in your One wallet!
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="nft-reward-info">
                  <h4 style={{ color: currentTier.color }}>
                    {currentTier.icon} {nftEligibility.nftReward}
                  </h4>
                  <p>Unlock this exclusive NFT from {currentTier.name} tier!</p>
                </div>
                <button
                  className="unified-button mint-nft"
                  style={{ background: currentTier.gradient }}
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
                        totalScore: gameState.totalScore
                      });
                      
                      if (result.success && result.transactionHash) {
                        setTransactionHash(result.transactionHash);
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
                🏠 Home
              </button>
            </>
          ) : (
            <>
              <button 
                className="unified-button play-again" 
                onClick={onStartGame}
              >
                🔄 Replay
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