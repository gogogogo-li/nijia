# One Ninja - Test Suite

This directory contains automated and manual tests for the One Ninja game, focusing on OneChain blockchain integration.

## Directory Structure

```
tests/
├── integration/          # Integration tests
│   ├── chainInteraction.test.js  # Main OneChain flow tests
│   ├── jest.config.js           # Jest configuration
│   └── setup.js                 # Test setup
├── setup/                # Test setup utilities
│   └── onechainWalletSetup.js   # Wallet creation & funding
├── mocks/                # Mock implementations
│   └── mockOneWallet.js         # Mock OneWallet extension
└── README.md            # This file
```

## Prerequisites

```bash
# Install dependencies
npm install axios jest @types/jest

# Or add to package.json
npm install --save-dev axios jest @types/jest
```

## Running Tests

### Automated Integration Tests

```bash
# Run all integration tests
npm run test:integration

# Run specific test file
npm test -- tests/integration/chainInteraction.test.js

# Run with coverage
npm test -- --coverage
```

### Manual Test Script

```bash
# Run manual interaction test
node scripts/testOnechainInteraction.js
```

This script will:
1. Create a test wallet
2. Fund it via OneChain faucet
3. Check balance and account info
4. Submit test transactions
5. Display results

## What Gets Tested

### 1. Wallet Operations
- ✅ Wallet creation
- ✅ Wallet detection
- ✅ Connection flow
- ✅ Disconnection
- ✅ User rejection handling

### 2. Account Operations
- ✅ Balance retrieval
- ✅ Account info fetching
- ✅ Connection status check

### 3. Transactions
- ✅ Transaction signing
- ✅ Transaction submission
- ✅ Transaction confirmation
- ✅ Game score submission (when contract deployed)
- ✅ NFT minting (when contract deployed)

### 4. Message Signing
- ✅ Message signing
- ✅ Signature verification

## Mock OneWallet

The `MockOneWallet` class simulates the OneWallet browser extension without requiring the actual extension to be installed. This allows:

- Testing in CI/CD pipelines
- Local development without extension
- Automated testing
- Reproducible test environments

### Using Mock OneWallet

```javascript
import { MockOneWallet } from './tests/mocks/mockOneWallet.js';
import { createTestWallet } from './tests/setup/onechainWalletSetup.js';

// Create test wallet
const wallet = await createTestWallet();

// Install mock
MockOneWallet.install(wallet);

// Now window.onechain is available
const result = await window.onechain.aptos.connect();

// Cleanup
MockOneWallet.uninstall();
```

### Testing User Rejection

```javascript
// Install mock that simulates user rejection
MockOneWallet.installWithRejection(wallet);

const result = await window.onechain.aptos.connect();
// result.status === "Rejected"
```

## Test Environment Variables

Create `.env.test` file:

```bash
REACT_APP_ONECHAIN_RPC=https://testnet-rpc.onelabs.cc
REACT_APP_ONECHAIN_EXPLORER=https://testnet-explorer.onelabs.cc
REACT_APP_CONTRACT_ADDRESS=0x1  # Update with deployed contract
```

## CI/CD Integration

Add to `.github/workflows/test.yml`:

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run integration tests
        run: npm run test:integration
        env:
          ONECHAIN_RPC: https://testnet-rpc.onelabs.cc
```

## Troubleshooting

### API Not Available
If OneChain APIs are not available, tests will:
- Use mock responses
- Log warnings
- Continue with remaining tests
- Still validate code structure

### Transaction Timeout
- Increase timeout in `waitForTransaction()`
- Check network connectivity
- Verify OneChain testnet status

### Mock Wallet Issues
- Ensure `window` object is available
- Check that mock is installed before use
- Verify cleanup in `afterAll()` hooks

## Adding New Tests

1. Create test file in `tests/integration/`
2. Import setup utilities
3. Use `MockOneWallet` for wallet simulation
4. Add descriptive test names
5. Include cleanup in `afterAll()`

Example:

```javascript
import { createTestWallet } from '../setup/onechainWalletSetup.js';
import { MockOneWallet } from '../mocks/mockOneWallet.js';

describe('My New Feature', () => {
  let wallet;
  
  beforeAll(async () => {
    wallet = await createTestWallet();
    MockOneWallet.install(wallet);
  });
  
  afterAll(() => {
    MockOneWallet.uninstall();
  });
  
  test('should do something', async () => {
    // Your test here
  });
});
```

## Next Steps

1. Deploy smart contracts to testnet
2. Update `CONTRACT_ADDRESS` in tests
3. Run full integration test suite
4. Verify all transactions work end-to-end
5. Add performance benchmarks
6. Expand test coverage

## Resources

- [OneChain Documentation](https://docs.onelabs.cc)
- [Jest Documentation](https://jestjs.io)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
