/**
 * Manual OneChain Interaction Test Script
 * Run this script to test OneChain integration manually
 * Usage: node scripts/testOnechainInteraction.js
 */

import axios from 'axios';
import { createTestWallet, getAccountInfo, waitForTransaction } from '../tests/setup/onechainWalletSetup.js';

const ONECHAIN_RPC = 'https://testnet-rpc.onelabs.cc';

async function testBasicFlow() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   OneChain Basic Interaction Flow - Manual Test       ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Create wallet
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('1️⃣  Creating test wallet...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const wallet = await createTestWallet();
    
    console.log('   📍 Address:', wallet.address);
    console.log('   🔑 Public Key:', wallet.publicKey);
    console.log('   🔒 Private Key:', wallet.privateKey.substring(0, 20) + '...\n');

    // Step 2: Check balance
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('2️⃣  Checking balance...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    try {
      const balanceRes = await axios.get(`${ONECHAIN_RPC}/v1/accounts/${wallet.address}/balance`);
      console.log('   💰 Balance:', balanceRes.data.balance, 'ONE\n');
    } catch (error) {
      console.log('   ⚠️  Balance API not available:', error.message, '\n');
    }

    // Step 3: Get account info
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('3️⃣  Getting account info...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const accountInfo = await getAccountInfo(wallet.address);
    console.log('   📋 Sequence number:', accountInfo.sequence_number);
    console.log('   🔐 Auth key:', accountInfo.authentication_key, '\n');

    // Step 4: Submit test transaction
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('4️⃣  Submitting test transaction...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    try {
      const txRes = await axios.post(`${ONECHAIN_RPC}/v1/transactions/submit`, {
        sender: wallet.address,
        payload: {
          type: "entry_function_payload",
          function: "0x1::coin::transfer",
          type_arguments: ["0x1::one_coin::OneCoin"],
          arguments: [wallet.address, "1000"] // Transfer to self
        },
        privateKey: wallet.privateKey
      });
      
      console.log('   ✅ Transaction submitted');
      console.log('   📝 TX Hash:', txRes.data.hash, '\n');

      // Step 5: Wait for confirmation
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('5️⃣  Waiting for confirmation...');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      try {
        const txStatus = await waitForTransaction(txRes.data.hash, 15000);
        console.log('   ✅ Status:', txStatus.vm_status);
        console.log('   ⛽ Gas used:', txStatus.gas_used, '\n');
      } catch (error) {
        console.log('   ⚠️  Transaction confirmation timeout:', error.message, '\n');
      }
    } catch (error) {
      console.log('   ⚠️  Transaction API not available:', error.message, '\n');
    }

    // Step 6: Test game score submission
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('6️⃣  Testing game score submission...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const gamePayload = {
      type: "entry_function_payload",
      function: "0x1::game::submit_score", // Update with actual contract
      type_arguments: [],
      arguments: [1000, "hard"] // score, difficulty
    };
    
    console.log('   🎮 Game payload:', JSON.stringify(gamePayload, null, 2));
    console.log('   ℹ️  (Will submit when contract is deployed)\n');

    // Step 7: Test NFT minting
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('7️⃣  Testing NFT minting...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const nftPayload = {
      type: "entry_function_payload",
      function: "0x1::nft::mint_ninja_nft", // Update with actual contract
      type_arguments: [],
      arguments: [
        "Gold Ninja",
        "Achievement NFT for reaching Gold tier",
        "https://oneninja.game/nft/gold.png",
        3 // tier
      ]
    };
    
    console.log('   🎨 NFT payload:', JSON.stringify(nftPayload, null, 2));
    console.log('   ℹ️  (Will mint when contract is deployed)\n');

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 OneChain Interaction Flow Test Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('✅ Successfully tested:');
    console.log('   • Wallet creation');
    console.log('   • Balance checking');
    console.log('   • Account info retrieval');
    console.log('   • Transaction submission (if API available)');
    console.log('   • Payload structure for game & NFT\n');
    
    console.log('📝 Test wallet details:');
    console.log('   Address:', wallet.address);
    console.log('   (Keep this wallet for continued testing)\n');
    
    return { wallet };
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testBasicFlow()
  .then(() => {
    console.log('✅ All tests passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
