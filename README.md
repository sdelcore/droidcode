# DroidCode Expo

A cross-platform React Native mobile client for [OpenCode](https://github.com/sst/opencode), the open-source AI coding agent.

## Features

- **Connect to OpenCode servers** - Add servers manually or discover them automatically via mDNS
- **Real-time AI chat** - Stream responses with live text rendering using FlashList
- **Multi-agent support** - Switch between Plan, Build, and Shell agents
- **Extended thinking modes** - Normal, High (8K tokens), and Max (32K tokens)
- **Todo & diff panels** - Track AI tasks and view code changes
- **Session management** - Create, fork, revert, and delete sessions
- **Child sessions** - View and navigate to spawned agent sessions
- **Image attachments** - Attach images to messages
- **Slash commands** - `/undo`, `/redo`, `/compact`, `/clear`

## Getting Started

### Prerequisites

- Node.js 22+
- [Nix](https://nixos.org/download.html) (required for reproducible environment)
- iOS Simulator or Android Emulator

### Installation

```bash
# Enter Nix development shell (required)
nix develop

# Install dependencies
npm install

# Start development server
npx expo start
```

### Running the App

```bash
# iOS Simulator
npm run ios

# Android Emulator
npm run android

# Clear cache if needed
npx expo start --clear
```

## Project Structure

```
droidcode-expo/
├── app/              # Screens (Expo Router)
├── components/       # UI components
├── stores/           # Zustand state management
├── services/         # API, SSE, database, notifications
├── types/            # TypeScript definitions
├── constants/        # Theme and configuration
├── providers/        # React context providers
└── __tests__/        # Jest tests
```

### Navigation Flow

```
/hosts → /projects/[hostId] → /sessions/[hostId]/[projectId] → /sessions/.../[sessionId]
```

## Architecture

- **State**: Zustand stores with MVI-like pattern
- **Navigation**: Expo Router (file-based routing)
- **Persistence**: expo-sqlite for local database
- **Networking**: Axios for REST, react-native-sse for streaming
- **Lists**: @shopify/flash-list for performant rendering

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Development

```bash
npm start                 # Start dev server
npm test                  # Run all tests
npm run test:unit         # Unit tests only
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
npm run typecheck         # TypeScript check
npm run lint              # ESLint check
```

All commands must be run inside `nix develop` shell.

## Related

- [OpenCode](https://github.com/sst/opencode) - The AI coding agent server
- [OpenCode Server API](https://opencode.ai/docs/server) - Official API documentation

## License

MIT
