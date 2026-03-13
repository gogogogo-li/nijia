/**
 * OneScan explorer URLs - respects REACT_APP_ONECHAIN_NETWORK (mainnet | testnet)
 */
const network = process.env.REACT_APP_ONECHAIN_NETWORK || 'mainnet';

export const ONECHAIN_EXPLORER_BASE =
  network === 'testnet' ? 'https://onescan.cc/testnet' : 'https://onescan.cc';

export function explorerTxUrl(digest) {
  return `${ONECHAIN_EXPLORER_BASE}/tx/${digest}`;
}

export function explorerAccountUrl(address) {
  return `${ONECHAIN_EXPLORER_BASE}/account?address=${address}`;
}

export function explorerTxBlocksDetailUrl(digest) {
  return `${ONECHAIN_EXPLORER_BASE}/transactionBlocksDetail?digest=${digest}`;
}
