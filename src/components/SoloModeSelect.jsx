import React, { useState } from "react";
import "./SoloModeSelect.css";
import "../styles/unified-design.css";
import {
    GiNinjaHeroicStance,
    GiCherry,
    GiOrange,
    GiLemon,
    GiGrapes,
    GiBanana,
    GiPeach,
    GiPear,
    GiWatermelon,
} from "react-icons/gi";
import { FaPlay, FaArrowLeft, FaCoins, FaCrosshairs, FaInfoCircle } from "react-icons/fa";
import { IoFlash, IoSkull, IoRocketSharp, IoSparkles } from "react-icons/io5";

const SoloModeSelect = ({ onSelectDifficulty, onBack, onechain, tokenBalance }) => {
    const [selectedDifficulty, setSelectedDifficulty] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState(null);

    const difficulties = [
        {
            id: 0,
            name: "EASY",
            emoji: <IoSparkles />,
            background: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
            shadow: "0 0 40px rgba(67, 233, 123, 0.6)",
            stake: 0.5,
            stakeDisplay: "0.5 HACK",
            target: 100,
            reward: 1,
            rewardDisplay: "1 HACK",
            speed: 1.0,
            speedDisplay: "1.0x",
            description: "BEGINNER FRIENDLY",
            subtitle: "TARGET: 100 POINTS",
            particles: [<GiCherry key="p1" />, <GiOrange key="p2" />, <GiLemon key="p3" />],
        },
        {
            id: 1,
            name: "MEDIUM",
            emoji: <IoFlash />,
            background: "linear-gradient(135deg, #4158D0 0%, #C850C0 100%)",
            shadow: "0 0 40px rgba(200, 80, 192, 0.6)",
            stake: 1,
            stakeDisplay: "1 HACK",
            target: 200,
            reward: 2,
            rewardDisplay: "2 HACK",
            speed: 1.15,
            speedDisplay: "1.15x",
            description: "THE STANDARD CHALLENGE",
            subtitle: "TARGET: 200 POINTS",
            particles: [<GiGrapes key="p1" />, <GiPeach key="p2" />, <GiBanana key="p3" />],
        },
        {
            id: 2,
            name: "HARD",
            emoji: <IoSkull />,
            background: "linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)",
            shadow: "0 0 40px rgba(255, 107, 107, 0.6)",
            stake: 2,
            stakeDisplay: "2 HACK",
            target: 300,
            reward: 4,
            rewardDisplay: "4 HACK",
            speed: 1.3,
            speedDisplay: "1.3x",
            description: "FOR TRUE NINJAS",
            subtitle: "TARGET: 300 POINTS",
            particles: [<GiPear key="p1" />, <GiWatermelon key="p2" />, <GiLemon key="p3" />],
        },
        {
            id: 3,
            name: "EXTREME",
            emoji: <IoRocketSharp />,
            background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
            shadow: "0 0 40px rgba(245, 87, 108, 0.8)",
            stake: 5,
            stakeDisplay: "5 HACK",
            target: 400,
            reward: 10,
            rewardDisplay: "10 HACK",
            speed: 1.5,
            speedDisplay: "1.5x",
            description: "LEGENDARY DIFFICULTY",
            subtitle: "TARGET: 400 POINTS",
            particles: [<GiCherry key="p1" />, <GiOrange key="p2" />, <GiGrapes key="p3" />],
        },
    ];

    const handleSelectDifficulty = async (difficulty) => {
        setSelectedDifficulty(difficulty);
        setError(null);

        // Check wallet connection
        if (!onechain?.isConnected) {
            setError("Please connect your OneWallet first!");
            return;
        }

        // Check balance
        if (tokenBalance < difficulty.stake) {
            setError(`Insufficient HACK balance. You need ${difficulty.stakeDisplay}`);
            return;
        }

        setIsProcessing(true);

        try {
            // Call parent with difficulty info
            await onSelectDifficulty(difficulty);
        } catch (err) {
            console.error("Error starting solo game:", err);
            setError(err.message || "Failed to start game");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="solo-mode-selection-screen">
            {/* Animated Background */}
            <div className="solo-bg-animation">
                <div className="solo-floating-fruit fruit-1"><GiCherry /></div>
                <div className="solo-floating-fruit fruit-2"><GiOrange /></div>
                <div className="solo-floating-fruit fruit-3"><GiLemon /></div>
                <div className="solo-floating-fruit fruit-4"><GiGrapes /></div>
                <div className="solo-floating-fruit fruit-5"><GiBanana /></div>
                <div className="solo-floating-fruit fruit-6"><GiPeach /></div>
                <div className="solo-floating-fruit fruit-7"><GiPear /></div>
                <div className="solo-floating-fruit fruit-8"><GiWatermelon /></div>
            </div>

            {/* Header */}
            <div className="solo-header">
                <button className="solo-back-btn" onClick={onBack} disabled={isProcessing}>
                    <span className="back-arrow"><FaArrowLeft /></span>
                    <span className="back-text">BACK</span>
                </button>

                {/* Wallet Balance */}
                {onechain?.isConnected && (
                    <div className="solo-balance">
                        <FaCoins className="balance-icon" />
                        <span className="balance-amount">{tokenBalance?.toFixed(2) || '0.00'} HACK</span>
                    </div>
                )}
            </div>

            {/* Main Title */}
            <div className="solo-title-container">
                <div className="solo-ninja-icon"><GiNinjaHeroicStance /></div>
                <h1 className="solo-main-title">
                    <span className="title-text">STAKE & PLAY</span>
                    <div className="title-slash"></div>
                </h1>
                <p className="solo-subtitle">CHOOSE DIFFICULTY • WIN DOUBLE YOUR STAKE</p>
            </div>

            {/* Error Message */}
            {error && (
                <div className="solo-error-message">
                    <span>{error}</span>
                </div>
            )}

            {/* Difficulty Cards */}
            <div className="solo-difficulties-container">
                {difficulties.map((diff, index) => (
                    <div
                        key={diff.id}
                        className={`solo-difficulty-card ${selectedDifficulty?.id === diff.id ? 'selected' : ''} ${isProcessing ? 'disabled' : ''}`}
                        onClick={() => !isProcessing && handleSelectDifficulty(diff)}
                        style={{ animationDelay: `${index * 0.1}s` }}
                    >
                        {/* Card Glow */}
                        <div className="solo-card-glow" style={{ background: diff.background, boxShadow: diff.shadow }}></div>

                        {/* Floating Particles */}
                        <div className="solo-card-particles">
                            {diff.particles.map((particle, i) => (
                                <span key={i} className="solo-particle" style={{ animationDelay: `${i * 0.3}s` }}>
                                    {particle}
                                </span>
                            ))}
                        </div>

                        {/* Card Content */}
                        <div className="solo-card-content">
                            <div className="solo-diff-emoji-container">
                                <span className="solo-diff-emoji">{diff.emoji}</span>
                                <div className="solo-emoji-ring"></div>
                            </div>

                            <h2 className="solo-diff-title">{diff.name}</h2>
                            <p className="solo-diff-desc">{diff.description}</p>

                            {/* Stakes and Rewards */}
                            <div className="solo-stakes-info">
                                <div className="solo-stake-row">
                                    <span className="stake-label">ENTRY:</span>
                                    <span className="stake-value" style={{ color: '#ff6b6b' }}>-{diff.stakeDisplay}</span>
                                </div>
                                <div className="solo-stake-row">
                                    <span className="stake-label">WIN:</span>
                                    <span className="stake-value" style={{ color: '#4ade80' }}>+{diff.rewardDisplay}</span>
                                </div>
                                <div className="solo-stake-row">
                                    <span className="stake-label">TARGET:</span>
                                    <span className="stake-value target-score">
                                        <FaCrosshairs /> {diff.target} PTS
                                    </span>
                                </div>
                            </div>

                            <p className="solo-speed-badge" style={{ background: diff.background }}>
                                SPEED: {diff.speedDisplay}
                            </p>

                            <button
                                className="solo-play-btn"
                                style={{ background: diff.background }}
                                disabled={isProcessing}
                            >
                                {isProcessing && selectedDifficulty?.id === diff.id ? (
                                    <span className="processing-text">PROCESSING...</span>
                                ) : (
                                    <>
                                        <span className="play-text">STAKE {diff.stakeDisplay}</span>
                                        <span className="play-arrow"><FaPlay /></span>
                                    </>
                                )}
                            </button>

                            <div className="solo-card-slash"></div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Info Banner */}
            <div className="solo-info-banner">
                <FaInfoCircle className="info-icon" />
                <span className="info-text">
                    Reach the target score to win! Lose all 3 lives and you lose your stake.
                </span>
            </div>
        </div>
    );
};

export default SoloModeSelect;
