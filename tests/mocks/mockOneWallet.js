/**
 * Mock OneWallet Extension
 * Simulates OneWallet browser extension for testing without the actual extension
 */

import axios from 'axios';

const ONECHAIN_RPC = 'https://testnet-rpc.onelabs.cc';

export class MockOneWallet {
  constructor(wallet) {
    this.wallet = wallet;
    this.connected = false;
  }

  /**
   * Install mock OneWallet on window object
   * @param {Object} wallet - Wallet object with address, privateKey, publicKey
   */
  static install(wallet) {
    console.log('🔧 Installing mock OneWallet...');
    
    window.onechain = {
      /**
       * Connect wallet
       * @returns {Promise<Object>}
       */
      connect: async () => {
        console.log('🔗 Mock OneWallet: connect() called');
        
        // Simulate user approval delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        return {
          address: wallet.address,
          publicKey: wallet.publicKey,
          status: "Approved"
        };
      },
      
      /**
       * Get account information
       * @returns {Promise<Object>}
       */
      account: async () => {
        console.log('👤 Mock OneWallet: account() called');
        return {
          address: wallet.address,
          publicKey: wallet.publicKey
        };
      },
      
      /**
       * Get current network
       * @returns {Promise<Object>}
       */
      network: async () => {
        console.log('🌐 Mock OneWallet: network() called');
        return {
          name: "testnet",
          chainId: 2,
          url: ONECHAIN_RPC
        };
      },
      
      /**
       * Sign and submit transaction
       * @param {Object} payload - Transaction payload
       * @returns {Promise<Object>}
       */
      signAndSubmitTransaction: async (payload) => {
        console.log('📝 Mock OneWallet: signAndSubmitTransaction() called');
        console.log('   Payload:', JSON.stringify(payload, null, 2));
        
        try {
          // Use OneChain API to submit transaction
          const signature = await signTransaction(wallet.privateKey, payload);
          
          const response = await axios.post(`${ONECHAIN_RPC}/v1/transactions/submit`, {
            sender: wallet.address,
            payload: payload,
            signature: signature
          });
          
          console.log('✅ Transaction submitted:', response.data.hash);
          return { hash: response.data.hash };
        } catch (error) {
          console.error('❌ Transaction failed:', error.message);
          
          // Return mock hash if API fails
          const mockHash = '0x' + Array(64).fill(0).map(() => 
            Math.floor(Math.random() * 16).toString(16)
          ).join('');
          
          return { hash: mockHash };
        }
      },
      
      /**
       * Sign message
       * @param {Object} options - Message options
       * @returns {Promise<Object>}
       */
      signMessage: async ({ message, nonce }) => {
        console.log('✍️  Mock OneWallet: signMessage() called');
        console.log('   Message:', message);
        
        try {
          const signature = await signMessage(wallet.privateKey, message, nonce);
          return {
            signature,
            fullMessage: message,
            nonce: nonce || Date.now()
          };
        } catch (error) {
          console.error('❌ Message signing failed:', error.message);
          return {
            signature: '0xmock_signature_' + Date.now(),
            fullMessage: message,
            nonce: nonce || Date.now()
          };
        }
      },
      
      /**
       * Get account resources
       * @returns {Promise<Array>}
       */
      getAccountResources: async () => {
        console.log('📦 Mock OneWallet: getAccountResources() called');
        
        try {
          const response = await axios.get(`${ONECHAIN_RPC}/v1/accounts/${wallet.address}/resources`);
          return response.data;
        } catch (error) {
          console.error('❌ Failed to get resources:', error.message);
          return [];
        }
      },
      
      /**
       * Disconnect wallet
       * @returns {Promise<Object>}
       */
      disconnect: async () => {
        console.log('🔌 Mock OneWallet: disconnect() called');
        return { status: "Disconnected" };
      },
        
      /**
       * Check if wallet is connected
       * @returns {Promise<boolean>}
       */
      isConnected: async () => {
        console.log('🔍 Mock OneWallet: isConnected() called');
        return true;
      }
    };
    
    console.log('✅ Mock OneWallet installed successfully');
    console.log('   Address:', wallet.address);
  }
  
  /**
   * Uninstall mock OneWallet
   */
  static uninstall() {
    console.log('🗑️  Uninstalling mock OneWallet...');
    delete window.onechain;
  }
  
  /**
   * Simulate user rejection
   */
  static installWithRejection(wallet) {
    console.log('🔧 Installing mock OneWallet (rejection mode)...');
    
    window.onechain = {
      connect: async () => {
        console.log('❌ Mock OneWallet: User rejected connection');
        await new Promise(resolve => setTimeout(resolve, 500));
        return {
          status: "Rejected"
        };
      },
      
      account: async () => {
        throw new Error('Wallet not connected');
      },
      
      network: async () => ({ name: "testnet", chainId: 2 }),
      
      disconnect: async () => ({ status: "Disconnected" })
    };
  }
}

/**
 * Sign transaction with private key
 * @param {string} privateKey - Private key
 * @param {Object} payload - Transaction payload
 * @returns {Promise<string>} Signature
 */
async function signTransaction(privateKey, payload) {
  try {
    const response = await axios.post(`${ONECHAIN_RPC}/v1/transactions/sign`, {
      privateKey,
      payload
    });
    return response.data.signature;
  } catch (error) {
    console.warn('⚠️  Using mock signature');
    return '0xmock_signature_' + Date.now();
  }
}

/**
 * Sign message with private key
 * @param {string} privateKey - Private key
 * @param {string} message - Message to sign
 * @param {number} nonce - Nonce
 * @returns {Promise<string>} Signature
 */
async function signMessage(privateKey, message, nonce) {
  try {
    const response = await axios.post(`${ONECHAIN_RPC}/v1/messages/sign`, {
      privateKey,
      message,
      nonce
    });
    return response.data.signature;
  } catch (error) {
    console.warn('⚠️  Using mock signature');
    return '0xmock_signature_' + Date.now();
  }
}
