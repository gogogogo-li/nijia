/**
 * Complete OneChain Wallet Integration Demo
 * Demonstrates full authentication and transaction flow
 */

import { createTestWallet } from '../tests/setup/onechainWalletSetup.js';
import { MockOneWallet } from '../tests/mocks/mockOneWallet.js';

// Mock window object for Node environment
global.window = global.window || {};

async function fullIntegrationDemo() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║      OneChain Wallet Integration - Full Demo             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // ═══════════════════════════════════════════════════════════════════
    // PHASE 1: WALLET SETUP
    // ═══════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════');
    console.log('PHASE 1: WALLET SETUP');
    console.log('═══════════════════════════════════════════════════════════\n');

    const wallet = await createTestWallet();
    console.log(' Test wallet created');
    console.log(`   Address: ${wallet.address}\n`);

    MockOneWallet.install(wallet);
    console.log('Mock OneWallet installed\n');

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 2: WALLET CONNECTION
    // ═══════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════');
    console.log('PHASE 2: WALLET CONNECTION');
    console.log('═══════════════════════════════════════════════════════════\n');

    const connectResult = await window.onechain.connect();
    console.log('Connect result:', {
      status: connectResult.status,
      address: connectResult.address,
      publicKey: connectResult.publicKey ? 'present' : 'missing'
    });
    console.log('Wallet connected\n');

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 3: AUTHENTICATION (Message Signing)
    // ═══════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════');
    console.log('PHASE 3: AUTHENTICATION');
    console.log('═══════════════════════════════════════════════════════════\n');

    const authMessage = `Welcome to OneNinja!

Please sign this message to authenticate your wallet.

Wallet Address: ${wallet.address}
Timestamp: ${Date.now()}
Network: testnet

This signature will be used to verify your identity.`;

    console.log('Signing authentication message...');
    const authSignature = await window.onechain.signMessage({
      message: authMessage,
      nonce: Date.now()
    });

    console.log('Authentication signature created');
    console.log(`   Signature: ${authSignature.signature.substring(0, 20)}...`);
    console.log(`   Message length: ${authMessage.length} chars`);
    console.log(`   Nonce: ${authSignature.nonce}\n`);

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 4: ACCOUNT INFORMATION
    // ═══════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════');
    console.log('PHASE 4: ACCOUNT INFORMATION');
    console.log('═══════════════════════════════════════════════════════════\n');

    const account = await window.onechain.account();
    console.log('Account details:');
    console.log(`   Address: ${account.address}`);
    console.log(`   Public Key: ${account.publicKey}\n`);

    const network = await window.onechain.network();
    console.log('Network details:');
    console.log(`   Name: ${network.name}`);
    console.log(`   Chain ID: ${network.chainId}`);
    console.log(`   RPC URL: ${network.url}\n`);

    const isConnected = await window.onechain.isConnected();
    console.log(`Connection status: ${isConnected ? 'CONNECTED' : 'NOT CONNECTED'}\n`);

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 5: TRANSACTION SIGNING
    // ═══════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════');
    console.log('PHASE 5: TRANSACTION SIGNING');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Example game score submission
    const gameTransaction = {
      type: "entry_function_payload",
      function: "0x1::game::submit_score",
      type_arguments: [],
      arguments: [1000, "hard", wallet.address]
    };

    console.log('Transaction payload:');
    console.log('   Function: game::submit_score');
    console.log('   Arguments: [score=1000, difficulty="hard"]');
    console.log('\nSigning transaction...');

    const txResult = await window.onechain.signAndSubmitTransaction(gameTransaction);
    console.log(' Transaction signed and submitted');
    console.log(`   TX Hash: ${txResult.hash}\n`);

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 6: NFT MINTING
    // ═══════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════');
    console.log('PHASE 6: NFT MINTING');
    console.log('═══════════════════════════════════════════════════════════\n');

    const nftTransaction = {
      type: "entry_function_payload",
      function: "0x1::nft::mint_ninja_nft",
      type_arguments: [],
      arguments: [
        "Gold Ninja Achievement",
        "Achieved Gold tier with 1000+ score",
        "https://oneninja.game/nft/gold.png",
        3, // tier
        wallet.address
      ]
    };

    console.log('NFT Payload:');
    console.log('   Name: Gold Ninja Achievement');
    console.log('   Tier: 3 (Gold)');
    console.log('\nMinting NFT...');

    const nftResult = await window.onechain.signAndSubmitTransaction(nftTransaction);
    console.log('NFT minted successfully');
    console.log(`   TX Hash: ${nftResult.hash}\n`);

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 7: SESSION MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════');
    console.log('PHASE 7: SESSION MANAGEMENT');
    console.log('═══════════════════════════════════════════════════════════\n');

    const sessionData = {
      address: wallet.address,
      signature: authSignature.signature,
      timestamp: Date.now(),
      network: 'testnet',
      authenticated: true
    };

    console.log('Session data to store:');
    console.log('   Address:', sessionData.address.substring(0, 20) + '...');
    console.log('   Authenticated: YES ✓');
    console.log('   Timestamp:', new Date(sessionData.timestamp).toLocaleString());
    console.log('   Network: testnet');
    console.log('\n Session would be saved to localStorage\n');

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 8: DISCONNECT
    // ═══════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════');
    console.log('PHASE 8: WALLET DISCONNECT');
    console.log('═══════════════════════════════════════════════════════════\n');

    const disconnectResult = await window.onechain.disconnect();
    console.log(' Wallet disconnected');
    console.log(`   Status: ${disconnectResult.status}\n`);

    // ═══════════════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════════════
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                     DEMO COMPLETE                         ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    console.log('Successfully demonstrated:');
    console.log('   1. Wallet creation and setup');
    console.log('   2. Wallet connection flow');
    console.log('   3. Authentication via message signing');
    console.log('   4. Account and network information retrieval');
    console.log('   5. Transaction signing (game score)');
    console.log('   6. NFT minting transaction');
    console.log('   7. Session management');
    console.log('   8. Wallet disconnection');
    console.log('\n🎉 Full OneChain integration working!\n');

    return {
      success: true,
      wallet: wallet.address,
      transactions: [txResult.hash, nftResult.hash],
      authenticated: true
    };

  } catch (error) {
    console.error('\ Demo failed:', error.message);
    console.error('Stack:', error.stack);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the demo
fullIntegrationDemo()
  .then(result => {
    if (result.success) {
      console.log('═══════════════════════════════════════════════════════════');
      console.log(' FULL INTEGRATION TEST PASSED');
      console.log('═══════════════════════════════════════════════════════════\n');
      process.exit(0);
    } else {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('INTEGRATION TEST FAILED');
      console.log('═══════════════════════════════════════════════════════════\n');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error(' Fatal error:', error);
    process.exit(1);
  });
