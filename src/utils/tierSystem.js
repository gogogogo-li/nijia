// Tier system similar to 8 Ball Pool - makes the game addictive and rewarding

export const TIERS = [
  {
    id: 1,
    name: "Wooden Blade",
    icon: "🪵",
    minScore: 0,
    maxScore: 499,
    color: "#8B4513",
    gradient: "linear-gradient(135deg, #8B4513, #A0522D)",
    requiredGames: 0,
    canMintNFT: false,
    rewards: {
      title: "Beginner",
      badge: "🌱"
    }
  },
  {
    id: 2,
    name: "Bronze Blade",
    icon: "🥉",
    minScore: 500,
    maxScore: 999,
    color: "#CD7F32",
    gradient: "linear-gradient(135deg, #CD7F32, #B87333)",
    requiredGames: 5,
    canMintNFT: false,
    rewards: {
      title: "Novice Ninja",
      badge: "🔰"
    }
  },
  {
    id: 3,
    name: "Silver Blade",
    icon: "🥈",
    minScore: 1000,
    maxScore: 2499,
    color: "#C0C0C0",
    gradient: "linear-gradient(135deg, #C0C0C0, #A8A8A8)",
    requiredGames: 15,
    canMintNFT: true, // First NFT milestone!
    nftReward: "Silver Ninja NFT",
    rewards: {
      title: "Skilled Slicer",
      badge: "⚔️"
    }
  },
  {
    id: 4,
    name: "Gold Blade",
    icon: "🥇",
    minScore: 2500,
    maxScore: 4999,
    color: "#FFD700",
    gradient: "linear-gradient(135deg, #FFD700, #FFA500)",
    requiredGames: 30,
    canMintNFT: false,
    rewards: {
      title: "Master Slasher",
      badge: "👑"
    }
  },
  {
    id: 5,
    name: "Platinum Blade",
    icon: "💎",
    minScore: 5000,
    maxScore: 9999,
    color: "#E5E4E2",
    gradient: "linear-gradient(135deg, #E5E4E2, #B9F2FF)",
    requiredGames: 50,
    canMintNFT: true, // Second NFT milestone!
    nftReward: "Platinum Ninja NFT",
    rewards: {
      title: "Elite Ninja",
      badge: "💎"
    }
  },
  {
    id: 6,
    name: "Diamond Blade",
    icon: "💠",
    minScore: 10000,
    maxScore: 19999,
    color: "#B9F2FF",
    gradient: "linear-gradient(135deg, #B9F2FF, #00CED1)",
    requiredGames: 100,
    canMintNFT: false,
    rewards: {
      title: "Diamond Warrior",
      badge: "💠"
    }
  },
  {
    id: 7,
    name: "Legendary Blade",
    icon: "⚡",
    minScore: 20000,
    maxScore: 49999,
    color: "#FF1493",
    gradient: "linear-gradient(135deg, #FF1493, #FF69B4)",
    requiredGames: 200,
    canMintNFT: true, // Third NFT milestone!
    nftReward: "Legendary Ninja NFT",
    rewards: {
      title: "Legendary Ninja",
      badge: "⚡"
    }
  },
  {
    id: 8,
    name: "Mythic Blade",
    icon: "🔥",
    minScore: 50000,
    maxScore: 99999,
    color: "#FF4500",
    gradient: "linear-gradient(135deg, #FF4500, #FFD700)",
    requiredGames: 500,
    canMintNFT: false,
    rewards: {
      title: "Mythic Slayer",
      badge: "🔥"
    }
  },
  {
    id: 9,
    name: "Godlike Blade",
    icon: "👑",
    minScore: 100000,
    maxScore: Infinity,
    color: "#9400D3",
    gradient: "linear-gradient(135deg, #9400D3, #FF1493, #FFD700)",
    requiredGames: 1000,
    canMintNFT: true, // Final NFT milestone!
    nftReward: "Godlike Ninja NFT (Ultra Rare)",
    rewards: {
      title: "God of Ninjas",
      badge: "👑✨"
    }
  }
];

// Calculate player's current tier based on total score
export const getTierByScore = (totalScore) => {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (totalScore >= TIERS[i].minScore) {
      return TIERS[i];
    }
  }
  return TIERS[0];
};

// Calculate progress to next tier
export const getProgressToNextTier = (totalScore) => {
  const currentTier = getTierByScore(totalScore);
  const currentIndex = TIERS.findIndex(t => t.id === currentTier.id);
  
  if (currentIndex === TIERS.length - 1) {
    // Already at max tier
    return {
      currentTier,
      nextTier: null,
      progress: 100,
      scoreNeeded: 0,
      scoreInCurrentTier: totalScore - currentTier.minScore
    };
  }
  
  const nextTier = TIERS[currentIndex + 1];
  const scoreInCurrentTier = totalScore - currentTier.minScore;
  const tierRange = nextTier.minScore - currentTier.minScore;
  const progress = (scoreInCurrentTier / tierRange) * 100;
  const scoreNeeded = nextTier.minScore - totalScore;
  
  return {
    currentTier,
    nextTier,
    progress: Math.min(100, progress),
    scoreNeeded: Math.max(0, scoreNeeded),
    scoreInCurrentTier
  };
};

// Check if player can mint NFT at current tier
export const canMintNFTAtTier = (totalScore, gamesPlayed) => {
  const currentTier = getTierByScore(totalScore);
  
  if (!currentTier.canMintNFT) {
    return {
      canMint: false,
      reason: "NFT not available at this tier",
      tier: currentTier
    };
  }
  
  if (gamesPlayed < currentTier.requiredGames) {
    return {
      canMint: false,
      reason: `Need ${currentTier.requiredGames - gamesPlayed} more games`,
      gamesNeeded: currentTier.requiredGames - gamesPlayed,
      tier: currentTier
    };
  }
  
  return {
    canMint: true,
    tier: currentTier,
    nftReward: currentTier.nftReward
  };
};

// Get all available NFT milestones
export const getNFTMilestones = () => {
  return TIERS.filter(tier => tier.canMintNFT);
};

// Calculate total player stats and achievements
export const calculatePlayerStats = (totalScore, gamesPlayed, bestScore) => {
  const tierInfo = getProgressToNextTier(totalScore);
  const nftInfo = canMintNFTAtTier(totalScore, gamesPlayed);
  
  // Calculate additional stats
  const averageScore = gamesPlayed > 0 ? Math.floor(totalScore / gamesPlayed) : 0;
  const nftMilestones = getNFTMilestones();
  const unlockedNFTs = nftMilestones.filter(
    tier => totalScore >= tier.minScore && gamesPlayed >= tier.requiredGames
  );
  
  return {
    totalScore,
    gamesPlayed,
    bestScore,
    averageScore,
    ...tierInfo,
    nftInfo,
    unlockedNFTs,
    totalNFTsAvailable: nftMilestones.length,
    achievements: calculateAchievements(totalScore, gamesPlayed, bestScore)
  };
};

// Achievement system for extra motivation
const calculateAchievements = (totalScore, gamesPlayed, bestScore) => {
  const achievements = [];
  
  // Score-based achievements
  if (totalScore >= 1000) achievements.push({ name: "Slice Master", icon: "🎯", description: "Reach 1,000 total score" });
  if (totalScore >= 5000) achievements.push({ name: "Score Hunter", icon: "🏆", description: "Reach 5,000 total score" });
  if (totalScore >= 25000) achievements.push({ name: "Point Crusher", icon: "💪", description: "Reach 25,000 total score" });
  if (totalScore >= 100000) achievements.push({ name: "Score God", icon: "👑", description: "Reach 100,000 total score" });
  
  // Game count achievements
  if (gamesPlayed >= 10) achievements.push({ name: "Dedicated", icon: "🔄", description: "Play 10 games" });
  if (gamesPlayed >= 50) achievements.push({ name: "Addicted", icon: "🎮", description: "Play 50 games" });
  if (gamesPlayed >= 100) achievements.push({ name: "No Life", icon: "😅", description: "Play 100 games" });
  if (gamesPlayed >= 500) achievements.push({ name: "Ninja Legend", icon: "🥷", description: "Play 500 games" });
  
  // Best score achievements
  if (bestScore >= 500) achievements.push({ name: "Half K Club", icon: "⭐", description: "Score 500+ in one game" });
  if (bestScore >= 1000) achievements.push({ name: "1K Club", icon: "🌟", description: "Score 1,000+ in one game" });
  if (bestScore >= 2500) achievements.push({ name: "Elite Scorer", icon: "✨", description: "Score 2,500+ in one game" });
  if (bestScore >= 5000) achievements.push({ name: "Unstoppable", icon: "💫", description: "Score 5,000+ in one game" });
  
  return achievements;
};

// Session-based reward multiplier (encourages continuous play)
export const getSessionMultiplier = (consecutiveGames) => {
  if (consecutiveGames >= 10) return 2.0; // 2x for 10+ games in a row
  if (consecutiveGames >= 5) return 1.5;  // 1.5x for 5+ games
  if (consecutiveGames >= 3) return 1.25; // 1.25x for 3+ games
  return 1.0;
};

// Daily login bonus (encourages daily return)
export const getDailyBonus = (lastLoginDate) => {
  if (!lastLoginDate) return { bonus: 100, streak: 1 };
  
  const today = new Date().toDateString();
  const lastLogin = new Date(lastLoginDate).toDateString();
  
  if (today === lastLogin) {
    return { bonus: 0, streak: 0, alreadyClaimed: true };
  }
  
  const daysDiff = Math.floor((new Date(today) - new Date(lastLogin)) / (1000 * 60 * 60 * 24));
  
  if (daysDiff === 1) {
    // Consecutive day - increase streak
    const streak = (localStorage.getItem('loginStreak') || 0) + 1;
    const bonus = 100 + (streak * 50); // 100 + 50 per streak day
    return { bonus, streak, consecutive: true };
  } else {
    // Streak broken
    return { bonus: 100, streak: 1, consecutive: false };
  }
};
