/**
 * Multiplayer Game Contract Service
 * Handles all interactions with deployed OneChain multiplayer contract
 */

import { Transaction } from '@onelabs/sui/transactions';

// Contract addresses from environment
const PACKAGE_ID = process.env.REACT_APP_PACKAGE_ID;
const GAME_LOBBY_ID = process.env.REACT_APP_GAME_LOBBY_ID;
const STATS_REGISTRY_ID = process.env.REACT_APP_STATS_REGISTRY_ID;

// Development mode (contract not deployed)
const IS_DEV_MODE = !PACKAGE_ID || !GAME_LOBBY_ID;

// OneChain constants
const CLOCK_OBJECT = '0x6'; // Standard clock object on Sui/OneChain
const OCT_COIN_TYPE = process.env.REACT_APP_OCT_COIN_TYPE || '0x2::oct::OCT'; // OCT coin type on OneChain

// Bet tier mapping (matching contract)
const BET_TIERS = {
  1: 100000000,    // 0.1 OCT in MIST
  2: 500000000,    // 0.5 OCT in MIST
  3: 1000000000,   // 1 OCT in MIST
  4: 5000000000,   // 5 OCT in MIST
};

/**
 * Create a transaction to create a new multiplayer game
 * @param {Object} params - Game creation parameters
 * @param {number} params.betTierId - Bet tier (1-4)
 * @param {string} params.coinObjectId - Player's coin object ID to pay bet
 * @returns {Transaction} Transaction object ready to sign
 */
export function createGameTransaction({ betTierId, coinObjectId }) {
  // Development mode: Return mock transaction
  if (IS_DEV_MODE) {
    console.warn('⚠️  Contract not deployed - using development mode');
    console.log('   To enable real transactions, set REACT_APP_PACKAGE_ID and REACT_APP_GAME_LOBBY_ID');

    // Return a minimal transaction that can be "executed" without throwing
    const tx = new Transaction();
    tx._isDevelopmentMode = true; // Flag for onechainService
    tx._mockTierId = betTierId;
    return tx;
  }

  const betAmount = BET_TIERS[betTierId];
  if (!betAmount) {
    throw new Error(`Invalid bet tier: ${betTierId}. Must be 1-4`);
  }

  const tx = new Transaction();

  // Split coin to exact bet amount
  // Use gas coin if no specific coin object provided
  const coinSource = coinObjectId ? tx.object(coinObjectId) : tx.gas;
  const [betCoin] = tx.splitCoins(coinSource, [tx.pure.u64(betAmount)]);

  // Call create_game function
  tx.moveCall({
    target: `${PACKAGE_ID}::multiplayer_game::create_game`,
    typeArguments: [OCT_COIN_TYPE],
    arguments: [
      tx.object(GAME_LOBBY_ID),           // lobby: &mut GameLobby
      tx.pure.u64(betTierId - 1),         // bet_tier: u64 (0-indexed in contract)
      betCoin,                            // payment: Coin<T>
      tx.object(CLOCK_OBJECT),            // clock: &Clock
    ],
  });

  return tx;
}


/**
 * Create a transaction to join an existing game
 * @param {Object} params - Join parameters
 * @param {number} params.gameId - Game ID to join
 * @param {number} params.betTierId - Bet tier (1-4)
 * @param {string} params.coinObjectId - Player's coin object ID to pay bet
 * @returns {Transaction} Transaction object ready to sign
 */
export function joinGameTransaction({ gameId, betTierId, coinObjectId }) {
  // Development mode: Return mock transaction
  if (IS_DEV_MODE) {
    console.warn('⚠️  Contract not deployed - using development mode for join');

    const tx = new Transaction();
    tx._isDevelopmentMode = true;
    tx._mockTierId = betTierId;
    tx._mockGameId = gameId;
    return tx;
  }

  if (!PACKAGE_ID || !GAME_LOBBY_ID) {
    throw new Error('Contract addresses not configured');
  }

  const betAmount = BET_TIERS[betTierId];
  if (!betAmount) {
    throw new Error(`Invalid bet tier: ${betTierId}`);
  }

  const tx = new Transaction();

  // Split coin to exact bet amount
  // Use gas coin if no specific coin object provided
  const coinSource = coinObjectId ? tx.object(coinObjectId) : tx.gas;
  const [betCoin] = tx.splitCoins(coinSource, [tx.pure.u64(betAmount)]);

  // Call join_game function
  tx.moveCall({
    target: `${PACKAGE_ID}::multiplayer_game::join_game`,
    typeArguments: [OCT_COIN_TYPE],
    arguments: [
      tx.object(GAME_LOBBY_ID),           // lobby: &mut GameLobby
      tx.pure.u64(gameId),                // game_id: u64
      betCoin,                            // payment: Coin<T>
      tx.object(CLOCK_OBJECT),            // clock: &Clock
    ],
  });

  return tx;
}


/**
 * Submit game scores (Admin only)
 * Note: This is typically called by backend, not frontend
 * @param {Object} params - Score submission parameters
 * @param {number} params.gameId - Game ID
 * @param {string} params.player1Address - Player 1 address
 * @param {string} params.player2Address - Player 2 address
 * @param {number} params.player1Score - Player 1 final score
 * @param {number} params.player2Score - Player 2 final score
 * @returns {Transaction} Transaction object ready to sign
 */
export function submitScoreTransaction({
  gameId,
  player1Address,
  player2Address,
  player1Score,
  player2Score
}) {
  if (!PACKAGE_ID || !GAME_LOBBY_ID || !STATS_REGISTRY_ID) {
    throw new Error('Contract addresses not configured');
  }

  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::multiplayer_game::submit_score`,
    typeArguments: [OCT_COIN_TYPE],
    arguments: [
      tx.object(GAME_LOBBY_ID),           // lobby: &mut GameLobby
      tx.object(STATS_REGISTRY_ID),       // stats_registry: &mut StatsRegistry
      tx.pure.u64(gameId),                // game_id: u64
      tx.pure.address(player1Address),    // player1_address: address
      tx.pure.address(player2Address),    // player2_address: address
      tx.pure.u64(player1Score),          // player1_score: u64
      tx.pure.u64(player2Score),          // player2_score: u64
      tx.object(CLOCK_OBJECT),            // clock: &Clock
    ],
  });

  return tx;
}

/**
 * Claim game prize (winner claims their winnings)
 * @param {Object} params - Claim parameters
 * @param {number} params.gameId - Game ID to claim prize from
 * @returns {Transaction} Transaction object ready to sign
 */
export function claimPrizeTransaction({ gameId }) {
  if (!PACKAGE_ID || !GAME_LOBBY_ID) {
    throw new Error('Contract addresses not configured');
  }

  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::multiplayer_game::claim_prize`,
    typeArguments: [OCT_COIN_TYPE],
    arguments: [
      tx.object(GAME_LOBBY_ID),           // lobby: &mut GameLobby
      tx.pure.u64(gameId),                // game_id: u64
    ],
  });

  return tx;
}

/**
 * Get player statistics from contract
 * This is a view function, doesn't require transaction
 * @param {Object} suiClient - Sui client instance
 * @param {string} playerAddress - Player's wallet address
 * @returns {Promise<Object>} Player stats: {gamesPlayed, gamesWon, totalWagered, totalWinnings}
 */
export async function getPlayerStats(suiClient, playerAddress) {
  if (!PACKAGE_ID || !STATS_REGISTRY_ID) {
    throw new Error('Contract addresses not configured');
  }

  try {
    const result = await suiClient.devInspectTransactionBlock({
      sender: playerAddress,
      transactionBlock: {
        kind: 'moveCall',
        target: `${PACKAGE_ID}::multiplayer_game::get_player_stats`,
        typeArguments: [],
        arguments: [
          { Object: STATS_REGISTRY_ID },
          { Pure: playerAddress }
        ]
      }
    });

    // Parse result from contract
    // Returns: (games_played, games_won, total_wagered, total_winnings)
    if (result.effects.status.status === 'success' && result.results?.[0]?.returnValues) {
      const [gamesPlayed, gamesWon, totalWagered, totalWinnings] = result.results[0].returnValues;
      return {
        gamesPlayed: parseInt(gamesPlayed),
        gamesWon: parseInt(gamesWon),
        totalWagered: parseInt(totalWagered),
        totalWinnings: parseInt(totalWinnings)
      };
    }

    return { gamesPlayed: 0, gamesWon: 0, totalWagered: 0, totalWinnings: 0 };
  } catch (error) {
    console.error('Error fetching player stats:', error);
    return { gamesPlayed: 0, gamesWon: 0, totalWagered: 0, totalWinnings: 0 };
  }
}

/**
 * Get lobby statistics
 * @param {Object} suiClient - Sui client instance
 * @returns {Promise<Object>} Lobby stats: {totalGamesPlayed, totalVolume}
 */
export async function getLobbyStats(suiClient) {
  if (!PACKAGE_ID || !GAME_LOBBY_ID) {
    throw new Error('Contract addresses not configured');
  }

  try {
    const lobbyObject = await suiClient.getObject({
      id: GAME_LOBBY_ID,
      options: { showContent: true }
    });

    if (lobbyObject?.data?.content?.fields) {
      const fields = lobbyObject.data.content.fields;
      return {
        totalGamesPlayed: parseInt(fields.total_games_played || 0),
        totalVolume: parseInt(fields.total_volume || 0),
        nextGameId: parseInt(fields.next_game_id || 0)
      };
    }

    return { totalGamesPlayed: 0, totalVolume: 0, nextGameId: 0 };
  } catch (error) {
    console.error('Error fetching lobby stats:', error);
    return { totalGamesPlayed: 0, totalVolume: 0, nextGameId: 0 };
  }
}

/**
 * Convert bet tier ID to OCT amount
 * @param {number} tierId - Tier ID (1-4)
 * @returns {number} Amount in OCT
 */
export function getBetAmountOCT(tierId) {
  const mist = BET_TIERS[tierId];
  return mist ? mist / 1_000_000_000 : 0;
}

/**
 * Get contract configuration
 * @returns {Object} Contract addresses
 */
export function getContractConfig() {
  return {
    packageId: PACKAGE_ID,
    gameLobbyId: GAME_LOBBY_ID,
    statsRegistryId: STATS_REGISTRY_ID,
    isConfigured: !!(PACKAGE_ID && GAME_LOBBY_ID && STATS_REGISTRY_ID)
  };
}

const multiplayerContract = {
  createGameTransaction,
  joinGameTransaction,
  submitScoreTransaction,
  claimPrizeTransaction,
  getPlayerStats,
  getLobbyStats,
  getBetAmountOCT,
  getContractConfig,
  BET_TIERS
};

export default multiplayerContract;
