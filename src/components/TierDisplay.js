import React, { useState, useEffect } from 'react';
import { 
  getTierByScore, 
  getProgressToNextTier, 
  canMintNFTAtTier,
  calculatePlayerStats 
} from '../utils/tierSystem';
import './TierDisplay.css';

const TierDisplay = ({ totalScore, gamesPlayed, bestScore, compact = false }) => {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const playerStats = calculatePlayerStats(totalScore, gamesPlayed, bestScore);
    setStats(playerStats);
  }, [totalScore, gamesPlayed, bestScore]);

  if (!stats) return null;

  const { currentTier, nextTier, progress, scoreNeeded, nftInfo } = stats;

  if (compact) {
    return (
      <div className="tier-display-compact">
        <div className="tier-icon" style={{ color: currentTier.color }}>
          {currentTier.icon}
        </div>
        <div className="tier-info">
          <div className="tier-name" style={{ color: currentTier.color }}>
            {currentTier.name}
          </div>
          <div className="tier-title">{currentTier.rewards.title}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="tier-display-full">
      <div className="tier-header">
        <div className="tier-current">
          <div 
            className="tier-icon-large" 
            style={{ 
              background: currentTier.gradient,
              boxShadow: `0 0 30px ${currentTier.color}66`
            }}
          >
            {currentTier.icon}
          </div>
          <div className="tier-details">
            <h2 style={{ color: currentTier.color }}>{currentTier.name}</h2>
            <p className="tier-title-text">{currentTier.rewards.title} {currentTier.rewards.badge}</p>
            <div className="tier-stats">
              <span>Total Score: {totalScore.toLocaleString()}</span>
              <span>•</span>
              <span>Games: {gamesPlayed}</span>
              <span>•</span>
              <span>Best: {bestScore}</span>
            </div>
          </div>
        </div>

        {nftInfo.canMint && (
          <div className="nft-available-badge">
            <span className="nft-pulse">🎁</span>
            <span>NFT Ready!</span>
          </div>
        )}
      </div>

      {nextTier && (
        <div className="tier-progress-section">
          <div className="progress-header">
            <span>Progress to {nextTier.name}</span>
            <span className="score-needed">{scoreNeeded.toLocaleString()} points needed</span>
          </div>
          
          <div className="progress-bar-container">
            <div 
              className="progress-bar-fill"
              style={{ 
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${currentTier.color}, ${nextTier.color})`
              }}
            >
              <span className="progress-percentage">{Math.floor(progress)}%</span>
            </div>
          </div>

          <div className="next-tier-preview">
            <span className="next-tier-icon">{nextTier.icon}</span>
            <span>{nextTier.name}</span>
            {nextTier.canMintNFT && <span className="nft-badge">🎁 NFT Unlock</span>}
          </div>
        </div>
      )}

      {nextTier === null && (
        <div className="max-tier-message">
          <span className="crown-icon">👑</span>
          <h3>Maximum Rank Achieved!</h3>
          <p>You are among the elite. Keep slicing to maintain your legend!</p>
        </div>
      )}
    </div>
  );
};

export default TierDisplay;
