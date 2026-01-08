# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DroidCode Expo is a React Native (Expo) client for [OpenCode](https://github.com/sst/opencode), the open-source AI coding agent. It connects to OpenCode servers and provides a mobile interface for interacting with AI agents.

This is the cross-platform version of DroidCode, targeting both iOS and Android.

## Development Environment

This project uses Nix flakes for reproducible development. **All commands must be run inside `nix develop`.**

```bash
# Enter the Nix development shell (required before running any commands)
nix develop

# Install dependencies
npm install

# Start development server
npx expo start

# Clear cache and start (use after cleaning node_modules)
npx expo start --clear

# Run on iOS simulator
npx expo run:ios

# Run on Android emulator
npx expo run:android
```

### Important: Always use `nix develop`

When running commands from outside the shell, prefix with `nix develop --command`:

```bash
nix develop --command npm install
nix develop --command npx expo start
```

## Project Structure

```
app/          # Expo Router screens (file-based routing)
stores/       # Zustand state management
services/     # API, SSE, database, notifications, sync
types/        # TypeScript definitions (api.ts, domain.ts, sse.ts)
components/   # Reusable UI components
providers/    # React context providers
constants/    # Theme and configuration
__tests__/    # Jest tests (unit, integration, components)
```

## Architecture

- **Pattern**: MVI-like with Zustand stores
- **Navigation**: Expo Router (file-based routing)
- **State**: Zustand for global state, React state for local
- **Persistence**: expo-sqlite for local database
- **Networking**: Axios for REST, react-native-sse for SSE

### Navigation Flow

```
/hosts → /projects/[hostId] → /sessions/[hostId]/[projectId] → /sessions/[hostId]/[projectId]/[sessionId]
```

## Key Stores

### hostStore
Server configurations. Methods: `initialize()`, `addHost()`, `removeHost()`, `refresh()`

### projectStore
OpenCode project instances. Methods: `loadProjects()`, `spawnProject()`, `stopProject()`

### chatStore
Chat session state. Methods: `loadSession()`, `sendMessage()`, `connect()`, `executeSlashCommand()`

### sessionStore
Session list management. Methods: `fetchSessions()`, `createSession()`, `deleteSession()`

## SSE Event Flow

1. **sseClient** connects to `/event` endpoint
2. Events parsed and emitted via callbacks
3. **chatStore** handles events in `handleSseEvent()`
4. UI updates via Zustand state changes

Key events: `message.start`, `message.delta`, `message.complete`, `session.updated`, `todo.updated`, `permission.requested`

## Commands

All commands below assume you are inside `nix develop` shell:

```bash
# Development
npm start                         # Start dev server
npm run android                   # Run on Android emulator
npm run ios                       # Run on iOS simulator
npx expo start --clear            # Clear cache and start

# Testing
npm test                          # Run all tests
npm run test:unit                 # Unit tests only
npm run test:integration          # Integration tests only
npx jest __tests__/unit/stores/hostStore.test.ts  # Run single test file
npx jest --testNamePattern="should load hosts"    # Run tests matching pattern
npm run test:watch                # Watch mode
npm run test:coverage             # Generate coverage report

# Type checking and linting
npm run typecheck                 # TypeScript check (run before commits)
npm run lint                      # ESLint

# Building and deployment
npx expo prebuild                 # Generate native projects
./scripts/push-update.sh          # Build APK and deploy

# Clean rebuild (if node_modules gets bloated)
rm -rf node_modules .expo && npm install && npx expo start --clear
```

## Slash Commands

Built-in commands handled in `chatStore.executeSlashCommand()`:

- `/undo` - Revert to previous message
- `/redo` - Restore reverted changes
- `/compact` or `/summarize` - Summarize conversation
- `/clear` - Clear local message display

## API Reference

**IMPORTANT**: Always refer to the official OpenCode Server API documentation for the authoritative API specification:
- **Official Docs**: https://opencode.ai/docs/server

Default server: `http://localhost:4096`

Key endpoints (see `services/api/apiClient.ts`):
- `POST /session` - Create session
- `POST /session/{id}/message` - Send message
- `GET /event` - SSE stream
- `POST /session/{id}/revert` - Revert session
- `POST /session/{id}/fork` - Fork session

## Database

SQLite via expo-sqlite with migrations. Schema defined in `services/db/database.ts`.

Key tables: `hosts`, `projects`, `session_preferences`, `schema_version`

## Code Style

See `AGENTS.md` for detailed code style guidelines including:
- TypeScript patterns (interfaces vs types, imports)
- Component structure and naming conventions
- Zustand store patterns
- Error handling patterns
- Testing patterns

## Visual Testing with MCP

This project uses `mobile-mcp` to enable Claude Code to visually test the app on Android emulators.

### Setup (already configured)

The MCP server is configured in `~/.claude.json` and uses `nix develop` to ensure Node.js 22 is available.

### Usage

1. Start an Android emulator with scaled resolution (required to avoid API image size limits):
   ```bash
   emulator -avd <your_avd_name> -scale 0.5
   ```
2. Start the dev server: `nix develop --command npx expo start`
3. Press `a` to launch on Android
4. Ask Claude to test the app visually

**Note**: The `-scale 0.5` flag is required because Claude's API has a 2000-pixel limit for image dimensions in multi-image requests. Without scaling, high-DPI emulator screenshots will exceed this limit and cause errors.

### Screenshot Storage

When saving screenshots during testing, always save them to the `test_screenshots/` folder in the project root:

```bash
# Example: Save screenshot to the test_screenshots folder
mobile_save_screenshot --device "emulator-5554" --saveTo "./test_screenshots/test_screenshot.png"
```

This folder is gitignored to avoid committing test artifacts.

### Available MCP Commands

- **Screenshots**: "Take a screenshot and describe the UI"
- **Tap elements**: "Tap the 'Add Host' button"
- **Text input**: "Type 'localhost:4096' into the server field"
- **Gestures**: "Swipe down to refresh the list"
- **Navigation**: "Navigate through all screens and verify the UI"

### Example Test Requests

```
"Take a screenshot of the current screen"
"Test adding a new host - fill in the form and submit"
"Navigate from hosts to projects to sessions"
"Verify the chat interface displays messages correctly"
"Test the settings screen toggles"
```

## Known Limitations

### Multi-Device Project Sync

Project configurations (port assignments and folder paths) are stored locally in each device's SQLite database. This can cause conflicts when multiple DroidCode instances connect to the same host:

- **Different port assignments**: If two devices create projects for the same folder, each will assign a different port number based on its local state.
- **Port conflicts**: If one device already has an OpenCode server running on a port, another device trying to spawn a project on that same port will fail.
- **No automatic sync**: Devices are unaware of each other's project configurations.

**Workaround**: Manually ensure devices use matching port assignments when working with the same project folders, or only run projects from one device at a time.

**Future improvement**: Sync project configurations across devices via the host server or cloud storage.

## Related Documentation

- Android version: `/home/sdelcore/src/droidcode`
- OpenCode API: https://opencode.ai/docs/server
- Expo documentation: https://docs.expo.dev
