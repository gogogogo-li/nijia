// Industry-standard tier system with progressive NFT rewards
// Inspired by League of Legends, Valorant, and 8 Ball Pool ranking systems

export const TIERS = [
  {
    id: 1,
    name: "Beginner",
    icon: "🌱",
    minScore: 0,
    maxScore: 99,
    color: "#8B7355",
    gradient: "linear-gradient(135deg, #8B7355, #A0826D)",
    requiredGames: 0,
    canMintNFT: true, // Welcome NFT on first game!
    nftType: "welcome",
    nftReward: "Welcome Ninja Badge",
    nftDescription: "Congratulations on your first game! Your ninja journey begins.",
    rewards: {
      title: "Fresh Recruit",
      badge: "🌱",
      bonus: 50
    }
  },
  {
    id: 2,
    name: "Bronze",
    icon: "🥉",
    minScore: 100,
    maxScore: 299,
    color: "#CD7F32",
    gradient: "linear-gradient(135deg, #CD7F32, #B87333)",
    requiredGames: 2,
    canMintNFT: true,
    nftType: "achievement",
    nftReward: "Bronze Ninja NFT",
    nftDescription: "You've earned Bronze rank! A worthy start to your journey.",
    rewards: {
      title: "Bronze Ninja",
      badge: "🥉",
      bonus: 100
    }
  },
  {
    id: 3,
    name: "Silver",
    icon: "🥈",
    minScore: 300,
    maxScore: 599,
    color: "#C0C0C0",
    gradient: "linear-gradient(135deg, #C0C0C0, #A8A8A8)",
    requiredGames: 4,
    canMintNFT: true,
    nftType: "achievement",
    nftReward: "Silver Rank NFT",
    nftDescription: "Reached Silver tier! You're becoming a skilled ninja.",
    rewards: {
      title: "Silver Ninja",
      badge: "🥈",
      bonus: 200
    }
  },
  {
    id: 4,
    name: "Gold",
    icon: "🥇",
    minScore: 600,
    maxScore: 999,
    color: "#FFD700",
    gradient: "linear-gradient(135deg, #FFD700, #FFA500)",
    requiredGames: 6,
    canMintNFT: true,
    nftType: "achievement",
    nftReward: "Gold Champion NFT",
    nftDescription: "Gold tier achieved! Your blade shines brighter than ever.",
    rewards: {
      title: "Gold Ninja",
      badge: "🥇",
      bonus: 300
    }
  },
  {
    id: 5,
    name: "Platinum",
    icon: "💎",
    minScore: 1000,
    maxScore: 1999,
    color: "#E5E4E2",
    gradient: "linear-gradient(135deg, #E5E4E2, #B9F2FF)",
    requiredGames: 10,
    canMintNFT: true,
    nftType: "achievement",
    nftReward: "Platinum Elite NFT",
    nftDescription: "Elite tier achieved! You're among the top ninjas.",
    rewards: {
      title: "Platinum Elite",
      badge: "💎",
      bonus: 500
    }
  },
  {
    id: 6,
    name: "Diamond",
    icon: "💠",
    minScore: 2000,
    maxScore: 3999,
    color: "#B9F2FF",
    gradient: "linear-gradient(135deg, #B9F2FF, #00CED1)",
    requiredGames: 20,
    canMintNFT: true,
    nftType: "achievement",
    nftReward: "Diamond Master NFT",
    nftDescription: "Diamond tier! Your skills are unmatched by most.",
    rewards: {
      title: "Diamond Master",
      badge: "💠",
      bonus: 750
    }
  },
  {
    id: 7,
    name: "Master",
    icon: "⚡",
    minScore: 4000,
    maxScore: 7999,
    color: "#9B59B6",
    gradient: "linear-gradient(135deg, #9B59B6, #8E44AD)",
    requiredGames: 40,
    canMintNFT: true,
    nftType: "achievement",
    nftReward: "Master Ninja NFT",
    nftDescription: "Master tier! You've proven exceptional skill and dedication.",
    rewards: {
      title: "Master Ninja",
      badge: "⚡",
      bonus: 1000
    }
  },
  {
    id: 8,
    name: "Grandmaster",
    icon: "🔥",
    minScore: 8000,
    maxScore: 14999,
    color: "#FF4500",
    gradient: "linear-gradient(135deg, #FF4500, #FF6347)",
    requiredGames: 75,
    canMintNFT: true,
    nftType: "achievement",
    nftReward: "Grandmaster NFT",
    nftDescription: "Grandmaster tier! Only the elite reach this level.",
    rewards: {
      title: "Grandmaster",
      badge: "🔥",
      bonus: 1500
    }
  },
  {
    id: 9,
    name: "Legendary",
    icon: "👑",
    minScore: 15000,
    maxScore: Infinity,
    color: "#FFD700",
    gradient: "linear-gradient(135deg, #FFD700, #FFA500, #FF1493)",
    requiredGames: 100,
    canMintNFT: true,
    nftType: "legendary",
    nftReward: "Legendary Ninja NFT (Ultra Rare)",
    nftDescription: "Legendary status achieved! You are a true ninja master.",
    rewards: {
      title: "Legendary Ninja",
      badge: "👑✨",
      bonus: 2500
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
export const canMintNFTAtTier = (totalScore, gamesPlayed, mintedNFTs = []) => {
  const currentTier = getTierByScore(totalScore);

  if (!currentTier.canMintNFT) {
    return {
      canMint: false,
      reason: "NFT not available at this tier",
      tier: currentTier
    };
  }

  // Special handling for welcome NFT (first game completion)
  if (currentTier.nftType === 'welcome' && gamesPlayed >= 1) {
    // Check if welcome NFT already minted
    if (mintedNFTs.includes('welcome') || mintedNFTs.includes(currentTier.id)) {
      return {
        canMint: false,
        reason: "Welcome NFT already minted",
        tier: currentTier,
        alreadyMinted: true
      };
    }

    return {
      canMint: true,
      tier: currentTier,
      nftReward: currentTier.nftReward,
      nftType: 'welcome',
      isWelcomeNFT: true,
      nftDescription: currentTier.nftDescription
    };
  }

  // Check if NFT for this tier already minted
  if (mintedNFTs.includes(currentTier.id) || mintedNFTs.includes(currentTier.nftType)) {
    return {
      canMint: false,
      reason: "NFT for this tier already minted",
      tier: currentTier,
      alreadyMinted: true
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
    nftReward: currentTier.nftReward,
    nftType: currentTier.nftType || 'achievement',
    nftDescription: currentTier.nftDescription
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

// Achievement system for extra motivation (industry-standard milestones)
const calculateAchievements = (totalScore, gamesPlayed, bestScore) => {
  const achievements = [];

  // Welcome achievements
  if (gamesPlayed >= 1) achievements.push({
    name: "First Steps",
    icon: "🎮",
    description: "Complete your first game",
    tier: "common"
  });

  // Score-based achievements (progressive milestones)
  if (totalScore >= 100) achievements.push({
    name: "Century",
    icon: "💯",
    description: "Reach 100 total score",
    tier: "common"
  });
  if (totalScore >= 300) achievements.push({
    name: "Silver Path",
    icon: "🥈",
    description: "Reach 300 total score",
    tier: "uncommon"
  });
  if (totalScore >= 1000) achievements.push({
    name: "Platinum Journey",
    icon: "💎",
    description: "Reach 1,000 total score",
    tier: "rare"
  });
  if (totalScore >= 2500) achievements.push({
    name: "Diamond Mind",
    icon: "💠",
    description: "Reach 2,500 total score",
    tier: "epic"
  });
  if (totalScore >= 5000) achievements.push({
    name: "Master's Path",
    icon: "⚡",
    description: "Reach 5,000 total score",
    tier: "legendary"
  });
  if (totalScore >= 10000) achievements.push({
    name: "Score Legend",
    icon: "👑",
    description: "Reach 10,000 total score",
    tier: "legendary"
  });

  // Game count achievements (engagement milestones)
  if (gamesPlayed >= 5) achievements.push({
    name: "Getting Started",
    icon: "🔄",
    description: "Play 5 games",
    tier: "common"
  });
  if (gamesPlayed >= 10) achievements.push({
    name: "Dedicated Player",
    icon: "🎯",
    description: "Play 10 games",
    tier: "uncommon"
  });
  if (gamesPlayed >= 25) achievements.push({
    name: "Regular Ninja",
    icon: "🥷",
    description: "Play 25 games",
    tier: "rare"
  });
  if (gamesPlayed >= 50) achievements.push({
    name: "Committed Warrior",
    icon: "🎮",
    description: "Play 50 games",
    tier: "epic"
  });
  if (gamesPlayed >= 100) achievements.push({
    name: "Century Club",
    icon: "💯",
    description: "Play 100 games",
    tier: "legendary"
  });
  if (gamesPlayed >= 250) achievements.push({
    name: "Ninja Legend",
    icon: "🌟",
    description: "Play 250 games",
    tier: "legendary"
  });

  // Best score achievements (skill milestones)
  if (bestScore >= 50) achievements.push({
    name: "Half Century",
    icon: "⭐",
    description: "Score 50+ in one game",
    tier: "common"
  });
  if (bestScore >= 100) achievements.push({
    name: "Centurion",
    icon: "🌟",
    description: "Score 100+ in one game",
    tier: "uncommon"
  });
  if (bestScore >= 200) achievements.push({
    name: "Double Century",
    icon: "✨",
    description: "Score 200+ in one game",
    tier: "rare"
  });
  if (bestScore >= 500) achievements.push({
    name: "High Scorer",
    icon: "💫",
    description: "Score 500+ in one game",
    tier: "epic"
  });
  if (bestScore >= 1000) achievements.push({
    name: "Unstoppable",
    icon: "🚀",
    description: "Score 1,000+ in one game",
    tier: "legendary"
  });

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
