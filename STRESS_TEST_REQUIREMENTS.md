# OneNinja Stress Test Preparation
## Acceptance Requirements

---

## 1. Performance Benchmarks

### Frontend (React App)
| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| Initial Load Time | < 3s | < 5s |
| Game Loop FPS | ≥ 60 FPS | ≥ 30 FPS |
| Memory Usage | < 150MB | < 300MB |
| Input Latency | < 16ms | < 50ms |

### Backend (Node.js Server)
| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| API Response Time | < 100ms | < 500ms |
| WebSocket Latency | < 50ms | < 200ms |
| Concurrent Connections | 500+ | 100 minimum |
| Memory per Connection | < 2MB | < 5MB |

### Blockchain (OneChain Testnet)
| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| Transaction Confirmation | < 3s | < 10s |
| NFT Mint Success Rate | > 99% | > 95% |
| RPC Response Time | < 500ms | < 2s |

---

## 2. Load Test Scenarios

### Scenario A: Single Player Peak Load
- **Objective**: Verify game performance under heavy single-player usage
- **Load**: 100 concurrent single-player sessions
- **Duration**: 30 minutes
- **Pass Criteria**:
  - [ ] No game freezes or crashes
  - [ ] Score updates persisted correctly
  - [ ] Memory remains stable (no leaks)

### Scenario B: Multiplayer Stress Test
- **Objective**: Test real-time multiplayer synchronization
- **Load**: 50 concurrent multiplayer matches (100 players)
- **Duration**: 15 minutes
- **Pass Criteria**:
  - [ ] Game state sync latency < 100ms
  - [ ] No player disconnections due to server
  - [ ] Winner determination accurate
  - [ ] On-chain settlement executes correctly

### Scenario C: NFT Minting Burst
- **Objective**: Test blockchain interaction under load
- **Load**: 50 simultaneous NFT mint requests
- **Duration**: 5 minutes
- **Pass Criteria**:
  - [ ] All transactions submitted successfully
  - [ ] Transaction hash returned for each mint
  - [ ] NFTs created on-chain (verified via RPC)
  - [ ] No duplicate mints

### Scenario D: Sustained Load
- **Objective**: Long-running stability test
- **Load**: 25 concurrent users (mixed gameplay)
- **Duration**: 2 hours
- **Pass Criteria**:
  - [ ] Server uptime 100%
  - [ ] No memory growth > 20%
  - [ ] Database connections stable
  - [ ] WebSocket reconnection works

---

## 3. Infrastructure Checklist

### Pre-Stress Test
- [ ] Backend deployed to production environment
- [ ] Frontend deployed to Vercel (or production CDN)
- [ ] Database (Supabase) connection pool configured
- [ ] RPC endpoint rate limits verified
- [ ] Monitoring/logging enabled
- [ ] Environment variables set correctly

### Server Configuration
```
Node.js Version: 18+
Memory Allocation: 2GB minimum
WebSocket Max Connections: 1000
Database Pool Size: 20
```

### Monitoring Stack
- [ ] Server metrics (CPU, Memory, Network)
- [ ] Application logs (structured JSON)
- [ ] WebSocket connection tracking
- [ ] Database query performance
- [ ] Blockchain transaction status

---

## 4. Test Environment Setup

### Required Tools
| Tool | Purpose |
|------|---------|
| k6 / Artillery | Load generation |
| Grafana | Metrics visualization |
| PM2 / nodemon | Process management |
| Chrome DevTools | Frontend profiling |

### Test Data Setup
- [ ] 100+ test wallet addresses
- [ ] Pre-funded testnet wallets (for NFT minting)
- [ ] Test game data seeded in Supabase

---

## 5. Acceptance Criteria Summary

### PASS Requirements (All must be met)
1. ✅ Game playable at 60 FPS on standard devices
2. ✅ Multiplayer matches complete without desync
3. ✅ NFT minting works with < 5% failure rate
4. ✅ No server crashes during 30-min load test
5. ✅ WebSocket reconnection succeeds after disconnect
6. ✅ Wallet-scoped data persists correctly

### FAIL Conditions (Any one fails the test)
1. ❌ Server OOM (Out of Memory) crash
2. ❌ Game freeze lasting > 5 seconds
3. ❌ Data loss (scores, NFT records)
4. ❌ > 10% transaction failures
5. ❌ Multiplayer match state corruption

---

## 6. Post-Test Deliverables

- [ ] Performance test report (metrics + graphs)
- [ ] Identified bottlenecks list
- [ ] Recommendations for optimization
- [ ] Go/No-Go decision for mainnet

---

## 7. Sign-Off

| Role | Name | Approved | Date |
|------|------|----------|------|
| Developer | | ☐ | |
| QA Lead | | ☐ | |
| DevOps | | ☐ | |
| Product Owner | | ☐ | |

---

*Document Version: 1.0*  
*Last Updated: 2025-12-23*
