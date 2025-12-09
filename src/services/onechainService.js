// OneChain Service - Handles all blockchain interactions with OneChain network
// Integrates OneWallet, OneDEX, OneID, and OneRWA

class OneChainService {
  constructor() {
    this.walletConnected = false;
    this.walletAddress = null;
    this.walletProvider = null;
    this.sessionToken = null;
    this.userProfile = null;
    this.slashBuffer = [];
    this.BATCH_SIZE = 10;
    this.currentTokenId = 0;
    this.gameStartTime = null;
    this.listeners = new Set();
    
    // OneChain configuration
    this.ONECHAIN_CONFIG = {
      apiEndpoint: process.env.REACT_APP_ONECHAIN_API || 'https://api.onelabs.cc',
      rpcEndpoint: process.env.REACT_APP_ONECHAIN_RPC || 'https://rpc-testnet.onelabs.cc:443',
      network: process.env.REACT_APP_ONECHAIN_NETWORK || 'testnet',
      projectId: process.env.REACT_APP_ONECHAIN_PROJECT_ID || 'oneninja',
      gameContractAddress: process.env.REACT_APP_GAME_CONTRACT_ADDRESS,
      // OneChain Infrastructure Flags
      oneIdEnabled: process.env.REACT_APP_ONEID_ENABLED === 'true',
      oneIdClientId: process.env.REACT_APP_ONEID_CLIENT_ID,
      oneDexEnabled: process.env.REACT_APP_ONEDEX_ENABLED === 'true',
      rewardTokenAddress: process.env.REACT_APP_REWARD_TOKEN_ADDRESS,
      oneRwaEnabled: process.env.REACT_APP_ONERWA_ENABLED === 'true',
      nftCollectionAddress: process.env.REACT_APP_NFT_COLLECTION_ADDRESS,
    };
    
    // Wait for wallet to inject before restoring session
    this.waitForWallet().then(() => {
      this.restoreSession();
      this.setupWalletListeners();
    });
  }

  // Add event listener
  addEventListener(callback) {
    this.listeners.add(callback);
  }

  // Remove event listener
  removeEventListener(callback) {
    this.listeners.delete(callback);
  }

  // Notify all listeners
  notifyListeners(event, data) {
    this.listeners.forEach(callback => callback(event, data));
  }

  // Setup wallet event listeners
  setupWalletListeners() {
    const wallet = this.getWalletProvider();
    if (!wallet) return;

    const provider = wallet.provider;

    // Listen for account changes
    if (typeof provider.onAccountChange === 'function') {
      provider.onAccountChange((newAccount) => {
        console.log('🔄 Account changed:', newAccount);
        if (newAccount) {
          const address = typeof newAccount === 'string' ? newAccount : newAccount.address;
          if (address) {
            this.walletAddress = address;
            this.saveSession();
            this.notifyListeners('accountChanged', { address: this.walletAddress });
          }
        } else {
          this.handleDisconnect();
        }
      });
    }

    // Listen for network changes
    if (typeof provider.onNetworkChange === 'function') {
      provider.onNetworkChange((newNetwork) => {
        console.log('🌐 Network changed:', newNetwork);
        this.notifyListeners('networkChanged', { network: newNetwork });
      });
    }

    // Listen for disconnect
    if (typeof provider.onDisconnect === 'function') {
      provider.onDisconnect(() => {
        console.log('🔌 Wallet disconnected');
        this.handleDisconnect();
      });
    }
  }

  // Handle account change
  handleAccountChange(accounts) {
    if (accounts.length === 0) {
      this.handleDisconnect();
    } else {
      this.walletAddress = accounts[0];
      this.saveSession();
      this.notifyListeners('accountChanged', { address: this.walletAddress });
    }
  }

  // Handle disconnection
  handleDisconnect() {
    this.walletConnected = false;
    this.walletAddress = null;
    this.sessionToken = null;
    this.userProfile = null;
    this.clearSession();
    this.notifyListeners('disconnect', {});
  }

  // Save session to localStorage
  saveSession() {
    if (this.walletAddress) {
      const session = {
        address: this.walletAddress,
        provider: this.walletProvider,
        signature: this.sessionToken,
        timestamp: Date.now(),
        network: this.ONECHAIN_CONFIG.network,
        profile: this.userProfile
      };
      localStorage.setItem('onechain_session', JSON.stringify(session));
      console.log('💾 Session saved:', {
        address: session.address.substring(0, 10) + '...',
        authenticated: !!session.signature,
        timestamp: new Date(session.timestamp).toLocaleString()
      });
    }
  }

  // Clear session from localStorage
  clearSession() {
    localStorage.removeItem('onechain_session');
  }

  // Restore session from localStorage
  async restoreSession() {
    try {
      console.log('🔄 Attempting to restore session...');
      
      const sessionData = localStorage.getItem('onechain_session');
      if (!sessionData) {
        console.log('   No saved session found');
        return false;
      }

      const session = JSON.parse(sessionData);
      console.log('   Found session:', {
        address: session.address ? session.address.substring(0, 10) + '...' : 'none',
        age: Math.round((Date.now() - session.timestamp) / 1000 / 60) + ' minutes',
        authenticated: !!session.signature
      });
      
      // Check if session is less than 24 hours old
      const hoursSinceSession = (Date.now() - session.timestamp) / (1000 * 60 * 60);
      if (hoursSinceSession > 24) {
        console.log('   ❌ Session expired (>24 hours)');
        this.clearSession();
        return false;
      }

      // Wait for wallet
      await this.waitForWallet();

      // Verify with current wallet provider
      const wallet = this.getWalletProvider();
      if (!wallet) {
        console.log('   ❌ Wallet not available');
        this.clearSession();
        return false;
      }

      try {
        const provider = wallet.provider;
        
        // Try to get current account
        let account = null;
        if (typeof provider.account === 'function') {
          account = await provider.account();
        } else if (typeof provider.getAccount === 'function') {
          account = await provider.getAccount();
        } else if (provider.accounts && provider.accounts.length > 0) {
          account = { address: provider.accounts[0] };
        }
        
        if (account && account.address === session.address) {
          // Restore session state
          this.walletAddress = session.address;
          this.walletConnected = true;
          this.walletProvider = session.provider || wallet.name;
          this.sessionToken = session.signature;
          this.userProfile = session.profile;
          
          console.log('   ✅ Session restored successfully');
          console.log(`      Address: ${this.walletAddress}`);
          console.log(`      Authenticated: ${!!this.sessionToken ? 'YES' : 'NO'}`);
          
          // Setup event listeners
          this.setupWalletListeners();
          
          // Refresh profile if OneID enabled
          if (this.ONECHAIN_CONFIG.oneIdEnabled && !this.userProfile) {
            try {
              await this.fetchUserProfile();
            } catch (err) {
              console.warn('   ⚠️  Could not refresh profile:', err.message);
            }
          }
          
          // Notify listeners
          this.notifyListeners('sessionRestored', {
            address: this.walletAddress,
            profile: this.userProfile
          });
          
          return true;
        } else {
          console.log('   ❌ Address mismatch or account not found');
        }
      } catch (err) {
        console.log('   ❌ Session verification failed:', err.message);
      }
      
      this.clearSession();
      return false;
    } catch (error) {
      console.error('Error restoring session:', error);
      this.clearSession();
      return false;
    }
  }

  // Wait for wallet to be injected
  async waitForWallet(timeout = 3000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (window.onechain) {
        console.log('✅ OneWallet detected after', Date.now() - startTime, 'ms');
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log('⚠️ OneWallet not detected after', timeout, 'ms');
    return false;
  }

  // Get OneWallet provider
  getWalletProvider() {
    // OneWallet injects as window.onechain with multi-chain support
    if (window.onechain && typeof window.onechain === 'object') {
      console.log('✅ OneWallet detected, available methods:', Object.keys(window.onechain));
      
      // Check if there's a providers object with OneChain
      if (window.onechain.providers && typeof window.onechain.providers === 'object') {
        console.log('   Available providers:', Object.keys(window.onechain.providers));
        
        // Look for OneChain provider
        if (window.onechain.providers.onechain && typeof window.onechain.providers.onechain.connect === 'function') {
          console.log('   Using OneChain provider from providers object');
          return { provider: window.onechain.providers.onechain, name: 'OneWallet' };
        }
      }
      
      // Fallback: check if window.onechain has connect directly
      if (typeof window.onechain.connect === 'function') {
        console.log('   Using direct OneWallet provider');
        return { provider: window.onechain, name: 'OneWallet' };
      }
      
      // Last resort: check common chain providers that might support OneChain
      const chainOrder = ['ethereum', 'cosmos', 'sui', 'bitcoin'];
      for (const chain of chainOrder) {
        if (window.onechain[chain] && typeof window.onechain[chain].connect === 'function') {
          console.log(`   Using ${chain} provider as fallback`);
          return { provider: window.onechain[chain], name: 'OneWallet' };
        }
      }
      
      console.log('❌ No compatible provider found in OneWallet');
      console.log('   Available top-level keys:', Object.keys(window.onechain));
      if (window.onechain.providers) {
        console.log('   Available providers:', Object.keys(window.onechain.providers));
      }
      return null;
    }
    
    console.log('❌ OneWallet not found');
    return null;
  }

  // Connect OneWallet
  async connectWallet() {
    try {
      console.log('═══════════════════════════════════════════════════════');
      console.log('🔵 OneWallet Connection Flow Started');
      console.log('═══════════════════════════════════════════════════════\n');
      
      // STEP 1: Wait for wallet injection
      console.log('Step 1: Waiting for OneWallet...');
      await this.waitForWallet();
      
      // STEP 2: Get wallet provider
      console.log('\nStep 2: Getting wallet provider...');
      const wallet = this.getWalletProvider();
      if (!wallet) {
        throw new Error('OneWallet not detected. Please install the OneWallet extension and refresh the page.');
      }
      console.log(`✅ ${wallet.name} detected`);

      // STEP 3: Get provider instance
      console.log('\nStep 3: Accessing provider...');
      const provider = wallet.provider;
      if (!provider) {
        throw new Error('OneWallet provider not available');
      }
      console.log('✅ Provider ready:', Object.keys(provider).join(', '));

      // STEP 4: Request wallet connection
      console.log('\nStep 4: Requesting wallet connection...');
      if (typeof provider.connect !== 'function') {
        throw new Error('Provider does not support connect()');
      }
      
      const connectResult = await provider.connect();
      console.log('Connection result:', connectResult);

      // STEP 5: Handle connection response
      console.log('\nStep 5: Processing connection response...');
      if (connectResult && connectResult.status === 'Rejected') {
        throw new Error('Connection rejected by user');
      }

      // STEP 6: Retrieve account information
      console.log('\nStep 6: Retrieving account information...');
      let account = null;
      let address = null;
      
      // Try multiple methods to get account based on provider type
      if (connectResult && connectResult.address) {
        account = connectResult;
        address = connectResult.address;
        console.log('✅ Got account from connect result');
      } else if (connectResult && connectResult.status === 'Approved') {
        if (typeof provider.account === 'function') {
          account = await provider.account();
          console.log('✅ Got account from provider.account()');
          console.log('   Account object:', account);
          
          if (typeof account === 'string') {
            address = account;
          } else if (account && account.address) {
            address = account.address;
          }
        } else if (provider.accounts && provider.accounts.length > 0) {
          address = provider.accounts[0];
          account = { address };
          console.log('✅ Got account from provider.accounts');
        }
      } else {
        // Try getAccounts() for Sui/multi-chain wallets
        if (typeof provider.getAccounts === 'function') {
          console.log('   Trying provider.getAccounts()...');
          const accounts = await provider.getAccounts();
          console.log('   Accounts:', accounts);
          
          if (accounts && accounts.length > 0) {
            // Handle different account formats
            if (typeof accounts[0] === 'string') {
              address = accounts[0];
            } else if (accounts[0].address) {
              address = accounts[0].address;
            } else if (accounts[0].publicKey) {
              address = accounts[0].publicKey;
            }
            account = accounts[0];
            console.log('✅ Got account from provider.getAccounts()');
          }
        } else if (typeof provider.account === 'function') {
          account = await provider.account();
          console.log('✅ Got account from provider.account()');
          console.log('   Account object:', account);
          
          if (typeof account === 'string') {
            address = account;
          } else if (account && account.address) {
            address = account.address;
          } else if (account && account.publicKey) {
            address = account.publicKey;
          }
        } else if (provider.accounts && provider.accounts.length > 0) {
          address = provider.accounts[0];
          account = { address };
          console.log('✅ Got address from provider.accounts array');
        }
      }

      if (!address) {
        console.error('❌ Account retrieval details:');
        console.error('   connectResult:', connectResult);
        console.error('   account:', account);
        console.error('   provider.accounts:', provider.accounts);
        console.error('   provider methods:', Object.keys(provider));
        throw new Error('Failed to retrieve account information');
      }

      console.log(`✅ Account address: ${address}`);

      // STEP 7: Create authentication signature
      console.log('\nStep 7: Creating authentication signature...');
      let signature = null;
      let authMessage = null;
      
      try {
        const timestamp = Date.now();
        authMessage = `Welcome to OneNinja!

Please sign this message to authenticate your wallet.

Wallet Address: ${address}
Timestamp: ${timestamp}
Network: ${this.ONECHAIN_CONFIG.network || 'testnet'}

This signature will be used to verify your identity.`;

        if (typeof provider.signMessage === 'function') {
          const signResult = await provider.signMessage({
            message: authMessage,
            nonce: timestamp.toString()
          });
          
          signature = signResult.signature || signResult;
          console.log('✅ Authentication signature created');
          console.log(`   Signature: ${signature.substring(0, 20)}...${signature.substring(signature.length - 20)}`);
        } else {
          console.log('⚠️  Provider does not support signMessage()');
        }
      } catch (sigError) {
        console.warn('⚠️  Signature creation failed:', sigError.message);
        console.log('   Continuing without authentication signature');
      }

      // STEP 8: Get network information
      console.log('\nStep 8: Getting network information...');
      let network = null;
      try {
        if (typeof provider.network === 'function') {
          network = await provider.network();
        } else if (provider.network) {
          network = provider.network;
        }
        if (network) {
          console.log(`✅ Network: ${network.name || 'unknown'} (Chain ID: ${network.chainId || 'unknown'})`);
        }
      } catch (err) {
        console.warn('⚠️  Could not get network:', err.message);
      }

      // STEP 9: Initialize session
      console.log('\nStep 9: Initializing session...');
      this.walletAddress = address;
      this.walletProvider = wallet.name;
      this.walletConnected = true;
      this.sessionToken = signature;
      
      // Save to localStorage with signature
      this.saveSession();
      console.log('✅ Session saved to localStorage');

      // STEP 10: Fetch user profile (optional)
      if (this.ONECHAIN_CONFIG.oneIdEnabled) {
        console.log('\nStep 10: Fetching OneID profile...');
        try {
          await this.fetchUserProfile();
          console.log('✅ Profile fetched');
        } catch (err) {
          console.warn('⚠️  Profile fetch failed:', err.message);
        }
      }

      // STEP 11: Setup event listeners
      console.log('\nStep 11: Setting up event listeners...');
      this.setupWalletListeners();
      console.log('✅ Event listeners registered');

      // STEP 12: Notify success
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('✅ WALLET CONNECTED SUCCESSFULLY!');
      console.log('═══════════════════════════════════════════════════════');
      console.log(`   Address: ${address}`);
      console.log(`   Provider: ${this.walletProvider}`);
      console.log(`   Network: ${network ? network.name : 'unknown'}`);
      console.log(`   Authenticated: ${!!signature ? 'YES ✓' : 'NO ✗'}`);
      console.log(`   Profile: ${this.userProfile ? 'Loaded' : 'Not loaded'}`);
      console.log('═══════════════════════════════════════════════════════\n');
      
      this.notifyListeners('connected', { 
        address: this.walletAddress,
        profile: this.userProfile,
        signature: signature,
        authMessage: authMessage,
        network: network,
        timestamp: Date.now()
      });

      return {
        success: true,
        address: this.walletAddress,
        profile: this.userProfile,
        signature: signature,
        network: network,
        authenticated: !!signature
      };

    } catch (error) {
      console.error('\n═══════════════════════════════════════════════════════');
      console.error('❌ WALLET CONNECTION FAILED');
      console.error('═══════════════════════════════════════════════════════');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      console.error('═══════════════════════════════════════════════════════\n');
      
      // Clean up any partial state
      this.walletConnected = false;
      this.walletAddress = null;
      this.sessionToken = null;
      this.userProfile = null;
      this.clearSession();
      
      return {
        success: false,
        error: error.message || 'Failed to connect wallet'
      };
    }
  }

  // Disconnect wallet with full cleanup
  async disconnectWallet() {
    try {
      console.log('👋 Disconnecting wallet...');
      
      // Try to disconnect using the wallet provider
      const wallet = this.getWalletProvider();
      if (wallet) {
        const provider = wallet.provider;
        if (typeof provider.disconnect === 'function') {
          await provider.disconnect();
        }
      }
      
      this.walletConnected = false;
      this.walletProvider = null;
      this.walletAddress = null;
      this.sessionToken = null;
      this.userProfile = null;
      
      // Clear session storage
      this.clearSession();
      
      // Notify listeners
      this.notifyListeners('disconnect', {});
      
      console.log('✅ OneWallet disconnected successfully');
    } catch (error) {
      console.error('Error disconnecting OneWallet:', error);
    }
  }

  // Check if wallet is connected
  isWalletConnected() {
    return this.walletConnected && this.walletAddress !== null;
  }

  // Get wallet address
  getWalletAddress() {
    return this.walletAddress;
  }

  // Get wallet balance from OneChain
  async getBalance() {
    if (!this.isWalletConnected()) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log('🔍 Fetching balance for:', this.walletAddress);

      // Method 1: Try OneChain Testnet RPC
      try {
        const rpcUrl = 'https://rpc-testnet.onelabs.cc:443';
        console.log('   Trying OneChain Testnet RPC at:', rpcUrl);
        
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'suix_getBalance',
            params: [this.walletAddress]
          })
        });

        const data = await response.json();
        console.log('   RPC Response:', data);
        
        if (data.result && data.result.totalBalance !== undefined) {
          // Convert from MIST (smallest unit) to OCT (9 decimals, 1 OCT = 1,000,000,000 MIST)
          const balanceInOCT = Number(data.result.totalBalance) / 1_000_000_000;
          const formattedBalance = balanceInOCT.toFixed(4);
          
          console.log('✅ Balance from OneChain RPC:', formattedBalance, 'OCT');
          return {
            amount: formattedBalance,
            symbol: 'OCT'
          };
        } else if (data.error) {
          console.warn('   RPC returned error:', data.error);
        }
      } catch (rpcErr) {
        console.warn('   RPC balance fetch failed:', rpcErr.message);
      }

      // Method 2: Try to get balance from wallet provider directly
      const provider = this.getWalletProvider();
      
      if (provider && provider.provider) {
        const actualProvider = provider.provider;
        console.log('   Checking actual provider methods:', Object.keys(actualProvider).filter(k => k.includes('balance') || k.includes('Balance')));
        
        // Try getBalance from the actual Sui provider
        if (typeof actualProvider.getBalance === 'function') {
          try {
            console.log('   Calling actualProvider.getBalance()...');
            const result = await actualProvider.getBalance({ owner: this.walletAddress });
            console.log('   Provider balance result:', result);
            
            if (result && result.totalBalance) {
              const balanceInOCT = (Number(result.totalBalance) / 1_000_000_000).toFixed(4);
              console.log('✅ Balance from provider:', balanceInOCT, 'OCT');
              return {
                amount: balanceInOCT,
                symbol: 'OCT'
              };
            }
          } catch (err) {
            console.warn('   actualProvider.getBalance() failed:', err.message);
          }
        }

        // Try getAllBalances
        if (typeof actualProvider.getAllBalances === 'function') {
          try {
            console.log('   Calling actualProvider.getAllBalances()...');
            const result = await actualProvider.getAllBalances({ owner: this.walletAddress });
            console.log('   Provider all balances result:', result);
            
            if (result && result.length > 0) {
              const suiBalance = result.find(b => b.coinType === '0x2::sui::SUI');
              if (suiBalance && suiBalance.totalBalance) {
                const balanceInOCT = (Number(suiBalance.totalBalance) / 1_000_000_000).toFixed(4);
                console.log('✅ Balance from provider.getAllBalances():', balanceInOCT, 'OCT');
                return {
                  amount: balanceInOCT,
                  symbol: 'OCT'
                };
              }
            }
          } catch (err) {
            console.warn('   actualProvider.getAllBalances() failed:', err.message);
          }
        }
      }

      // Return zero if all methods fail
      console.warn('⚠️ All balance fetch methods failed, returning 0');
      return { amount: '0.0000', symbol: 'OCT' };

    } catch (error) {
      console.error('❌ Error fetching balance:', error);
      return { amount: '0.0000', symbol: 'OCT' };
    }
  }

  // Start a new game session
  startGameSession() {
    this.gameStartTime = Date.now();
    this.slashBuffer = [];
    console.log('🎮 Game session started');
  }

  // Record a slash action
  recordSlash(slashData) {
    const slash = {
      ...slashData,
      timestamp: Date.now()
    };
    
    this.slashBuffer.push(slash);
    
    // Auto-submit if buffer is full
    if (this.slashBuffer.length >= this.BATCH_SIZE) {
      this.submitSlashBatch();
    }
  }

  // Submit batch of slashes to OneChain
  async submitSlashBatch() {
    if (this.slashBuffer.length === 0) return;
    
    const batch = [...this.slashBuffer];
    this.slashBuffer = [];

    try {
      const response = await fetch(
        `${this.ONECHAIN_CONFIG.apiEndpoint}/game/slash-batch`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
          },
          body: JSON.stringify({
            walletAddress: this.walletAddress,
            slashes: batch,
            sessionStart: this.gameStartTime
          })
        }
      );

      if (response.ok) {
        console.log(`✅ Submitted ${batch.length} slashes to OneChain`);
      }
    } catch (error) {
      console.error('Error submitting slash batch:', error);
      // Re-add to buffer on failure
      this.slashBuffer.push(...batch);
    }
  }

  // Mint Game NFT using OneRWA
  async mintGameNFT(gameStats) {
    if (!this.isWalletConnected()) {
      return {
        success: false,
        error: 'Wallet not connected'
      };
    }

    try {
      console.log('🎨 Minting Game NFT on OneChain...');

      // Prepare NFT metadata
      const nftMetadata = {
        name: `OneNinja Achievement - Score ${gameStats.score}`,
        description: `Legendary achievement with ${gameStats.score} points, ${gameStats.combo} max combo`,
        attributes: [
          { trait_type: 'Score', value: gameStats.score },
          { trait_type: 'Max Combo', value: gameStats.combo },
          { trait_type: 'Accuracy', value: `${gameStats.accuracy}%` },
          { trait_type: 'Tier', value: gameStats.tier },
          { trait_type: 'Date', value: new Date().toISOString() }
        ],
        image: this.generateNFTImage(gameStats),
      };

      // Call OneChain API to mint NFT
      const response = await fetch(
        `${this.ONECHAIN_CONFIG.apiEndpoint}/nft/mint`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
          },
          body: JSON.stringify({
            walletAddress: this.walletAddress,
            contractAddress: this.ONECHAIN_CONFIG.gameContractAddress,
            metadata: nftMetadata
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to mint NFT');
      }

      const result = await response.json();

      console.log('✅ NFT Minted successfully:', result.transactionHash);

      return {
        success: true,
        transactionHash: result.transactionHash,
        tokenId: result.tokenId,
        explorerUrl: `https://explorer.onelabs.cc/tx/${result.transactionHash}`,
        name: nftMetadata.name,
        tier: gameStats.tier,
        score: gameStats.score
      };

    } catch (error) {
      console.error('❌ NFT Minting failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to mint NFT'
      };
    }
  }

  // Generate NFT image/emoji based on tier
  generateNFTImage(gameStats) {
    const tier = gameStats.tier;
    const emojiMap = {
      'Legendary': '👑',
      'Epic': '⚔️',
      'Rare': '🗡️',
      'Common': '🎮'
    };
    return emojiMap[tier] || '🎮';
  }

  // Fetch user profile via OneID
  async fetchUserProfile() {
    try {
      const response = await fetch(
        `${this.ONECHAIN_CONFIG.apiEndpoint}/identity/profile/${this.walletAddress}`,
        {
          headers: {
            'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
          }
        }
      );

      if (response.ok) {
        const profile = await response.json();
        console.log('✅ OneID Profile loaded:', profile);
        return profile;
      }
    } catch (error) {
      console.error('Error fetching OneID profile:', error);
    }
    return null;
  }

  // Get game state from OneChain
  async getGameState() {
    if (!this.isWalletConnected()) {
      return null;
    }

    try {
      const response = await fetch(
        `${this.ONECHAIN_CONFIG.apiEndpoint}/game/state/${this.walletAddress}`,
        {
          headers: {
            'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
          }
        }
      );

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error fetching game state:', error);
    }
    return null;
  }

  // Get leaderboard from OneChain
  async getLeaderboard(limit = 100) {
    try {
      const response = await fetch(
        `${this.ONECHAIN_CONFIG.apiEndpoint}/game/leaderboard?limit=${limit}`,
        {
          headers: {
            'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
          }
        }
      );

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    }
    return [];
  }

  // Get token price from OneDEX
  async getTokenPrice() {
    try {
      const response = await fetch(
        `${this.ONECHAIN_CONFIG.apiEndpoint}/dex/price/ONE`,
        {
          headers: {
            'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        return data.price;
      }
    } catch (error) {
      console.error('Error fetching token price:', error);
    }
    return null;
  }

  // Reward player with tokens via OneDEX
  async rewardPlayer(amount) {
    if (!this.isWalletConnected()) {
      return { success: false, error: 'Wallet not connected' };
    }

    try {
      const response = await fetch(
        `${this.ONECHAIN_CONFIG.apiEndpoint}/game/reward`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
          },
          body: JSON.stringify({
            walletAddress: this.walletAddress,
            amount: amount,
            currency: 'ONE'
          })
        }
      );

      if (response.ok) {
        const result = await response.json();
        return { success: true, ...result };
      }
    } catch (error) {
      console.error('Error rewarding player:', error);
    }
    return { success: false, error: 'Failed to reward player' };
  }

  // Sign and submit transaction to OneChain
  async signAndSubmitTransaction(transaction) {
    if (!this.isWalletConnected()) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log('═══════════════════════════════════════════════════════');
      console.log('📝 Transaction Signing Flow');
      console.log('═══════════════════════════════════════════════════════\n');
      
      const wallet = this.getWalletProvider();
      if (!wallet) {
        throw new Error('OneWallet not available');
      }

      const provider = wallet.provider;
      
      if (typeof provider.signAndSubmitTransaction !== 'function') {
        throw new Error('signAndSubmitTransaction method not available');
      }

      console.log('Transaction payload:', {
        type: transaction.type,
        function: transaction.function,
        arguments: transaction.arguments
      });
      
      console.log('\nRequesting signature from wallet...');
      const startTime = Date.now();
      
      const result = await provider.signAndSubmitTransaction(transaction);
      
      const duration = Date.now() - startTime;
      console.log(`\n✅ Transaction signed and submitted (${duration}ms)`);
      console.log('Transaction hash:', result.hash || result);
      console.log('═══════════════════════════════════════════════════════\n');
      
      // Store transaction reference
      this.lastTransaction = {
        hash: result.hash || result,
        timestamp: Date.now(),
        type: transaction.function || transaction.type
      };
      
      return {
        success: true,
        hash: result.hash || result,
        result,
        duration
      };
      
    } catch (error) {
      console.error('\n❌ Transaction failed:', error.message);
      console.error('═══════════════════════════════════════════════════════\n');
      throw error;
    }
  }

  // Wait for transaction confirmation
  async waitForTransaction(txHash, timeout = 30000) {
    console.log(`⏳ Waiting for transaction confirmation: ${txHash}`);
    
    const startTime = Date.now();
    const checkInterval = 1000; // Check every second
    
    while (Date.now() - startTime < timeout) {
      try {
        // Try to get transaction status from OneChain API
        const response = await fetch(
          `${this.ONECHAIN_CONFIG.apiEndpoint}/transactions/${txHash}`,
          {
            headers: {
              'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data.success || data.confirmed) {
            const duration = Date.now() - startTime;
            console.log(`✅ Transaction confirmed (${duration}ms)`);
            return {
              success: true,
              confirmed: true,
              data,
              duration
            };
          }
        }
      } catch (err) {
        // Continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    throw new Error('Transaction confirmation timeout');
  }

  // Sign message with OneWallet
  async signMessage(message, nonce) {
    if (!this.isWalletConnected()) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log('═══════════════════════════════════════════════════════');
      console.log('✍️  Message Signing Flow');
      console.log('═══════════════════════════════════════════════════════\n');
      
      const wallet = this.getWalletProvider();
      if (!wallet) {
        throw new Error('OneWallet not available');
      }

      const provider = wallet.provider;
      
      if (typeof provider.signMessage !== 'function') {
        throw new Error('signMessage method not available');
      }

      const timestamp = nonce || Date.now();
      const payload = {
        message,
        nonce: timestamp.toString()
      };

      console.log('Message to sign:', message.substring(0, 100) + '...');
      console.log('Nonce:', payload.nonce);
      console.log('\nRequesting signature from wallet...');
      
      const startTime = Date.now();
      const result = await provider.signMessage(payload);
      const duration = Date.now() - startTime;
      
      const signature = result.signature || result;
      console.log(`\n✅ Message signed (${duration}ms)`);
      console.log('Signature:', signature.substring(0, 20) + '...' + signature.substring(signature.length - 20));
      console.log('═══════════════════════════════════════════════════════\n');
      
      return {
        signature,
        fullMessage: message,
        nonce: payload.nonce,
        address: this.walletAddress,
        timestamp
      };
      
    } catch (error) {
      console.error('\n❌ Message signing failed:', error.message);
      console.error('═══════════════════════════════════════════════════════\n');
      throw error;
    }
  }

  // Verify signature (for authentication)
  async verifySignature(message, signature, address) {
    try {
      console.log('🔍 Verifying signature...');
      
      // Call OneChain API to verify signature
      const response = await fetch(
        `${this.ONECHAIN_CONFIG.apiEndpoint}/auth/verify`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Project-Id': this.ONECHAIN_CONFIG.projectId,
          },
          body: JSON.stringify({
            message,
            signature,
            address
          })
        }
      );

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Signature verification:', result.valid ? 'VALID' : 'INVALID');
        return result.valid;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Signature verification failed:', error);
      return false;
    }
  }

  // Get network information
  async getNetwork() {
    try {
      const wallet = this.getWalletProvider();
      if (!wallet) {
        return null;
      }

      const provider = wallet.provider;
      
      if (typeof provider.network === 'function') {
        return await provider.network();
      } else if (provider.network) {
        return provider.network;
      }
      
      return null;
    } catch (error) {
      console.error('Error getting network:', error);
      return null;
    }
  }

  // Check if wallet is installed
  isWalletInstalled() {
    return !!window.onechain;
  }

  // Get wallet state for debugging
  getState() {
    return {
      connected: this.walletConnected,
      address: this.walletAddress,
      provider: this.walletProvider,
      profile: this.userProfile,
      hasSessionToken: !!this.sessionToken
    };
  }
}

// Export singleton instance
const onechainService = new OneChainService();
export default onechainService;
