# One Ninja - Design Documentation

## Project Overview

One Ninja is a blockchain-integrated fruit slashing game built on the OneChain network. Players slice fruits to earn points, compete on leaderboards, and mint achievement NFTs.

## Architecture

### Technology Stack

- **Frontend**: React.js
- **Blockchain**: OneChain via OneWallet
- **Backend**: Node.js/Express
- **Database**: Supabase (PostgreSQL)
- **Smart Contracts**: Move language

### Core Components

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Frontend  │ ───> │   Backend    │ ───> │  Supabase   │
│   (React)   │ <─── │  (Express)   │ <─── │ (Database)  │
└─────────────┘      └──────────────┘      └─────────────┘
       │                     │
       │                     │
       v                     v
┌─────────────┐      ┌──────────────┐
│  OneWallet  │      │  OneChain    │
│   Browser   │ ───> │  Blockchain  │
│  Extension  │      │  Indexer     │
└─────────────┘      └──────────────┘
```

## Game Mechanics

### Game Modes

1. **Classic Mode**
   - Single-player experience
   - Progressive difficulty
   - Score-based progression
   - Time-limited sessions

2. **Multiplayer Arena** (Planned)
   - Real-time competitive play
   - Lobby system
   - Synchronized game sessions

### Gameplay Loop

1. Player launches game from landing page
2. Selects game mode
3. Fruits spawn randomly on screen
4. Player slashes fruits by clicking/swiping
5. Points accumulate based on:
   - Fruit type
   - Combo multipliers
   - Accuracy
6. Session ends on time limit or lives depleted
7. Results display with tier ranking
8. Option to mint achievement NFT

### Scoring System

- **Base Points**: Varies by fruit type
- **Combo Multiplier**: Consecutive hits increase score
- **Tier System**: Bronze → Silver → Gold → Platinum → Diamond
- **Missed Penalties**: Lose lives on missed fruits

## Blockchain Integration

### OneChain Connection

- **Wallet**: OneWallet browser extension
- **Network**: OneChain Testnet
- **RPC**: `https://fullnode.testnet.onelabs.cc/v1`

### Smart Contracts

#### `ninja_nft.move`
- NFT minting for achievements
- Metadata storage
- Ownership tracking

#### `one-ninja.move`
- Game logic on-chain
- Leaderboard verification
- Reward distribution

### Wallet Features

- **Authentication**: Session-based with signature verification
- **Balance Display**: Shows wallet tokens
- **Transaction History**: Track mints and rewards
- **Profile Management**: Link wallet to game profile

## Data Models

### Player Profile
```javascript
{
  wallet_address: string,
  username: string,
  total_score: number,
  games_played: number,
  highest_score: number,
  tier: string,
  created_at: timestamp,
  updated_at: timestamp
}
```

### Game Session
```javascript
{
  session_id: uuid,
  player_address: string,
  score: number,
  mode: string,
  duration: number,
  fruits_slashed: number,
  combos: number,
  timestamp: timestamp
}
```

### Leaderboard
```javascript
{
  rank: number,
  player_address: string,
  username: string,
  score: number,
  tier: string,
  timestamp: timestamp
}
```

## User Interface

### Design System

**Color Palette:**
- Primary: Vibrant gradients (purple, pink, orange)
- Background: Dark theme with glow effects
- Accents: Neon highlights for interactive elements

**Typography:**
- Headers: Bold, game-style fonts
- Body: Clean, readable sans-serif
- Numbers/Scores: Monospace for clarity

**Effects:**
- Particle systems for slashing
- Glow and blur for depth
- Smooth transitions and animations

### Key Screens

1. **Landing Page**
   - Animated background video
   - Wallet connection prompt
   - Game introduction
   - Call-to-action buttons

2. **Mode Selection**
   - Classic vs Multiplayer options
   - Quick stats display
   - Settings access

3. **Game Screen**
   - Full-screen canvas
   - HUD showing score, lives, timer
   - Blade trail effects
   - Point popups on hits
   - Combo indicators

4. **Results Screen**
   - Final score breakdown
   - Tier achievement display
   - Mint NFT option
   - Leaderboard preview
   - Play again / Exit options

5. **Leaderboard**
   - Global rankings
   - Tier filtering
   - Player stats
   - Refresh mechanism

## Backend Services

### API Endpoints

**Players**
- `POST /api/players/register` - Create new player profile
- `GET /api/players/:address` - Get player profile
- `PUT /api/players/:address` - Update profile
- `GET /api/players/:address/stats` - Get player statistics

**Games**
- `POST /api/games/session` - Start new game session
- `POST /api/games/end` - Submit game results
- `GET /api/games/leaderboard` - Fetch leaderboard data
- `GET /api/games/:sessionId` - Get session details

### Blockchain Indexer

- Monitors OneChain for game-related transactions
- Indexes NFT mints
- Tracks wallet interactions
- Syncs on-chain data with database

## State Management

### React Hooks Structure

- `useOneChain.js` - Wallet connection and blockchain operations
- `useGameState.js` - Core game logic and state
- `useGameLoop.js` - Animation frame management
- `useSlashDetection.js` - Mouse/touch input handling
- `useBladeTrail.js` - Visual trail effects
- `usePointPopups.js` - Score feedback animations
- `useMissedTokenNotifications.js` - Missed fruit alerts
- `useVisibility.js` - Tab focus detection
- `useTaskbarControls.js` - UI control state

## Performance Considerations

### Optimization Strategies

1. **Canvas Rendering**
   - RequestAnimationFrame for smooth 60fps
   - Object pooling for fruits
   - Efficient particle system cleanup

2. **State Updates**
   - Debounced score updates
   - Batched state changes
   - Memoized components

3. **Network Requests**
   - Cached leaderboard data
   - Retry logic for failed transactions
   - Optimistic UI updates

4. **Asset Loading**
   - Lazy loading for images
   - Video preloading
   - CDN for static assets

## Security

### Wallet Security
- Never store private keys
- Session-based authentication
- Signature verification for actions
- Clear connection status indicators

### API Security
- Input validation
- Rate limiting
- CORS configuration
- Environment variable management

### Data Integrity
- Score validation on backend
- Anti-cheat measures
- Transaction verification
- Audit logs

## Development Workflow

### Environment Setup
1. Install Node.js dependencies
2. Configure Supabase credentials
3. Set up OneChain RPC endpoint
4. Install OneWallet extension
5. Run local development server

### Testing Strategy
- Unit tests for game logic
- Integration tests for API
- E2E tests for critical flows
- Blockchain interaction testing
- Performance benchmarking

### Deployment
- Frontend: Vercel/Netlify
- Backend: Cloud hosting (AWS/GCP)
- Database: Supabase cloud
- Smart Contracts: OneChain testnet/mainnet

## References

### Documentation Links
- [OneChain Documentation](https://docs.onelabs.cc)
- [Move Language](https://move-language.github.io/move/)
- [Supabase Guides](https://supabase.com/docs)
- [React Best Practices](https://react.dev)

### Design Inspiration
- Fruit Ninja mechanics
- Web3 gaming patterns
- Modern UI/UX principles
- Blockchain gaming standards

---

**Document Version**: 1.0  
**Last Updated**: December 2, 2025  
**Maintained By**: One Ninja Development Team
