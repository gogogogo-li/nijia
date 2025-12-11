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
