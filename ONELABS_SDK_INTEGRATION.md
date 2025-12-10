# OneLabs API SDK Integration

This document describes the integration of the official OneLabs API SDK into the OneNinja game.

## Overview

The OneNinja game now uses the official `@onelabs/sui` SDK for all blockchain interactions with the OneChain network. This provides a standardized, type-safe interface for:

- Wallet balance queries
- Transaction execution
- Game state management
- Leaderboard operations
- NFT minting
- User profile management
- Token price queries

## Installation

The SDK is installed via npm:

```bash
npm install @onelabs/sui
```

## Architecture

### API Client (`src/services/onelabsApiClient.js`)

A singleton client that wraps the OneLabs SDK and provides high-level methods for common operations:

```javascript
import onelabsApiClient from './services/onelabsApiClient';

// Get wallet balance
const balance = await onelabsApiClient.getBalance(address);

// Get leaderboard
const leaderboard = await onelabsApiClient.getLeaderboard(100);

// Submit score
await onelabsApiClient.submitScore(address, score, signature);
```

### OneChain Service Integration

The `OneChainService` class now uses the API client for all blockchain operations:

```javascript
class OneChainService {
  constructor() {
    // Initialize OneLabs API Client
    this.apiClient = onelabsApiClient;
    // ... other initialization
  }
  
  async getBalance() {
    // Uses apiClient.getBalance()
  }
  
  async getLeaderboard() {
    // Uses apiClient.getLeaderboard()
  }
}
```

## Configuration

The SDK is configured through environment variables:

```env
# OneLabs API Configuration
REACT_APP_ONECHAIN_API=https://api.onelabs.cc
REACT_APP_ONECHAIN_RPC=https://rpc-testnet.onelabs.cc:443
REACT_APP_ONECHAIN_NETWORK=testnet
REACT_APP_ONECHAIN_PROJECT_ID=oneninja
```

## API Methods

### Blockchain Operations

#### `getSuiClient()`
Returns the underlying Sui client for direct blockchain queries.

#### `getBalance(address)`
Get OCT balance for a wallet address.

```javascript
const balance = await apiClient.getBalance(address);
// Returns: { totalBalance: "1000000000", ... }
```

#### `getAllBalances(address)`
Get all token balances for an address.

```javascript
const balances = await apiClient.getAllBalances(address);
```

#### `getTransaction(digest)`
Get transaction details by digest.

```javascript
const tx = await apiClient.getTransaction(txDigest);
```

#### `getOwnedObjects(address, options)`
Get all objects owned by an address.

```javascript
const objects = await apiClient.getOwnedObjects(address);
```

#### `executeTransactionBlock(txb, signer)`
Execute a transaction block.

```javascript
const txb = apiClient.createTransactionBlock();
// ... build transaction
const result = await apiClient.executeTransactionBlock(txb, signer);
```

### Game API

#### `submitScore(walletAddress, score, signature)`
Submit a game score to the leaderboard.

```javascript
await apiClient.submitScore(address, 1000, signature);
```

#### `getLeaderboard(limit)`
Fetch the game leaderboard.

```javascript
const leaderboard = await apiClient.getLeaderboard(100);
```

#### `getPlayerStats(walletAddress)`
Get player statistics and game state.

```javascript
const stats = await apiClient.getPlayerStats(address);
```

#### `submitSlashBatch(walletAddress, slashes, signature)`
Submit a batch of slash events.

```javascript
await apiClient.submitSlashBatch(address, slashes, signature);
```

#### `claimReward(walletAddress, amount, signature)`
Claim game rewards.

```javascript
const result = await apiClient.claimReward(address, 100, signature);
```

### NFT API

#### `mintNFT(walletAddress, metadata, signature)`
Mint a game achievement NFT.

```javascript
const nft = await apiClient.mintNFT(address, {
  name: "Achievement NFT",
  description: "Epic achievement",
  attributes: [...]
}, signature);
```

### Identity API

#### `getUserProfile(walletAddress)`
Get OneID user profile.

```javascript
const profile = await apiClient.getUserProfile(address);
```

#### `updateUserProfile(walletAddress, profileData, signature)`
Update OneID user profile.

```javascript
await apiClient.updateUserProfile(address, {
  displayName: "Ninja Master"
}, signature);
```

### DEX API

#### `getTokenPrice(tokenSymbol)`
Get token price from OneDEX.

```javascript
const price = await apiClient.getTokenPrice('OCT');
```

#### `getSwapQuote(fromToken, toToken, amount)`
Get a swap quote.

```javascript
const quote = await apiClient.getSwapQuote('OCT', 'USDC', 100);
```

### Authentication API

#### `verifyAuth(walletAddress, message, signature)`
Verify a wallet signature.

```javascript
const isValid = await apiClient.verifyAuth(address, message, signature);
```

### Transaction API

#### `getTransactionStatus(txHash)`
Get transaction status and confirmation.

```javascript
const status = await apiClient.getTransactionStatus(txHash);
```

### Utility Methods

#### `healthCheck()`
Check API health status.

```javascript
const isHealthy = await apiClient.healthCheck();
```

#### `getNetworkInfo()`
Get current network information.

```javascript
const info = await apiClient.getNetworkInfo();
// Returns: { chainId, latestCheckpoint, rpcEndpoint, network }
```

#### `createTransactionBlock()`
Create a new transaction block builder.

```javascript
const txb = apiClient.createTransactionBlock();
```

#### `parseAmount(amount, decimals)`
Convert human-readable amount to smallest unit.

```javascript
const mist = apiClient.parseAmount(1.5, 9); // 1.5 OCT to MIST
```

#### `formatAmount(amount, decimals)`
Convert smallest unit to human-readable amount.

```javascript
const oct = apiClient.formatAmount(1500000000, 9); // MIST to OCT
```

## Error Handling

All API methods include proper error handling:

```javascript
try {
  const balance = await apiClient.getBalance(address);
  console.log('Balance:', balance);
} catch (error) {
  console.error('Failed to fetch balance:', error);
}
```

## Benefits

1. **Type Safety**: Full TypeScript support from the official SDK
2. **Standardized**: Uses OneLabs' official implementation
3. **Maintainable**: Centralized API logic in one client
4. **Reliable**: Better error handling and retry logic
5. **Feature Complete**: Access to all OneLabs API features
6. **Future Proof**: Automatic updates with SDK releases

## Migration Notes

All previous `fetch()` calls to OneChain API endpoints have been replaced with SDK methods:

- Direct RPC calls → `apiClient.getSuiClient()` methods
- Manual balance queries → `apiClient.getBalance()`
- API fetch calls → Corresponding `apiClient` methods
- Transaction handling → `apiClient.executeTransactionBlock()`

## Testing

The SDK integration can be tested using the existing test suite:

```bash
npm run test:integration
npm run test:wallet
```

## Documentation

- [OneLabs API Documentation](https://docs.onelabs.cc/API)
- [Sui SDK Documentation](https://docs.sui.io/references/ts-sdk)
- [@onelabs/sui NPM Package](https://www.npmjs.com/package/@onelabs/sui)

## Support

For issues related to the SDK integration:
- Check the [OneLabs Discord](https://discord.gg/onelabs)
- Review the [API Documentation](https://docs.onelabs.cc)
- Submit issues to the OneNinja repository
