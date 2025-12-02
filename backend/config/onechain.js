import dotenv from 'dotenv';

dotenv.config();

// OneChain configuration for backend
export const ONECHAIN_CONFIG = {
  // OneChain API endpoint
  apiEndpoint: process.env.ONECHAIN_API_ENDPOINT || 'https://api.onelabs.cc',
  
  // OneChain network (mainnet/testnet)
  network: process.env.ONECHAIN_NETWORK || 'testnet',
  
  // OneChain project credentials
  projectId: process.env.ONECHAIN_PROJECT_ID,
  apiKey: process.env.ONECHAIN_API_KEY,
  
  // Contract addresses for game NFTs and rewards
  gameContractAddress: process.env.GAME_CONTRACT_ADDRESS,
  
  // OneWallet configuration
  walletConfig: {
    appName: 'OneNinja',
    network: process.env.ONECHAIN_NETWORK || 'testnet',
  },
  
  // OneDEX configuration for token rewards
  dexConfig: {
    enabled: process.env.ONEDEX_ENABLED === 'true',
    rewardTokenAddress: process.env.REWARD_TOKEN_ADDRESS,
  },
  
  // OneID configuration for user authentication
  oneIdConfig: {
    enabled: process.env.ONEID_ENABLED === 'true',
    clientId: process.env.ONEID_CLIENT_ID,
  },
  
  // OneRWA configuration for NFT rewards
  rwaConfig: {
    enabled: process.env.ONERWA_ENABLED === 'true',
    nftCollectionAddress: process.env.NFT_COLLECTION_ADDRESS,
  }
};

// OneChain API client initialization
class OneChainClient {
  constructor(config) {
    this.config = config;
    this.baseUrl = config.apiEndpoint;
    this.headers = {
      'Content-Type': 'application/json',
      'X-API-Key': config.apiKey,
      'X-Project-Id': config.projectId,
    };
  }

  async request(endpoint, method = 'GET', data = null) {
    const options = {
      method,
      headers: this.headers,
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, options);
      
      if (!response.ok) {
        throw new Error(`OneChain API error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('OneChain API request failed:', error);
      throw error;
    }
  }

  // Get wallet balance
  async getWalletBalance(address) {
    return await this.request(`/wallet/balance/${address}`);
  }

  // Submit transaction
  async submitTransaction(txData) {
    return await this.request('/transaction/submit', 'POST', txData);
  }

  // Get transaction status
  async getTransactionStatus(txHash) {
    return await this.request(`/transaction/status/${txHash}`);
  }

  // Mint NFT
  async mintNFT(nftData) {
    return await this.request('/nft/mint', 'POST', nftData);
  }

  // Get user profile via OneID
  async getUserProfile(address) {
    return await this.request(`/identity/profile/${address}`);
  }

  // Get token price from OneDEX
  async getTokenPrice(tokenAddress) {
    return await this.request(`/dex/price/${tokenAddress}`);
  }
}

export const onechainClient = new OneChainClient(ONECHAIN_CONFIG);

console.log('✅ OneChain SDK initialized');
console.log(`📍 Network: ${ONECHAIN_CONFIG.network}`);
console.log(`📍 API Endpoint: ${ONECHAIN_CONFIG.apiEndpoint}`);
