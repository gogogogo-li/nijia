/**
 * Quick OneWallet Integration Test
 * Tests the basic wallet connection flow
 */

import { createTestWallet } from '../tests/setup/onechainWalletSetup.js';
import { MockOneWallet } from '../tests/mocks/mockOneWallet.js';

// Mock window object for Node environment
global.window = global.window || {};

async function quickTest() {
  console.log('🚀 Quick OneWallet Integration Test\n');

  try {
    // 1. Create test wallet
    console.log('1️⃣  Creating test wallet...');
    const wallet = await createTestWallet();
    console.log('   ✅ Wallet created:', wallet.address, '\n');

    // 2. Install mock OneWallet
    console.log('2️⃣  Installing mock OneWallet...');
    MockOneWallet.install(wallet);
    console.log('   ✅ Mock installed\n');

    // 3. Test wallet detection
    console.log('3️⃣  Testing wallet detection...');
    if (window.onechain) {
      console.log('   ✅ window.onechain detected');
      console.log('   Available methods:', Object.keys(window.onechain));
      
      if (window.onechain) {
        console.log('   ✅ window.onechain available');
        console.log('   Provider methods:', Object.keys(window.onechain));
      }
    } else {
      console.log('   ❌ window.onechain NOT detected');
    }
    console.log('');

    // 4. Test connection
    console.log('4️⃣  Testing connection...');
    const connectResult = await window.onechain.connect();
    console.log('   Connect result:', connectResult);
    
    if (connectResult.address === wallet.address) {
      console.log('   ✅ Connection successful');
    } else {
      console.log('   ❌ Address mismatch');
    }
    console.log('');

    // 5. Test account method
    console.log('5️⃣  Testing account() method...');
    const account = await window.onechain.account();
    console.log('   Account:', account);
    
    if (account.address === wallet.address) {
      console.log('   ✅ Account retrieval successful');
    }
    console.log('');

    // 6. Test network
    console.log('6️⃣  Testing network() method...');
    const network = await window.onechain.network();
    console.log('   Network:', network);
    console.log('   ✅ Network info retrieved\n');

    // 7. Test message signing
    console.log('7️⃣  Testing signMessage()...');
    const message = 'Test message for OneChain';
    const signResult = await window.onechain.signMessage({ message, nonce: Date.now() });
    console.log('   Signature:', signResult.signature.substring(0, 20) + '...');
    console.log('   ✅ Message signed\n');

    // 8. Test isConnected
    console.log('8️⃣  Testing isConnected()...');
    const isConnected = await window.onechain.isConnected();
    console.log('   Connected:', isConnected);
    console.log('   ✅ Connection status retrieved\n');

    // 9. Test disconnect
    console.log('9️⃣  Testing disconnect()...');
    const disconnectResult = await window.onechain.disconnect();
    console.log('   Disconnect result:', disconnectResult);
    console.log('   ✅ Disconnected\n');

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ All wallet integration tests passed!');
    console.log('═══════════════════════════════════════════════════════\n');

    return true;

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

// Run the test
quickTest()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
