import React from "react";
import "./ModeSelection.css";
import "../styles/unified-design.css";
import {
  GiTargetArrows,
  GiLightningBow,
  GiMeditation,
  GiCherry,
  GiOrange,
  GiStrawberry,
  GiGrapes,
  GiBanana,
  GiPeach,
  GiPear,
  GiWatermelon,
  GiLemon,
} from "react-icons/gi";
import { FaTrophy, FaPlay, FaArrowLeft } from "react-icons/fa";
import { IoIosFlash } from "react-icons/io";

const ModeSelection = ({ onSelectMode, onBack, onSoloStakes, bestScores = {} }) => {
  const modes = [
    {
      id: "classic",
      name: "CLASSIC",
      emoji: <GiTargetArrows />,
      background: "linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)",
      shadow: "0 0 40px rgba(255, 107, 107, 0.6)",
      description: "3 LIVES • BOMBS END GAME",
      subtitle: "THE ORIGINAL CHALLENGE",
      bestScore: bestScores?.classic || 0,
      particles: [
        <GiCherry key="p1" />,
        <GiOrange key="p2" />,
        <GiLemon key="p3" />,
      ],
    },
    {
      id: "arcade",
      name: "ARCADE",
      emoji: <GiLightningBow />,
      background: "linear-gradient(135deg, #4158D0 0%, #C850C0 100%)",
      shadow: "0 0 40px rgba(200, 80, 192, 0.6)",
      description: "60 SECONDS • MAXIMUM CHAOS",
      subtitle: "SPEED IS EVERYTHING",
      bestScore: bestScores?.arcade || 0,
      particles: [
        <IoIosFlash key="p1" />,
        <IoIosFlash key="p2" />,
        <IoIosFlash key="p3" />,
      ],
    },
    {
      id: "zen",
      name: "ZEN",
      emoji: <GiMeditation />,
      background: "linear-gradient(135deg, #0093E9 0%, #80D0C7 100%)",
      shadow: "0 0 40px rgba(0, 147, 233, 0.6)",
      description: "90 SECONDS • NO BOMBS",
      subtitle: "PURE SLICING BLISS",
      bestScore: bestScores?.zen || 0,
      particles: [
        <GiPear key="p1" />,
        <GiStrawberry key="p2" />,
        <GiGrapes key="p3" />,
      ],
    },
    {
      id: "solo_stakes",
      name: "SOLO STAKES",
      emoji: <GiCherry />,
      background: "linear-gradient(135deg, #f7971e 0%, #ffd200 100%)",
      shadow: "0 0 40px rgba(255, 210, 0, 0.6)",
      description: "STAKE DIAMOND • WIN DOUBLE",
      subtitle: "PLAY FOR REAL REWARDS",
      bestScore: 0,
      isSoloStakes: true,
      particles: [
        <GiCherry key="p1" />,
        <GiOrange key="p2" />,
        <GiLemon key="p3" />,
      ],
    },
  ];

  return (
    <div className="mode-selection-screen">
      {/* Animated Background */}
      <div className="mode-bg-animation">
        <div className="floating-fruit fruit-1">
          <GiCherry />
        </div>
        <div className="floating-fruit fruit-2">
          <GiOrange />
        </div>
        <div className="floating-fruit fruit-3">
          <GiLemon />
        </div>
        <div className="floating-fruit fruit-4">
          <GiGrapes />
        </div>
        <div className="floating-fruit fruit-5">
          <GiBanana />
        </div>
        <div className="floating-fruit fruit-6">
          <GiPeach />
        </div>
        <div className="floating-fruit fruit-7">
          <GiPear />
        </div>
        <div className="floating-fruit fruit-8">
          <GiWatermelon />
        </div>
      </div>

      {/* Header */}
      <div className="mode-header">
        <button className="mode-back-btn" onClick={onBack}>
          <span className="back-arrow">
            <FaArrowLeft />
          </span>
          <span className="back-text">BACK</span>
        </button>
      </div>

      {/* Main Title with Slash Effect */}
      <div className="mode-title-container">
        <h1 className="mode-main-title">
          <span className="title-text">SELECT MODE</span>
          <div className="title-slash"></div>
        </h1>
        <p className="mode-subtitle">CHOOSE YOUR CHALLENGE</p>
      </div>

      {/* Mode Cards */}
      <div className="modes-container">
        {modes.map((mode, index) => (
          <div
            key={mode.id}
            className="game-mode-card"
            onClick={() => mode.isSoloStakes && onSoloStakes ? onSoloStakes() : onSelectMode(mode.id)}
            style={{
              animationDelay: `${index * 0.1}s`,
            }}
          >
            {/* Card Background Glow */}
            <div
              className="card-glow"
              style={{
                background: mode.background,
                boxShadow: mode.shadow,
              }}
            ></div>

            {/* Floating Particles */}
            <div className="card-particles">
              {mode.particles.map((particle, i) => (
                <span
                  key={i}
                  className="particle"
                  style={{ animationDelay: `${i * 0.3}s` }}
                >
                  {particle}
                </span>
              ))}
            </div>

            {/* Card Content */}
            <div className="card-content">
              <div className="mode-emoji-container">
                <span className="mode-emoji">{mode.emoji}</span>
                <div className="emoji-ring"></div>
              </div>

              <h2 className="mode-title">{mode.name}</h2>
              <p className="mode-desc">{mode.description}</p>
              <p className="mode-sub">{mode.subtitle}</p>

              {mode.bestScore > 0 && (
                <div className="mode-best">
                  <span className="best-trophy">
                    <FaTrophy />
                  </span>
                  <span className="best-score">{mode.bestScore}</span>
                </div>
              )}

              <button
                className="mode-play-btn"
                style={{ background: mode.background }}
              >
                <span className="play-text">PLAY</span>
                <span className="play-arrow">
                  <FaPlay />
                </span>
              </button>

              {/* Slash Effect on Hover */}
              <div className="card-slash"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ModeSelection;