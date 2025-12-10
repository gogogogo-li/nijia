# OneLabs API SDK Integration

## Overview

OneNinja has been integrated with the official **@onelabs/sui** SDK for seamless interaction with the OneChain network. This provides a robust, type-safe interface to all OneLabs API services.

## Installation

The SDK is already installed in the project:

```bash
npm install @onelabs/sui
```

## Architecture

### SDK Client (`src/services/onelabsApiClient.js`)

The `OnelabsApiClient` class provides a unified interface to interact with:
- **Sui Blockchain** via OneLabs RPC
- **Game API** endpoints
- **NFT API** endpoints
- **Identity (OneID)** API
- **DEX (OneDEX)** API
- **Authentication** API

### Key Features

1. **SuiClient Integration**: Direct access to blockchain data
2. **Transaction Management**: Sign and execute transactions
3. **Balance Queries**: Get wallet balances and coin information
4. **Smart Contract Interactions**: Call Move functions on-chain
5. **API Request Handling**: Unified HTTP client with authentication

## Usage

### Import the Client

```javascript
import onelabsApiClient from './services/onelabsApiClient';
```

### Blockchain Operations

#### Get Balance
```javascript
const balance = await onelabsApiClient.getBalance(walletAddress);
console.log('Balance:', balance.totalBalance);
```

#### Get All Balances
```javascript
const balances = await onelabsApiClient.getAllBalances(walletAddress);
```

#### Get Transaction Details
```javascript
const tx = await onelabsApiClient.getTransaction(digest);
```

#### Get Owned Objects
```javascript
const objects = await onelabsApiClient.getOwnedObjects(walletAddress);
```

### Game API

#### Submit Score
```javascript
const result = await onelabsApiClient.submitScore(
  walletAddress,
  score,
  signature
);
```

#### Get Leaderboard
```javascript
const leaderboard = await onelabsApiClient.getLeaderboard(100);
```

#### Get Player Stats
```javascript
const stats = await onelabsApiClient.getPlayerStats(walletAddress);
```

#### Submit Slash Batch
```javascript
const result = await onelabsApiClient.submitSlashBatch(
  walletAddress,
  slashes,
  signature
);
```

#### Claim Reward
```javascript
const result = await onelabsApiClient.claimReward(
  walletAddress,
  amount,
  signature
);
```

### NFT API

#### Mint NFT
```javascript
const result = await onelabsApiClient.mintNFT(
  walletAddress,
  {
    name: 'OneNinja Achievement',
    description: 'Legendary score achievement',
    attributes: [
      { trait_type: 'Score', value: 1000 }
    ]
  },
  signature
);
```

### Identity API (OneID)

#### Get User Profile
```javascript
const profile = await onelabsApiClient.getUserProfile(walletAddress);
```

#### Update User Profile
```javascript
const result = await onelabsApiClient.updateUserProfile(
  walletAddress,
  {
    username: 'ninja_master',
    avatar: 'https://...'
  },
  signature
);
```

### DEX API (OneDEX)

#### Get Token Price
```javascript
const price = await onelabsApiClient.getTokenPrice('OCT');
```

#### Get Swap Quote
```javascript
const quote = await onelabsApiClient.getSwapQuote(
  'OCT',
  'USDT',
  1000000000
);
```

### Authentication

#### Verify Signature
```javascript
const isValid = await onelabsApiClient.verifyAuth(
  walletAddress,
  message,
  signature
);
```

### Transaction Building

#### Create Transaction Block
```javascript
const txb = onelabsApiClient.createTransactionBlock();

// Add transaction commands
txb.moveCall({
  target: '0x2::sui::transfer',
  arguments: [/* ... */]
});

// Execute transaction
const result = await onelabsApiClient.executeTransactionBlock(txb, signer);
```

### Utility Methods

#### Parse Amount
```javascript
// Convert 1.5 OCT to smallest unit (MIST)
const amount = onelabsApiClient.parseAmount(1.5, 9);
// Returns: 1500000000n (BigInt)
```

#### Format Amount
```javascript
// Convert 1500000000 MIST to OCT
const formatted = onelabsApiClient.formatAmount(1500000000, 9);
// Returns: 1.5
```

#### Get Network Info
```javascript
const info = await onelabsApiClient.getNetworkInfo();
console.log('Chain ID:', info.chainId);
console.log('Latest Checkpoint:', info.latestCheckpoint);
```

#### Health Check
```javascript
const isHealthy = await onelabsApiClient.healthCheck();
```

## Configuration

The SDK reads configuration from environment variables:

```env
# OneLabs API Configuration
REACT_APP_ONECHAIN_API=https://api.onelabs.cc
REACT_APP_ONECHAIN_RPC=https://rpc-testnet.onelabs.cc:443
REACT_APP_ONECHAIN_NETWORK=testnet
REACT_APP_ONECHAIN_PROJECT_ID=oneninja
```

## Service Integration

The `OneChainService` (`src/services/onechainService.js`) has been updated to use the API SDK:

```javascript
import onelabsApiClient from './onelabsApiClient';

class OneChainService {
  constructor() {
    // Initialize OneLabs API Client
    this.apiClient = onelabsApiClient;
    // ...
  }
  
  async getBalance() {
    const balance = await this.apiClient.getBalance(this.walletAddress);
    return this.apiClient.formatAmount(balance.totalBalance, 9);
  }
}
```

## API Endpoints

### Base URLs

- **Production API**: `https://api.onelabs.cc`
- **Testnet API**: `https://api.onelabs.cc` (with testnet flag)
- **Testnet RPC**: `https://rpc-testnet.onelabs.cc:443`

### Supported Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/game/score` | POST | Submit player score |
| `/game/leaderboard` | GET | Get leaderboard |
| `/game/state/{address}` | GET | Get player stats |
| `/game/slash-batch` | POST | Submit slash batch |
| `/game/reward` | POST | Claim rewards |
| `/nft/mint` | POST | Mint NFT |
| `/identity/profile/{address}` | GET | Get user profile |
| `/identity/profile/{address}` | PUT | Update profile |
| `/dex/price/{token}` | GET | Get token price |
| `/dex/quote` | POST | Get swap quote |
| `/auth/verify` | POST | Verify signature |
| `/transactions/{hash}` | GET | Get transaction status |
| `/health` | GET | Health check |

## Error Handling

All API methods include built-in error handling:

```javascript
try {
  const balance = await onelabsApiClient.getBalance(walletAddress);
} catch (error) {
  console.error('API Error:', error.message);
  // Handle error appropriately
}
```

## Best Practices

1. **Always check wallet connection** before making API calls
2. **Use try-catch blocks** for all API operations
3. **Cache results** when appropriate to reduce API calls
4. **Use the SDK's utility methods** for amount conversion
5. **Verify signatures** before submitting sensitive operations
6. **Check health status** before critical operations

## Migration from Direct Fetch

### Before
```javascript
const response = await fetch(
  `${this.ONECHAIN_CONFIG.apiEndpoint}/game/leaderboard`,
  {
    headers: {
      'Content-Type': 'application/json',
      'X-Project-Id': projectId,
    }
  }
);
const data = await response.json();
```

### After
```javascript
const data = await onelabsApiClient.getLeaderboard(100);
```

## Benefits

1. **Type Safety**: Full TypeScript support from @onelabs/sui
2. **Error Handling**: Consistent error handling across all methods
3. **Authentication**: Automatic header management
4. **Blockchain Access**: Direct Sui blockchain queries
5. **Maintainability**: Centralized API logic
6. **Testing**: Easier to mock for unit tests
7. **Documentation**: Clear method signatures and parameters

## Testing

Test the SDK integration:

```bash
npm run test:sdk
```

This will verify:
- SDK module loading
- Client initialization
- Network connectivity
- API method availability
- Utility functions
- Sui client access

## Resources

- [OneLabs Documentation](https://docs.onelabs.cc)
- [OneLabs API Reference](https://docs.onelabs.cc/API)
- [@onelabs/sui NPM Package](https://www.npmjs.com/package/@onelabs/sui)
- [Sui TypeScript SDK](https://sdk.mystenlabs.com/typescript)

## Support

For issues or questions about the OneLabs API SDK integration:
- Check the [OneLabs Discord](https://discord.gg/onelabs)
- Review [API Documentation](https://docs.onelabs.cc/API)
- Open an issue in the OneNinja repository
