/**
 * Jest Configuration for Integration Tests
 */

export default {
  // Use node environment for integration tests
  testEnvironment: 'node',
  
  // Transform ES modules
  transform: {},
  
  // Test file patterns
  testMatch: [
    '**/tests/integration/**/*.test.js'
  ],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.js'],
  
  // Module paths
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  
  // Coverage
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/index.js',
    '!src/**/*.test.js'
  ],
  
  // Timeout
  testTimeout: 30000,
  
  // Verbose output
  verbose: true,
  
  // Module file extensions
  moduleFileExtensions: ['js', 'jsx', 'json'],
  
  // Globals
  globals: {
    'process.env.REACT_APP_CONTRACT_ADDRESS': '0x1'
  }
};
