/**
 * Solo Game Contract Interactions
 * Handles on-chain transactions for solo staked games
 */

import { Transaction } from '@onelabs/sui/transactions';

// Contract configuration from environment
const PACKAGE_ID = process.env.REACT_APP_PACKAGE_ID;
const SOLO_GAME_LOBBY_ID = process.env.REACT_APP_SOLO_GAME_LOBBY_ID;
const HACK_COIN_TYPE = process.env.REACT_APP_HACK_COIN_TYPE || '0x4061df8aee9971dee4b2b21a065abc7b63502d26b732f35bf1ecd8db64d1b5dd::diamondcoi::DIAMONDCOI';
const CLOCK_OBJECT = '0x6';

// Development mode check
const IS_DEV_MODE = !PACKAGE_ID || !SOLO_GAME_LOBBY_ID;

// Stake amounts in MIST (1 HACK = 10^9 MIST)
const MIST_PER_TOKEN = 1_000_000_000;
const STAKE_AMOUNTS = {
    0: 0.5 * MIST_PER_TOKEN,  // Easy: 0.5 HACK
    1: 1 * MIST_PER_TOKEN,    // Medium: 1 HACK
    2: 2 * MIST_PER_TOKEN,    // Hard: 2 HACK
    3: 5 * MIST_PER_TOKEN,    // Extreme: 5 HACK
};

/**
 * Create a transaction to start a solo staked game
 * @param {Object} params - Game parameters
 * @param {number} params.difficulty - Difficulty level (0-3)
 * @param {string} params.coinObjectId - Optional specific coin to use
 * @returns {Transaction} Transaction object ready to sign
 */
export function createSoloGameTransaction({ difficulty, coinObjectId }) {
    console.log('🎮 Building create_solo_game transaction...');
    console.log(`   Difficulty: ${difficulty}`);
    console.log(`   Package: ${PACKAGE_ID}`);
    console.log(`   SoloGameLobby: ${SOLO_GAME_LOBBY_ID}`);

    // Development mode: Return mock transaction
    if (IS_DEV_MODE) {
        console.warn('⚠️  Solo contract not deployed - using development mode');
        console.log('   PACKAGE_ID:', PACKAGE_ID);
        console.log('   SOLO_GAME_LOBBY_ID:', SOLO_GAME_LOBBY_ID);

        const tx = new Transaction();
        tx._isDevelopmentMode = true;
        tx._mockDifficulty = difficulty;
        tx._mockGameId = Math.floor(Math.random() * 1000000);
        return tx;
    }

    const stakeAmount = STAKE_AMOUNTS[difficulty];
    if (stakeAmount === undefined) {
        throw new Error(`Invalid difficulty: ${difficulty}. Must be 0-3`);
    }

    console.log(`   Stake: ${stakeAmount / MIST_PER_TOKEN} HACK (${stakeAmount} MIST)`);

    const tx = new Transaction();

    // Split coin to exact stake amount
    // Use gas coin if no specific coin object provided
    const coinSource = coinObjectId ? tx.object(coinObjectId) : tx.gas;
    const [stakeCoin] = tx.splitCoins(coinSource, [tx.pure.u64(stakeAmount)]);

    // Call create_solo_game function
    tx.moveCall({
        target: `${PACKAGE_ID}::multiplayer_game::create_solo_game`,
        typeArguments: [HACK_COIN_TYPE],
        arguments: [
            tx.object(SOLO_GAME_LOBBY_ID),  // solo_lobby: &mut SoloGameLobby
            tx.pure.u8(difficulty),          // difficulty: u8
            stakeCoin,                       // payment: Coin<T>
            tx.object(CLOCK_OBJECT),         // clock: &Clock
        ],
    });

    console.log('   ✅ Transaction built successfully');
    return tx;
}

/**
 * Get the stake amount for a difficulty level
 * @param {number} difficulty - Difficulty level (0-3)
 * @returns {number} Stake amount in MIST
 */
export function getStakeAmount(difficulty) {
    return STAKE_AMOUNTS[difficulty] || 0;
}

/**
 * Get stake amount in HACK (human readable)
 * @param {number} difficulty - Difficulty level (0-3)
 * @returns {number} Stake amount in HACK
 */
export function getStakeAmountToken(difficulty) {
    return (STAKE_AMOUNTS[difficulty] || 0) / MIST_PER_TOKEN;
}

/**
 * Check if contract is configured
 * @returns {boolean} True if contract addresses are set
 */
export function isContractConfigured() {
    return !IS_DEV_MODE;
}

const soloContractApi = {
    createSoloGameTransaction,
    getStakeAmount,
    getStakeAmountToken,
    isContractConfigured,
};

export default soloContractApi;
