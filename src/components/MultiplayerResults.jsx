import React, { useState, useEffect } from 'react';
import multiplayerService from '../services/multiplayerService';
import onechainService from '../services/onechainService';
import { explorerTxUrl } from '../utils/explorer';
import './MultiplayerResults.css';
import {
    GiTrophyCup,
    GiTwoCoins,
    GiCrossedSwords,
    GiTargetArrows,
    GiGamepad,
    GiDiamondHard,
    GiCheckMark,
    GiCancel
} from 'react-icons/gi';
import { FaChartLine } from 'react-icons/fa';

const MultiplayerResults = ({ game, walletAddress, onPlayAgain, onMainMenu }) => {
    const [playerStats, setPlayerStats] = useState(null);
    const [showConfetti, setShowConfetti] = useState(false);
    const [nftMintStatus, setNftMintStatus] = useState(null); // null, 'minting', 'success', 'error'
    const [mintedNftTx, setMintedNftTx] = useState(null);

    // Determine if we won
    const isPlayer1 = multiplayerService.compareAddresses(game.player1, walletAddress);
    const playerAddress = isPlayer1 ? game.player1 : game.player2;
    const opponentAddress = isPlayer1 ? game.player2 : game.player1;
    const isWinner = multiplayerService.compareAddresses(game.winner, walletAddress);
    const isDraw = !game.winner;

    const playerScore = isPlayer1 ? game.player1_score : game.player2_score;
    const opponentScore = isPlayer1 ? game.player2_score : game.player1_score;

    // Calculate payout details
    const betAmount = parseFloat(game.bet_amount_token || game.bet_amount / 1_000_000_000);
    const totalPot = betAmount * 2;

    let payout = 0;
    let platformFee = 0;
    let feePercentage = 0;

    if (isWinner) {
        const isForfeit = game.end_reason === 'forfeit' || game.end_reason === 'disconnect';

        if (isForfeit) {
            // Forfeit: 80%/20% split
            payout = betAmount * 1.6; // 80% of pot
            platformFee = betAmount * 0.4; // 20% of pot
            feePercentage = 20;
        } else {
            // Normal win: 98%/2% split
            payout = totalPot * 0.98;
            platformFee = totalPot * 0.02;
            feePercentage = 2;
        }
    } else if (isDraw) {
        // Draw: Return stakes
        payout = betAmount;
        platformFee = 0;
        feePercentage = 0;
    }

    // Load player stats
    useEffect(() => {
        const fetchStats = async () => {
            const stats = await multiplayerService.getPlayerStats(walletAddress);
            setPlayerStats(stats);
        };

        fetchStats();
    }, [walletAddress]);

    // Show confetti animation for winners
    useEffect(() => {
        if (isWinner) {
            setShowConfetti(true);
            setTimeout(() => setShowConfetti(false), 5000);
        }
    }, [isWinner]);

    return (
        <div className="multiplayer-results">
            {/* Animated Background */}
            <div className="results-bg-animation">
                {showConfetti && (
                    <div className="confetti-container">
                        {[...Array(50)].map((_, i) => (
                            <div
                                key={i}
                                className="confetti"
                                style={{
                                    left: `${Math.random() * 100}%`,
                                    animationDelay: `${Math.random() * 2}s`,
                                    backgroundColor: ['#ffd700', '#ff6b6b', '#467DFF', '#00ff88'][Math.floor(Math.random() * 4)]
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>

            <div className="results-content">
                {/* Result Header */}
                <div className={`result-header ${isWinner ? 'victory' : isDraw ? 'draw' : 'defeat'}`}>
                    {isWinner ? (
                        <>
                            <GiTrophyCup className="result-icon" />
                            <h1 className="result-title">VICTORY!</h1>
                            <p className="result-subtitle">You dominated the arena!</p>
                        </>
                    ) : isDraw ? (
                        <>
                            <GiCrossedSwords className="result-icon" />
                            <h1 className="result-title">DRAW</h1>
                            <p className="result-subtitle">An evenly matched battle!</p>
                        </>
                    ) : (
                        <>
                            <GiCancel className="result-icon" />
                            <h1 className="result-title">DEFEAT</h1>
                            <p className="result-subtitle">Better luck next time!</p>
                        </>
                    )}
                </div>

                {/* Score Comparison */}
                <div className="score-comparison">
                    <div className={`score-card ${isWinner && !isDraw ? 'winner' : ''}`}>
                        <div className="score-label">YOUR SCORE</div>
                        <div className="score-value">{playerScore || 0}</div>
                        {isWinner && !isDraw && <GiCheckMark className="winner-badge" />}
                    </div>

                    <div className="vs-separator">VS</div>

                    <div className={`score-card ${!isWinner && !isDraw ? 'winner' : ''}`}>
                        <div className="score-label">OPPONENT</div>
                        <div className="score-value">{opponentScore || 0}</div>
                        {!isWinner && !isDraw && <GiCheckMark className="winner-badge" />}
                    </div>
                </div>

                {/* Payout Details */}
                <div className="payout-section">
                    <h2 className="section-title">
                        <GiTwoCoins /> PAYOUT BREAKDOWN
                    </h2>

                    <div className="payout-details">
                        <div className="payout-row">
                            <span className="payout-label">Total Pot:</span>
                            <span className="payout-value">{totalPot.toFixed(2)} DIAMOND</span>
                        </div>

                        <div className="payout-row">
                            <span className="payout-label">Platform Fee ({feePercentage}%):</span>
                            <span className="payout-value fee">-{platformFee.toFixed(4)} DIAMOND</span>
                        </div>

                        <div className="payout-divider"></div>

                        <div className="payout-row total">
                            <span className="payout-label">Your Payout:</span>
                            <span className={`payout-value ${isWinner ? 'win' : ''}`}>
                                {isWinner ? '+' : ''}{payout.toFixed(4)} DIAMOND
                            </span>
                        </div>

                        {game.end_reason && (
                            <div className="payout-note">
                                {game.end_reason === 'forfeit' || game.end_reason === 'disconnect'
                                    ? '⚡ Forfeit victory - 80% payout'
                                    : '🏆 Full victory - 98% payout'}
                            </div>
                        )}

                        {game.transaction_hash && (
                            <a
                                href={explorerTxUrl(game.transaction_hash)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="view-tx-btn"
                            >
                                View Settlement Transaction →
                            </a>
                        )}
                    </div>
                </div>

                {/* Winner NFT Section - Only for winners */}
                {isWinner && (
                    <div className="nft-section">
                        <h2 className="section-title">
                            🏆 VICTORY NFT
                        </h2>

                        {nftMintStatus === 'success' ? (
                            <div className="nft-success">
                                <div className="nft-success-icon">🎉</div>
                                <p className="nft-success-text">Victory NFT Minted!</p>
                                {mintedNftTx && (
                                    <a
                                        href={explorerTxUrl(mintedNftTx)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="view-tx-btn"
                                    >
                                        View NFT Transaction →
                                    </a>
                                )}
                            </div>
                        ) : (
                            <div className="nft-mint-area">
                                <p className="nft-description">
                                    Commemorate your victory with a unique NFT!
                                    This NFT will be minted directly to your wallet.
                                </p>
                                <button
                                    className={`mint-nft-btn ${nftMintStatus === 'minting' ? 'minting' : ''}`}
                                    onClick={async () => {
                                        setNftMintStatus('minting');
                                        try {
                                            const result = await onechainService.mintGameNFT({
                                                isWinnerNFT: true,
                                                score: playerScore || 0,
                                                opponentScore: opponentScore || 0,
                                                prizeAmount: payout.toFixed(4),
                                                prizeAmountMist: Math.floor(payout * 1_000_000_000),
                                                tierName: 'Winner',
                                                tierIcon: '🏆',
                                                gameId: game.game_id,
                                            });

                                            if (result.success) {
                                                setNftMintStatus('success');
                                                setMintedNftTx(result.transactionHash);
                                            } else {
                                                throw new Error(result.error);
                                            }
                                        } catch (error) {
                                            console.error('NFT mint error:', error);
                                            setNftMintStatus('error');
                                            setTimeout(() => setNftMintStatus(null), 3000);
                                        }
                                    }}
                                    disabled={nftMintStatus === 'minting'}
                                >
                                    {nftMintStatus === 'minting' ? (
                                        <>
                                            <span className="spinner"></span>
                                            Minting...
                                        </>
                                    ) : nftMintStatus === 'error' ? (
                                        '❌ Failed - Try Again'
                                    ) : (
                                        '🎨 Mint Victory NFT'
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Updated Stats */}
                {playerStats && (
                    <div className="stats-section">
                        <h2 className="section-title">
                            <FaChartLine /> YOUR STATS
                        </h2>

                        <div className="stats-grid">
                            <div className="stat-item">
                                <GiGamepad className="stat-icon" />
                                <div className="stat-value">{playerStats.gamesPlayed || 0}</div>
                                <div className="stat-label">Games Played</div>
                            </div>

                            <div className="stat-item">
                                <GiTrophyCup className="stat-icon" />
                                <div className="stat-value">{playerStats.gamesWon || 0}</div>
                                <div className="stat-label">Wins</div>
                            </div>

                            <div className="stat-item">
                                <GiTargetArrows className="stat-icon" />
                                <div className="stat-value">{playerStats.winRate || 0}%</div>
                                <div className="stat-label">Win Rate</div>
                            </div>

                            <div className="stat-item">
                                <GiDiamondHard className="stat-icon" />
                                <div className="stat-value">
                                    {(playerStats.totalWinnings || 0).toFixed(2)}
                                </div>
                                <div className="stat-label">Total Winnings</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="results-actions">
                    <button className="action-btn play-again" onClick={onPlayAgain}>
                        <GiCrossedSwords /> Play Again
                    </button>
                    <button className="action-btn main-menu" onClick={onMainMenu}>
                        Main Menu
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MultiplayerResults;
