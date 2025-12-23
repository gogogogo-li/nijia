#!/usr/bin/env node
/**
 * OneNinja Reproducible Test Flows
 * 
 * Run: node test-flows.js
 * 
 * This script automates key test scenarios for OneChain stress testing.
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const RPC_URL = 'https://fullnode.testnet.onechain.one:443';
const NFT_PACKAGE_ID = '0xefbf58fa278a268ca39cd656fecc57bde056088f9eeaaa25db171459732c5ace';

// Test wallet (for automated testing only - use a dedicated stress test wallet)
const TEST_WALLET = process.env.TEST_WALLET_ADDRESS || '0x2dc4fb35ae67a7b88316e7548cb68c062ac1fba9e2b2608b0764f6cc20938d5b';

async function rpcCall(method, params) {
    const response = await fetch(`${BACKEND_URL}/api/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method,
            params
        })
    });
    return response.json();
}

// ============================================
// TEST FLOW 1: Verify Wallet Has NFTs
// ============================================
async function testFlow1_VerifyWalletNFTs() {
    console.log(' TEST FLOW 1: Verify Wallet NFTs');
    console.log('='.repeat(50));

    try {
        const result = await rpcCall('suix_getOwnedObjects', [
            TEST_WALLET,
            {
                filter: { StructType: `${NFT_PACKAGE_ID}::game_nft::GameNFT` },
                options: { showType: true, showContent: true }
            }
        ]);

        const nfts = result.result?.data || [];
        console.log(`✅ Found ${nfts.length} GameNFTs for wallet`);

        nfts.forEach((nft, i) => {
            const fields = nft.data?.content?.fields;
            console.log(`   NFT ${i + 1}: ${fields?.tier || 'Unknown'} - Score: ${fields?.score || 0}`);
        });

        return { success: true, nftCount: nfts.length };
    } catch (error) {
        console.log(`❌ FAILED: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// ============================================
// TEST FLOW 2: Check Backend Health
// ============================================
async function testFlow2_BackendHealth() {
    console.log('\n📋 TEST FLOW 2: Backend Health Check');
    console.log('='.repeat(50));

    try {
        const start = Date.now();
        const response = await fetch(`${BACKEND_URL}/api/rpc`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'sui_getLatestCheckpointSequenceNumber',
                params: []
            })
        });
        const latency = Date.now() - start;

        if (response.ok) {
            const data = await response.json();
            console.log(`✅ Backend responding - Latency: ${latency}ms`);
            console.log(`   Latest checkpoint: ${data.result}`);
            return { success: true, latency };
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.log(`❌ FAILED: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// ============================================
// TEST FLOW 3: Verify NFT Contract Exists
// ============================================
async function testFlow3_VerifyContract() {
    console.log('TEST FLOW 3: Verify NFT Contract');
    console.log('='.repeat(50));

    try {
        const result = await rpcCall('sui_getObject', [
            NFT_PACKAGE_ID,
            { showContent: true }
        ]);

        if (result.result?.data) {
            console.log(`✅ NFT Contract exists at: ${NFT_PACKAGE_ID.slice(0, 20)}...`);
            return { success: true };
        } else {
            throw new Error('Contract not found');
        }
    } catch (error) {
        console.log(`❌ FAILED: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// ============================================
// TEST FLOW 4: WebSocket Connection Test
// ============================================
async function testFlow4_WebSocketTest() {
    console.log('TEST FLOW 4: WebSocket Connection');
    console.log('='.repeat(50));

    return new Promise((resolve) => {
        try {
            const { io } = require('socket.io-client');
            const socket = io(BACKEND_URL, {
                transports: ['websocket'],
                timeout: 5000
            });

            const timeout = setTimeout(() => {
                socket.disconnect();
                console.log(`❌ FAILED: Connection timeout`);
                resolve({ success: false, error: 'timeout' });
            }, 5000);

            socket.on('connect', () => {
                clearTimeout(timeout);
                console.log(`✅ WebSocket connected - ID: ${socket.id}`);
                socket.disconnect();
                resolve({ success: true });
            });

            socket.on('connect_error', (err) => {
                clearTimeout(timeout);
                console.log(`❌ FAILED: ${err.message}`);
                resolve({ success: false, error: err.message });
            });
        } catch (error) {
            console.log(`❌ FAILED: ${error.message}`);
            resolve({ success: false, error: error.message });
        }
    });
}

// ============================================
// MAIN: Run All Test Flows
// ============================================
async function runAllTests() {
    console.log('OneNinja Reproducible Test Flows');
    console.log('='.repeat(50));
    console.log(`Backend: ${BACKEND_URL}`);
    console.log(`Wallet: ${TEST_WALLET.slice(0, 10)}...`);
    console.log(`NFT Package: ${NFT_PACKAGE_ID.slice(0, 10)}...`);

    const results = {
        flow1: await testFlow1_VerifyWalletNFTs(),
        flow2: await testFlow2_BackendHealth(),
        flow3: await testFlow3_VerifyContract(),
        flow4: await testFlow4_WebSocketTest()
    };

    // Summary
    console.log(' TEST SUMMARY');
    console.log('='.repeat(50));
    const passed = Object.values(results).filter(r => r.success).length;
    const total = Object.keys(results).length;

    console.log(`Flow 1 (Wallet NFTs):   ${results.flow1.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Flow 2 (Backend):       ${results.flow2.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Flow 3 (Contract):      ${results.flow3.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Flow 4 (WebSocket):     ${results.flow4.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log('='.repeat(50));
    console.log(`TOTAL: ${passed}/${total} passed\n`);

    process.exit(passed === total ? 0 : 1);
}

runAllTests().catch(console.error);
