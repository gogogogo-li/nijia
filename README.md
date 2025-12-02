# OneNinja - OneChain Integrated Gaming Experience

## 🎮 Overview
OneNinja is a fully blockchain-integrated ninja slashing game built on **OneChain infrastructure**. Experience lightning-fast gameplay while your achievements, scores, and NFTs are secured on-chain.

## 🔗 OneChain Integration

### ✅ Integrated OneChain Infrastructure Components

#### 1. **OneWallet Integration** ✅
- **Wallet Connection**: Seamless OneWallet browser extension integration
- **Auto-Connect**: Persistent session management
- **Transaction Signing**: Secure on-chain transaction approval
- **Balance Display**: Real-time wallet balance updates

#### 2. **OneID Integration** ✅
- **Decentralized Identity**: Cross-platform user profiles
- **Profile Management**: Store and retrieve player preferences
- **Privacy-First**: User-controlled identity data

#### 3. **OneDEX Integration** ✅
- **Token Rewards**: Earn ONE tokens for achievements
- **Price Feeds**: Real-time token pricing
- **Future Trading**: In-game marketplace (coming soon)

#### 4. **OneRWA Integration** ✅
- **Achievement NFTs**: Mint verifiable achievement NFTs
- **On-Chain Proof**: Immutable game statistics
- **NFT Tiers**: Legendary, Epic, Rare, Common
- **Metadata**: Full game stats stored on-chain

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ and npm
- OneWallet browser extension installed
- OneChain testnet tokens (get from faucet)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/oneninja.git
cd oneninja
```

2. **Install dependencies**
```bash
npm install
cd backend && npm install && cd ..
```

3. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your OneChain configuration
```

4. **Install OneChain CLI (Optional for development)**

**Method 1: Via Cargo**
```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Install OneChain CLI
cargo install --locked --git https://github.com/one-chain-labs/onechain.git one_chain --features tracing
mv ~/.cargo/bin/one_chain ~/.cargo/bin/one
```

**Method 2: Direct Binary Download**
Download from: https://github.com/one-chain-labs/onechain/releases/tag/v1.0.1
- macOS ARM64: `one-mainnet-v1.0.1-macos-arm64.tgz`
- macOS x86_64: `one-mainnet-v1.0.1-macos-x86_64.tgz`
- Ubuntu ARM64/x86_64: Available

```bash
tar -xzf one-mainnet-v1.0.1-YOUR-PLATFORM.tgz
sudo mv one /usr/local/bin/
chmod +x /usr/local/bin/one
```

5. **Start the application**
```bash
# Terminal 1: Start backend
cd backend && npm start

# Terminal 2: Start frontend
npm start
```

6. **Connect OneWallet**
- Open http://localhost:3000
- Click "Connect Wallet"
- Approve connection in OneWallet extension
- Start playing!

## 📁 Project Structure

```
oneninja/
├── src/
│   ├── components/
│   │   ├── OneWallet.js          # OneWallet integration UI
│   │   ├── GameScreen.js         # Main gameplay
│   │   ├── MultiplayerLobby.js   # Multiplayer mode
│   │   └── ...
│   ├── services/
│   │   ├── onechainService.js    # OneChain API integration
│   │   └── multiplayerService.js # Multiplayer logic
│   └── hooks/
│       └── useOneChain.js        # React hook for OneChain
├── backend/
│   └── server.js                 # Express API server
├── contracts/                    # Smart contracts (if applicable)
└── ONECHAIN_INTEGRATION.md       # Detailed integration docs
```

## 🎯 Features

### Gameplay
- **Multiple Game Modes**: Classic, Zen, Arcade, and more
- **Multiplayer Battles**: Compete with other players
- **Real-Time Scoring**: Instant feedback and combos
- **Tier System**: Bronze → Silver → Gold → Platinum → Diamond → Master → Legendary

### Blockchain Features
- **On-Chain Achievements**: All scores recorded on OneChain
- **NFT Minting**: Mint achievement NFTs for legendary performances
- **Token Rewards**: Earn ONE tokens for milestones
- **Verifiable Records**: Tamper-proof leaderboards

### OneWallet Features
- **Secure Connection**: Non-custodial wallet integration
- **Transaction History**: View all game-related transactions
- **Balance Management**: Check and manage ONE token balance
- **NFT Gallery**: View your achievement NFT collection

## 🔧 Configuration

### Environment Variables

```bash
# OneChain Core
REACT_APP_ONECHAIN_API=https://api.onelabs.cc
REACT_APP_ONECHAIN_NETWORK=testnet
REACT_APP_ONECHAIN_PROJECT_ID=your_project_id

# OneID (Optional)
REACT_APP_ONEID_ENABLED=true
REACT_APP_ONEID_CLIENT_ID=your_oneid_client

# OneDEX (Optional)
REACT_APP_ONEDEX_ENABLED=true
REACT_APP_REWARD_TOKEN_ADDRESS=your_token_address

# OneRWA (Optional)
REACT_APP_ONERWA_ENABLED=true
REACT_APP_NFT_COLLECTION_ADDRESS=your_nft_collection
```

See `.env.example` for complete configuration options.

## 📚 Documentation

- **[OneChain Integration Guide](./ONECHAIN_INTEGRATION.md)** - Complete integration documentation
- **[OneChain API Docs](https://docs.onelabs.cc/API)** - Official API reference
- **[OneChain Development Guide](https://docs.onelabs.cc/DevelopmentDocument)** - Development documentation
- **[CLI Reference](https://docs.onelabs.cc/references/cli/client.mdx)** - OneChain CLI documentation

## 🎮 How to Play

1. **Connect Your Wallet**: Click "Connect Wallet" and approve in OneWallet
2. **Select Game Mode**: Choose from Classic, Zen, Arcade, or Multiplayer
3. **Start Slashing**: Swipe across fruits to slice them
4. **Avoid Bombs**: Don't hit the bombs or you lose lives
5. **Build Combos**: Slice multiple fruits in one motion for bonus points
6. **Earn Rewards**: Reach milestones to earn tokens and mint NFTs

### Scoring System
- **Regular Fruit**: 10 points
- **Token Fruit**: 25 points + combo bonus
- **Combo Multiplier**: 2x → 3x → 4x → 5x
- **Perfect Slash**: Bonus points for precision

### NFT Minting Criteria
- **Common**: 100+ score
- **Rare**: 500+ score
- **Epic**: 1000+ score, 20+ combo
- **Legendary**: 2000+ score, 50+ combo, 90%+ accuracy

## 🏆 Leaderboard

Compete globally on the OneChain leaderboard:
- **All-Time High Scores**: Top players ever
- **Weekly Champions**: Top scorers this week
- **Tier Rankings**: Compete within your tier
- **Verified On-Chain**: All scores verified on OneChain

## 🛠️ Development

### Running Tests
```bash
npm test
```

### Building for Production
```bash
npm run build
```

### Deploying Contracts
```bash
# See ONECHAIN_INTEGRATION.md for deployment guide
./scripts/deploy-contracts.js
```

## 🔐 Security

- **Non-Custodial**: You always control your wallet
- **Transparent**: All transactions visible on-chain
- **Audited**: Smart contracts reviewed for security
- **Private**: No personal data collected beyond wallet address

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details

## 🌐 Links

- **OneChain**: https://onelabs.cc
- **OneWallet**: [Browser Extension Store]
- **Explorer**: https://explorer.onelabs.cc
- **Documentation**: https://docs.onelabs.cc
- **GitHub**: https://github.com/one-chain-labs/onechain

## 🆘 Support

- **GitHub Issues**: [Report bugs](https://github.com/yourusername/oneninja/issues)
- **OneChain Discord**: [Join community]
- **Documentation**: [Read the docs](https://docs.onelabs.cc)

---

**Built with ❤️ on OneChain**  
**Powered by**: OneWallet | OneID | OneDEX | OneRWA
