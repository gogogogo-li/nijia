import { SuiClient } from '@onelabs/sui/client';
import dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.ONECHAIN_RPC || 'https://rpc-testnet.onelabs.cc:443';
const NETWORK = process.env.ONECHAIN_NETWORK || 'testnet';

export const suiClient = new SuiClient({ url: RPC_URL });

export const ONECHAIN_CONFIG = {
  rpcUrl: RPC_URL,
  network: NETWORK,
  apiUrl: process.env.ONECHAIN_API || 'https://api.onelabs.cc'
};

// Deployed Contract Addresses
export const PACKAGE_ID = process.env.PACKAGE_ID;
export const GAME_LOBBY_ID = process.env.GAME_LOBBY_ID;
export const STATS_REGISTRY_ID = process.env.STATS_REGISTRY_ID;
export const SOLO_GAME_LOBBY_ID = process.env.SOLO_GAME_LOBBY_ID;

// Validate contract configuration
export function validateContractConfig() {
  if (!PACKAGE_ID || !GAME_LOBBY_ID || !STATS_REGISTRY_ID) {
    console.warn('⚠️  Contract addresses not fully configured in backend .env');
    return false;
  }
  console.log('✅ Contract configuration validated:', {
    packageId: PACKAGE_ID.substring(0, 10) + '...',
    gameLobbyId: GAME_LOBBY_ID.substring(0, 10) + '...',
    statsRegistryId: STATS_REGISTRY_ID.substring(0, 10) + '...'
  });
  return true;
}

// Token decimals (OCT uses 9 decimals like SUI)
export const OCT_DECIMALS = 9;
export const MIST_PER_OCT = 1_000_000_000;

// Convert OCT to MIST (smallest unit)
export function octToMist(oct) {
  return BigInt(Math.floor(oct * MIST_PER_OCT));
}

// Convert MIST to OCT
export function mistToOct(mist) {
  return Number(mist) / MIST_PER_OCT;
}
