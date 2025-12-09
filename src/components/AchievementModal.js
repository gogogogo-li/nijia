import React from 'react';
import { FaTrophy, FaGamepad, FaBolt, FaBomb, FaRocket, FaTimes } from 'react-icons/fa';
// import { mintAchievementNFTs, getGasCostEstimate } from '../utils/nftMinting';
import { getRarityColor, getRarityName } from '../utils/achievements';
import './AchievementModal.css';

const AchievementModal = ({ 
  isOpen, 
  onClose, 
  unlockedAchievements = [], 
  walletAddress,
  gameStats,
  onAchievementMinted 
}) => {
  const handleClose = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="achievement-modal-overlay" onClick={handleClose}>
      <div className="achievement-modal" onClick={(e) => e.stopPropagation()}>
        <div className="achievement-modal-header">
          <h2><FaTrophy className="header-icon" /> Achievements Unlocked!</h2>
          <button className="modal-close" onClick={handleClose}><FaTimes /></button>
        </div>
        
        <div className="achievement-modal-content">
          {unlockedAchievements.length > 0 ? (
            <>
              <p className="achievement-intro">
                Congratulations! You've unlocked <strong>{unlockedAchievements.length}</strong> new achievement{unlockedAchievements.length > 1 ? 's' : ''}!
                <br />
                                <span className="mint-info" style={{ color: '#EC796B' }}>
                  Will be mintable as NFT
                </span>
              </p>
              
              <div className="achievements-grid">
                {unlockedAchievements.map((achievement, index) => (
                  <div key={achievement.id} className="achievement-card" style={{
                    borderColor: getRarityColor(achievement.rarity),
                    '--rarity-color': getRarityColor(achievement.rarity)
                  }}>
                    <div className="achievement-rarity-indicator" style={{
                      background: getRarityColor(achievement.rarity)
                    }}>
                      {getRarityName(achievement.rarity)}
                    </div>
                    
                    <div className="achievement-icon">
                      <span className="achievement-emoji">{achievement.icon}</span>
                    </div>
                    
                    <div className="achievement-info">
                      <h3>{achievement.name}</h3>
                      <p>{achievement.description}</p>
                      
                      <div className="achievement-attributes">
                        {achievement.nftMetadata.attributes.map((attr, attrIndex) => (
                          <span 
                            key={attrIndex} 
                            className={`attribute ${attr.trait_type.toLowerCase().replace(' ', '-')}`}
                          >
                            {attr.value}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Game Stats Summary */}
              <div className="game-stats-summary">
                <h4><FaGamepad className="stats-icon" /> Game Performance</h4>
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="stat-label">Score</span>
                    <span className="stat-value">{gameStats.score || 0}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Max Combo</span>
                    <span className="stat-value">{gameStats.maxCombo || 0}x</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Tokens Sliced</span>
                    <span className="stat-value">{gameStats.citreaSliced || 0}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Bombs Hit</span>
                    <span className="stat-value">{gameStats.bombsHit || 0}</span>
                  </div>
                </div>
              </div>

              {/* Coming Soon Section */}
              <div className="achievement-mint-section" style={{
                background: 'rgba(255, 138, 0, 0.1)',
                border: '2px solid rgba(255, 138, 0, 0.3)',
                borderRadius: '12px',
                padding: '2rem',
                textAlign: 'center',
                marginTop: '1.5rem'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}><FaRocket /></div>
                <h3 style={{ color: '#EC796B', marginBottom: '1rem' }}>NFT Minting Coming Soon!</h3>
                <p style={{ color: '#ccc', marginBottom: '1.5rem' }}>
                  Soon you'll be able to mint your achievements as NFTs on the OneChain blockchain.
                </p>
                <div style={{
                  background: 'linear-gradient(135deg, #EC796B, #FF6B9D)',
                  color: 'white',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  display: 'inline-block',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  fontSize: '0.9rem',
                  letterSpacing: '1px'
                }}>
                  Coming Soon
                </div>
              </div>
            </>
          ) : (
            <div className="no-achievements">
              <div className="no-achievements-icon"><FaTrophy /></div>
              <h3>No New Achievements</h3>
              <p>Keep playing to unlock new achievements and mint exclusive NFTs!</p>
            </div>
          )}
        </div>
        
        <div className="achievement-modal-footer">
          <p className="citrea-info">
            Powered by <strong>OneChain</strong> - Modern blockchain infrastructure
          </p>
        </div>
      </div>
    </div>
  );
};

export default AchievementModal;