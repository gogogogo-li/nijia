// OneLabs API SDK Client
// Official integration with OneLabs API endpoints
import { SuiClient } from '@onelabs/sui/client';
import { Transaction } from '@onelabs/sui/transactions';
import { verifyPersonalMessageSignature } from '@onelabs/sui/verify';

/**
 * OneLabs API Client
 * Provides a unified interface to interact with OneLabs API services
 */
class OnelabsApiClient {
  constructor(config = {}) {
    // Backend proxy URL for RPC calls (bypasses CORS)
    // Use REACT_APP_API_BASE_URL for consistency with multiplayer service
    const backendUrl = process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

    this.config = {
      apiEndpoint: config.apiEndpoint || process.env.REACT_APP_ONECHAIN_API || 'https://api.onelabs.cc',
      // Use backend proxy for RPC to bypass CORS
      rpcEndpoint: config.rpcEndpoint || `${backendUrl}/api/rpc`,
      // Keep original RPC URL for reference
      originalRpcEndpoint: process.env.REACT_APP_ONECHAIN_RPC || 'https://rpc-testnet.onelabs.cc:443',
      network: config.network || process.env.REACT_APP_ONECHAIN_NETWORK || 'testnet',
      projectId: config.projectId || process.env.REACT_APP_ONECHAIN_PROJECT_ID || 'oneninja',
      timeout: config.timeout || 30000, // 30 seconds default
    };

    // Initialize Sui client with backend RPC proxy
    this.suiClient = new SuiClient({
      url: this.config.rpcEndpoint
    });

    // API request headers
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'X-Project-Id': this.config.projectId,
    };

    console.log('📡 OnelabsApiClient initialized with RPC proxy:', this.config.rpcEndpoint);
  }

  /**
   * Make authenticated API request
   */
  async makeRequest(endpoint, options = {}) {
    const url = `${this.config.apiEndpoint}${endpoint}`;
    const headers = {
      ...this.defaultHeaders,
      ...options.headers,
    };

    const config = {
      method: options.method || 'GET',
      headers,
      ...options,
    };

    // Add body if present
    if (options.body) {
      config.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error.message || `API request failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API Request Error:', error);
      throw error;
    }
  }

  /**
   * Get Sui Client instance
   */
  getSuiClient() {
    return this.suiClient;
  }

  /**
   * Get wallet balance
   */
  async getBalance(address) {
    console.log('📊 OnelabsApiClient.getBalance() called');
    console.log('   Address:', address);
    console.log('   RPC Endpoint:', this.config.rpcEndpoint);

    try {
      const startTime = Date.now();
      const balance = await this.suiClient.getBalance({
        owner: address,
      });
      const duration = Date.now() - startTime;

      console.log('   RPC Response time:', duration, 'ms');
      console.log('   Response:', JSON.stringify(balance));

      return balance;
    } catch (error) {
      console.error('❌ OnelabsApiClient.getBalance() error:');
      console.error('   Error name:', error.name);
      console.error('   Error message:', error.message);
      if (error.cause) console.error('   Error cause:', error.cause);
      throw error;
    }
  }

  /**
   * Get all coin balances for an address
   */
  async getAllBalances(address) {
    try {
      const balances = await this.suiClient.getAllBalances({
        owner: address,
      });
      return balances;
    } catch (error) {
      console.error('Error fetching all balances:', error);
      throw error;
    }
  }

  /**
   * Get transaction details
   */
  async getTransaction(digest) {
    try {
      const tx = await this.suiClient.getTransactionBlock({
        digest,
        options: {
          showInput: true,
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });
      return tx;
    } catch (error) {
      console.error('Error fetching transaction:', error);
      throw error;
    }
  }

  /**
   * Get objects owned by address
   */
  async getOwnedObjects(address, options = {}) {
    try {
      const objects = await this.suiClient.getOwnedObjects({
        owner: address,
        ...options,
      });
      return objects;
    } catch (error) {
      console.error('Error fetching owned objects:', error);
      throw error;
    }
  }

  /**
   * Get object details
   */
  async getObject(objectId, options = {}) {
    try {
      const object = await this.suiClient.getObject({
        id: objectId,
        options: {
          showContent: true,
          showOwner: true,
          showType: true,
          ...options,
        },
      });
      return object;
    } catch (error) {
      console.error('Error fetching object:', error);
      throw error;
    }
  }

  /**
   * Execute transaction block
   */
  async executeTransactionBlock(txb, signer) {
    try {
      const result = await this.suiClient.signAndExecuteTransactionBlock({
        transactionBlock: txb,
        signer,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });
      return result;
    } catch (error) {
      console.error('Error executing transaction:', error);
      throw error;
    }
  }

  /**
   * Verify personal message signature
   */
  async verifySignature(message, signature, publicKey) {
    try {
      const isValid = await verifyPersonalMessageSignature(
        message,
        signature,
        publicKey
      );
      return isValid;
    } catch (error) {
      console.error('Error verifying signature:', error);
      throw error;
    }
  }

  /**
   * Game API - Submit score
   */
  async submitScore(walletAddress, score, signature) {
    return this.makeRequest('/game/score', {
      method: 'POST',
      body: {
        address: walletAddress,
        score,
        signature,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Game API - Get leaderboard
   */
  async getLeaderboard(limit = 100) {
    return this.makeRequest(`/game/leaderboard?limit=${limit}`);
  }

  /**
   * Game API - Get player stats
   */
  async getPlayerStats(walletAddress) {
    return this.makeRequest(`/game/state/${walletAddress}`);
  }

  /**
   * Game API - Submit slash batch
   */
  async submitSlashBatch(walletAddress, slashes, signature) {
    return this.makeRequest('/game/slash-batch', {
      method: 'POST',
      body: {
        address: walletAddress,
        slashes,
        signature,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Game API - Claim reward
   */
  async claimReward(walletAddress, amount, signature) {
    return this.makeRequest('/game/reward', {
      method: 'POST',
      body: {
        address: walletAddress,
        amount,
        signature,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * NFT API - Mint NFT
   */
  async mintNFT(walletAddress, metadata, signature) {
    return this.makeRequest('/nft/mint', {
      method: 'POST',
      body: {
        address: walletAddress,
        metadata,
        signature,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Identity API - Get user profile
   */
  async getUserProfile(walletAddress) {
    return this.makeRequest(`/identity/profile/${walletAddress}`);
  }

  /**
   * Identity API - Update user profile
   */
  async updateUserProfile(walletAddress, profileData, signature) {
    return this.makeRequest(`/identity/profile/${walletAddress}`, {
      method: 'PUT',
      body: {
        ...profileData,
        signature,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * DEX API - Get token price
   */
  async getTokenPrice(tokenSymbol) {
    return this.makeRequest(`/dex/price/${tokenSymbol}`);
  }

  /**
   * DEX API - Get swap quote
   */
  async getSwapQuote(fromToken, toToken, amount) {
    return this.makeRequest('/dex/quote', {
      method: 'POST',
      body: {
        fromToken,
        toToken,
        amount,
      },
    });
  }

  /**
   * Auth API - Verify signature
   */
  async verifyAuth(walletAddress, message, signature) {
    return this.makeRequest('/auth/verify', {
      method: 'POST',
      body: {
        address: walletAddress,
        message,
        signature,
      },
    });
  }

  /**
   * Transaction API - Get transaction status
   */
  async getTransactionStatus(txHash) {
    return this.makeRequest(`/transactions/${txHash}`);
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.config.apiEndpoint}/health`);
      return response.ok;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  /**
   * Get network info
   */
  async getNetworkInfo() {
    try {
      const chainId = await this.suiClient.getChainIdentifier();
      const latestCheckpoint = await this.suiClient.getLatestCheckpointSequenceNumber();

      return {
        chainId,
        latestCheckpoint,
        rpcEndpoint: this.config.rpcEndpoint,
        network: this.config.network,
      };
    } catch (error) {
      console.error('Error fetching network info:', error);
      throw error;
    }
  }

  /**
   * Create transaction block helper
   */
  createTransactionBlock() {
    return new Transaction();
  }

  /**
   * Parse amount with decimals
   */
  parseAmount(amount, decimals = 9) {
    // eslint-disable-next-line no-undef
    return BigInt(Math.floor(amount * Math.pow(10, decimals)));
  }

  /**
   * Format amount from smallest unit
   */
  formatAmount(amount, decimals = 9) {
    return Number(amount) / Math.pow(10, decimals);
  }
}

// Create singleton instance
const onelabsApiClient = new OnelabsApiClient();

export default onelabsApiClient;
export { OnelabsApiClient };
