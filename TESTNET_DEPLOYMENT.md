# One Ninja - Testnet Deployment Outline

## Deployment Overview

This document outlines the complete testnet deployment process for One Ninja, including infrastructure setup, smart contract deployment, and acceptance criteria.

---

## Pre-Deployment Checklist

### Environment Setup
- [ ] OneChain testnet RPC configured
- [ ] Testnet wallet with sufficient gas tokens
- [ ] Supabase project created and configured
- [ ] Environment variables documented
- [ ] Deployment keys secured (not in repository)
- [ ] DNS/domain configured (if applicable)

### Code Readiness
- [ ] All features merged to main branch
- [ ] Code reviewed and approved
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] No critical bugs in issue tracker
- [ ] Dependencies updated and audited

### Documentation
- [ ] README.md updated with testnet instructions
- [ ] API documentation current
- [ ] Smart contract documentation complete
- [ ] User guide drafted

---

## Phase 1: Smart Contract Deployment

### Move Contracts Setup

#### 1. Prepare Contract Configuration
```bash
cd contracts/
# Verify Move.toml configuration
cat Move.toml
```

**Required configurations:**
- Package name and version
- Dependencies (OneChain Framework)
- Network addresses
- Module addresses

#### 2. Compile Contracts
```bash
# Compile Move contracts for OneChain
move compile --named-addresses one_ninja=<DEPLOYER_ADDRESS>

# Run Move tests
move test
```

**Acceptance Criteria:**
- ✅ All contracts compile without errors
- ✅ All Move unit tests pass
- ✅ No compilation warnings
- ✅ Gas estimates within acceptable range

#### 3. Deploy to OneChain Testnet
```bash
# Deploy ninja_nft module
move publish \
  --url https://testnet-rpc.onelabs.cc/v1 \
  --named-addresses one_ninja=<DEPLOYER_ADDRESS> \
  --private-key <PRIVATE_KEY> \
  --assume-yes

# Verify deployment
onechain account list --account <DEPLOYER_ADDRESS>
```

**Acceptance Criteria:**
- ✅ Contracts deployed successfully
- ✅ Transaction hash recorded
- ✅ Module address documented
- ✅ Verification on block explorer
- ✅ Contract metadata visible on-chain

#### 4. Initialize Contract State
```bash
# Initialize NFT collection
onechain move run \
  --function-id '<MODULE_ADDRESS>::ninja_nft::initialize_collection' \
  --args string:"One Ninja Achievements" \
  --url https://testnet-rpc.onelabs.cc/v1
```

**Acceptance Criteria:**
- ✅ Collection created successfully
- ✅ Collection metadata correct
- ✅ Ownership verified
- ✅ Initial state validated

---

## Phase 2: Database Setup

### Supabase Configuration

#### 1. Create Database Tables
```bash
# Run schema migrations
cd supabase/
psql <SUPABASE_CONNECTION_STRING> < schema.sql
```

**Tables to create:**
- `players` - Player profiles and wallet addresses
- `game_sessions` - Individual game records
- `leaderboard` - Aggregated rankings
- `achievements` - NFT minting records
- `transactions` - Blockchain transaction logs

**Acceptance Criteria:**
- ✅ All tables created successfully
- ✅ Foreign key constraints validated
- ✅ Row-level security policies enabled

#### 2. Configure Security Policies
```sql
-- Enable RLS on all tables
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read own profile" ON players
  FOR SELECT USING (auth.uid() = wallet_address);
```

**Acceptance Criteria:**
- ✅ RLS enabled on sensitive tables
- ✅ Read policies configured
- ✅ Write policies configured
- ✅ Anonymous access restricted
- ✅ API key permissions set

#### 3. Seed Test Data
```bash
# Insert sample players for testing
npm run seed:testnet
```

**Acceptance Criteria:**
- ✅ Test accounts created
- ✅ Sample game sessions inserted

---

## Phase 3: Backend Deployment

### Node.js Server Setup

#### 1. Configure Environment Variables
```bash
# Create production .env file
cat > backend/.env.testnet << EOF
NODE_ENV=production
PORT=8080
SUPABASE_URL=<SUPABASE_URL>
SUPABASE_KEY=<SUPABASE_ANON_KEY>
ONECHAIN_RPC_URL=https://fullnode.testnet.onelabs.cc/v1
CONTRACT_ADDRESS=<DEPLOYED_CONTRACT_ADDRESS>
INDEXER_INTERVAL=60000
CORS_ORIGIN=<FRONTEND_URL>
EOF
```

**Acceptance Criteria:**
- ✅ All required variables set
- ✅ No sensitive data committed
- ✅ Correct network URLs
- ✅ Contract addresses verified

#### 2. Build and Deploy Backend
```bash
cd backend/
npm install --production
npm run build

# Deploy to cloud provider (example: AWS/GCP)
# Or use containerization
docker build -t one-ninja-backend .
docker run -p 8080:8080 --env-file .env.testnet one-ninja-backend
```

**Acceptance Criteria:**
- ✅ Server builds successfully
- ✅ No build errors or warnings
- ✅ Dependencies resolved
- ✅ Server starts without errors
- ✅ Health check endpoint responds

#### 3. Start Blockchain Indexer
```bash
# Start indexer service
npm run indexer:start
```

**Acceptance Criteria:**
- ✅ Indexer connects to OneChain RPC
- ✅ Block scanning starts
- ✅ Event listeners registered
- ✅ Database sync working
- ✅ Error handling functional

#### 4. Verify API Endpoints
```bash
# Test player registration
curl -X POST https://api.oneninja.testnet/api/players/register \
  -H "Content-Type: application/json" \
  -d '{"wallet_address": "0x123...", "username": "test_player"}'

# Test leaderboard
curl https://api.oneninja.testnet/api/games/leaderboard

# Test game session creation
curl -X POST https://api.oneninja.testnet/api/games/session \
  -H "Content-Type: application/json" \
  -d '{"player_address": "0x123..."}'
```

**Acceptance Criteria:**
- ✅ All endpoints respond with correct status codes
- ✅ Response payloads match schema
- ✅ Error handling returns proper messages
- ✅ CORS configured correctly
- ✅ Rate limiting functional
- ✅ Response times < 500ms

---

## Phase 4: Frontend Deployment

### React App Setup

#### 1. Configure Build Environment
```bash
cd ../
# Create production environment file
cat > .env.production << EOF
REACT_APP_API_URL=https://api.oneninja.testnet
REACT_APP_ONECHAIN_RPC=https://fullnode.testnet.onelabs.cc/v1
REACT_APP_CONTRACT_ADDRESS=<DEPLOYED_CONTRACT_ADDRESS>
REACT_APP_NETWORK=testnet
REACT_APP_SUPABASE_URL=<SUPABASE_URL>
REACT_APP_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>
EOF
```

**Acceptance Criteria:**
- ✅ All environment variables set
- ✅ Correct API endpoints
- ✅ Contract addresses match deployment
- ✅ Network configuration correct

#### 2. Build Production Bundle
```bash
# Install dependencies
npm install

# Build optimized production bundle
npm run build

# Verify build output
ls -lh build/
```

**Acceptance Criteria:**
- ✅ Build completes successfully
- ✅ No build errors or warnings
- ✅ Assets properly chunked

#### 3. Deploy to Hosting Platform
```bash
# Deploy to Vercel (example)
vercel --prod

# Or deploy to Netlify
netlify deploy --prod --dir=build

# Or deploy to static hosting
aws s3 sync build/ s3://one-ninja-testnet/ --delete
```

**Acceptance Criteria:**
- ✅ Deployment successful
- ✅ SSL certificate active
- ✅ Domain/subdomain accessible
- ✅ 404 handling configured

#### 4. Verify Frontend Functionality
**Manual Testing:**
- Open https://oneninja.testnet in browser
- Check browser console for errors
- Test all major routes
- Verify responsive design
- Check performance metrics

**Acceptance Criteria:**
- ✅ Landing page loads correctly
- ✅ No console errors
- ✅ All assets load properly
- ✅ Video/images display
- ✅ Fonts and styles applied
- ✅ Navigation works

---

## Phase 5: Integration Testing

### Wallet Connection Testing

#### Test OneWallet Integration
1. Install OneWallet extension
2. Create testnet account
3. Add OneChain testnet network
4. Fund wallet with test tokens
5. Connect wallet to application

**Acceptance Criteria:**
- ✅ Wallet detected on page load
- ✅ Connection prompt appears
- ✅ User can approve/reject connection
- ✅ Address displayed correctly after connection
- ✅ Balance fetched and displayed
- ✅ Session persists on page reload
- ✅ Disconnect functionality works
- ✅ Proper error handling for rejected connections
- ✅ Network mismatch warnings shown

### Gameplay Testing

#### Single Player Mode
1. Launch classic mode
2. Play complete game session
3. Slash multiple fruits
4. Test combo system
5. Complete game and view results

**Acceptance Criteria:**
- ✅ Game loads without lag
- ✅ Tokens spawn correctly
- ✅ Mouse/touch input responsive
- ✅ Slash detection accurate
- ✅ Score increments correctly
- ✅ Combo multiplier works
- ✅ Lives decrease on misses
- ✅ Timer counts down
- ✅ Game ends properly
- ✅ Results screen displays

### Blockchain Interaction Testing

#### NFT Minting
1. Achieve gold tier or higher
2. Click "Mint Achievement NFT"
3. Approve transaction in wallet
4. Wait for confirmation

**Acceptance Criteria:**
- ✅ Mint button enabled for eligible scores
- ✅ Transaction prompt appears in wallet
- ✅ Gas estimation displayed
- ✅ Transaction submits successfully
- ✅ Loading state shown during minting
- ✅ Success message after confirmation
- ✅ NFT appears in wallet
- ✅ Metadata correct (score, tier, timestamp)
- ✅ Transaction recorded in database
- ✅ Error handling for failed transactions

### Leaderboard Testing

#### Rankings Verification
1. Submit multiple game scores
2. Check leaderboard updates
3. Filter by tier
4. Refresh data

**Acceptance Criteria:**
- ✅ Scores sorted correctly (highest first)
- ✅ Player ranks accurate
- ✅ Pagination functional
- ✅ No duplicate entries

---

## Phase 6: Performance & Security Validation

### Performance Testing

#### Load Testing
```bash
# Use Apache Bench or similar
ab -n 1000 -c 10 https://api.oneninja.testnet/api/games/leaderboard

# Monitor server resources
htop
```

**Acceptance Criteria:**
- ✅ No memory leaks after extended use

#### Frontend Performance
- Run Lighthouse audit
- Test on various devices
- Check bundle loading time
- Monitor memory usage

**Acceptance Criteria:**
- ✅ Lighthouse Performance score >80
- ✅ Works on mobile devices
- ✅ No memory leaks in gameplay

### Security Testing

#### Smart Contract Security
```bash
# Run Move prover (if available)
move prove

# Manual security review
# - Check access control
# - Verify input validation
# - Test edge cases
```

**Acceptance Criteria:**
- ✅ No unauthorized minting possible
- ✅ Access controls enforced
- ✅ Input validation on all functions
- ✅ Proper error handling


#### API Security
- Test rate limiting
- Attempt SQL injection
- Test authentication bypass
- Check CORS configuration
- Validate input sanitization

**Acceptance Criteria:**
- ✅ Rate limiting prevents abuse
- ✅ SQL injection prevented
- ✅ No authentication bypass possible
- ✅ CORS only allows approved origins
- ✅ All inputs sanitized
- ✅ Error messages don't leak info
- ✅ HTTPS enforced

---

## Phase 7: Monitoring & Observability

### Setup Monitoring Tools

#### Application Monitoring
```bash
# Configure error tracking (e.g., Sentry)
npm install @sentry/react @sentry/node

# Configure analytics
# - Vercel Analytics
# - Google Analytics
# - Custom metrics
```


#### Infrastructure Monitoring
- Server uptime monitoring
- Database performance metrics
- Blockchain RPC availability
- API endpoint health checks


### Logging Setup
```javascript
// Structured logging
{
  "timestamp": "2025-12-02T10:30:00Z",
  "level": "info",
  "service": "backend",
  "message": "Game session created",
  "metadata": {
    "player": "0x123...",
    "session_id": "uuid",
    "mode": "classic"
  }
}
```


---

## Phase 8: Documentation & User Onboarding

### User Documentation

#### Create User Guide
- How to install OneWallet
- How to get testnet tokens
- How to add OneChain network
- How to play the game
- How to mint NFTs
- Troubleshooting common issues


#### Developer Documentation
- API documentation (Swagger/Postman)
- Smart contract ABIs
- Event schemas
- Integration examples
- Local development setup

**Acceptance Criteria:**
- ✅ API endpoints documented
- ✅ Error codes documented
- ✅ Smart contract interfaces documented

### In-App Onboarding
- Welcome modal on first visit
- Wallet connection tutorial
- Gameplay instructions
- Tips and tricks
- Help tooltips


---

## Phase 9: Beta Testing

### Invite Beta Testers
- Internal team testing (5-10 users)
- Selected community members (20-50 users)
- Bug bounty program (optional)

**Testing Focus Areas:**
1. Wallet connectivity across different browsers
2. Gameplay smoothness and responsiveness
3. NFT minting end-to-end flow
4. Leaderboard accuracy
5. Mobile device compatibility
6. Edge cases and error scenarios


### Bug Tracking
- Create issue templates
- Prioritize bugs (Critical/High/Medium/Low)
- Track resolution progress
- Document known issues

**Acceptance Criteria:**
- ✅ Zero critical bugs
---

## Phase 10: Launch Preparation

### Pre-Launch Checklist

#### Technical Readiness
- [ ] All acceptance criteria met
- [ ] Beta testing completed
- [ ] Critical bugs resolved
- [ ] Performance benchmarks met
- [ ] Security audit passed 


### Launch Day Plan
```
T-24h: Final system checks
T-12h: Team sync meeting
T-4h:  Pre-warm services
T-1h:  Final smoke tests
T-0:   Go live!
T+1h:  Monitor metrics
T+4h:  Initial health check
T+24h: Post-launch review
```



**Document Version**: 1.0  
**Created**: December 2, 2025  
**Last Updated**: December 3, 2025  
**Next Review**: Post-Deployment 
