/**
 * Jest Setup for Integration Tests
 * Configures global test environment
 */

// Mock browser globals for Node environment
global.window = {
  onechain: undefined
};

global.document = {
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
};

// Set test timeout
jest.setTimeout(30000);

// Suppress console warnings during tests (optional)
const originalWarn = console.warn;
const originalError = console.error;

beforeAll(() => {
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console.warn = originalWarn;
  console.error = originalError;
});

// Setup test environment variables
process.env.REACT_APP_ONECHAIN_RPC = 'https://testnet-rpc.onelabs.cc';
process.env.REACT_APP_ONECHAIN_EXPLORER = 'https://testnet-explorer.onelabs.cc';
process.env.REACT_APP_CONTRACT_ADDRESS = '0x1';
