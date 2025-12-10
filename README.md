# OneNinja - OneChain Integrated Gaming Experience

A blockchain-integrated fruit ninja game built on the OneChain network, featuring real-time wallet integration, NFT achievements, and leaderboards powered by the official OneLabs API SDK.

## Features

- 🎮 Fast-paced fruit slashing gameplay
- 💰 OneWallet integration with real-time OCT balance
- 🏆 On-chain leaderboards and achievements
- 🎨 NFT minting for game achievements
- 🔗 Full OneChain blockchain integration via OneLabs SDK
- 📊 Player statistics and tier system
- 🌐 Multiplayer support

## Technology Stack

- **Frontend**: React 18.2.0
- **Blockchain**: OneChain (Sui-based)
- **SDK**: @onelabs/sui (Official OneLabs API SDK)
- **Wallet**: OneWallet browser extension
- **Icons**: React Icons
- **Analytics**: Vercel Analytics & Speed Insights

## OneLabs API SDK Integration

This project uses the official **@onelabs/sui** SDK for all blockchain interactions. The SDK provides:

- Type-safe API calls
- Standardized error handling
- Automatic retry logic
- Full OneChain feature support

See [docs/ONELABS_API_SDK.md](./docs/ONELABS_API_SDK.md) for detailed documentation.

## Getting Started

### Prerequisites

- Node.js 16+ 
- npm or yarn
- OneWallet browser extension

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm start
```

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
# OneLabs API Configuration
REACT_APP_ONECHAIN_API=https://api.onelabs.cc
REACT_APP_ONECHAIN_RPC=https://rpc-testnet.onelabs.cc:443
REACT_APP_ONECHAIN_NETWORK=testnet
REACT_APP_ONECHAIN_PROJECT_ID=oneninja

# Supabase Configuration
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key

# Backend API
REACT_APP_API_BASE_URL=http://localhost:3001
```

## Available Scripts

- `npm start` - Start development server
- `npm run build` - Build for production
- `npm test` - Run tests
- `npm run test:sdk` - Test OneLabs SDK integration
- `npm run test:wallet` - Test wallet integration
- `npm run test:integration` - Run integration tests

## Testing SDK Integration

Test the OneLabs API SDK integration:

```bash
npm run test:sdk
```

This will verify:
- API client initialization
- Health checks
- Network connectivity
- Balance queries
- Transaction building

## Project Structure

```
oneninja/
├── src/
│   ├── components/      # React components
│   ├── hooks/          # Custom React hooks
│   ├── services/       # API and blockchain services
│   │   ├── onelabsApiClient.js    # OneLabs SDK wrapper
│   │   ├── onechainService.js     # OneChain integration
│   │   └── supabaseService.js     # Database service
│   ├── styles/         # CSS and design system
│   └── utils/          # Utility functions
├── backend/            # Node.js backend
├── contracts/          # Move smart contracts
├── scripts/            # Test and deployment scripts
└── tests/             # Test suites
```

## Blockchain Integration

### Wallet Connection

The game uses OneWallet for authentication:

1. Install OneWallet extension
2. Create or import a wallet
3. Connect to OneChain testnet
4. Connect wallet in-game

### Token: OCT

- Symbol: OCT
- Decimals: 9
- 1 OCT = 1,000,000,000 MIST

### Smart Contracts

Move contracts are located in `contracts/sources/`:
- `one-ninja.move` - Main game logic
- `ninja_nft.move` - NFT achievements

## API Documentation

- [OneLabs API Docs](https://docs.onelabs.cc/API)
- [SDK Integration Guide](./ONELABS_SDK_INTEGRATION.md)
- [OneChain Docs](https://docs.onelabs.cc)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT

## Support

- [OneLabs Discord](https://discord.gg/onelabs)
- [GitHub Issues](https://github.com/yourusername/one-ninja/issues)
