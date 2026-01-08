# Agent Guidelines for DroidCode Expo

React Native mobile client for OpenCode. Uses Expo, Zustand, and TypeScript.

## Commands

```bash
# Development (run in nix develop shell)
nix develop              # Enter dev shell (required)
npm start                # Start Expo dev server
npm run android          # Run on Android emulator
npm run ios              # Run on iOS simulator

# Testing
npm test                            # Run all tests
npm run test:unit                   # Unit tests only
npm run test:components             # Component tests only
npm run test:integration            # Integration tests only
npx jest path/to/file.test.ts       # Single test file
npx jest --testNamePattern="pattern" # Tests matching pattern
npm run test:watch                  # Watch mode
npm run test:coverage               # Coverage report

# Validation (required before commits)
npm run typecheck        # TypeScript check
npm run lint             # ESLint
```

## Project Structure

```
app/              # Expo Router screens (file-based routing)
components/       # Reusable UI components
stores/           # Zustand state management
services/         # Business logic (API, SSE, DB)
types/            # TypeScript definitions (api.ts, domain.ts, sse.ts)
constants/        # Theme and configuration
__tests__/        # Jest tests (unit/, integration/, components/)
```

**Architecture:** UI Components -> Zustand Stores -> Services -> Data (SQLite/API)

## Code Style

### TypeScript
- **Strict mode** - no `any` types
- **Interfaces** for object shapes, **types** for unions/aliases
- Centralize types in `types/` directory
- Use `import type` for type-only imports

```typescript
interface Props { message: MessageDto; onPress?: () => void }
type AgentType = 'plan' | 'build' | 'shell'
```

### Imports (4 sections, in order)
1. React/React Native core
2. Third-party (Expo, etc.)
3. Local with `@/` alias
4. Relative `./` (same directory only)

```typescript
import { useCallback } from 'react'
import { View, StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Colors } from '@/constants/Theme'
import type { MessageDto } from '@/types'
import { MessageBubble } from './MessageBubble'
```

### Formatting
- **2 spaces** indentation (no tabs)
- **Single quotes** for strings, double for JSX props
- **No semicolons**
- **Trailing commas** in multi-line objects/arrays

### Naming Conventions
- Files: PascalCase components (`MessageBubble.tsx`), camelCase others (`chatStore.ts`)
- Variables: camelCase (`messageCount`)
- Constants: SCREAMING_SNAKE_CASE (`MAX_RETRIES`)
- Booleans: `is`, `has`, `can` prefix (`isLoading`, `hasContent`)
- Handlers: `handle` + Action (`handlePress`)
- Props callbacks: `on` + Action (`onPress`)

### Components
```typescript
interface ComponentProps {
  value: string
  onPress?: () => void
}

export function Component({ value, onPress }: ComponentProps) {
  const handlePress = useCallback(() => onPress?.(), [onPress])
  
  return <View style={styles.container}><Text>{value}</Text></View>
}

const styles = StyleSheet.create({
  container: { backgroundColor: Colors.background, padding: Spacing.md },
})
```

**Rules:** Functional only, destructure props, `useCallback` for handlers, styles at bottom.

### Zustand Stores
```typescript
export const useStore = create<StoreState>()((set, get) => ({
  items: [],
  isLoading: false,
  error: null,
  
  loadItems: async () => {
    set({ isLoading: true, error: null })
    try {
      const items = await repository.getAll()
      set({ items, isLoading: false })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unknown error', isLoading: false })
    }
  },
}))
```

**Rules:**
- Stores call services, never direct API/DB
- All async actions have try-catch
- Set `isLoading` and clear `error` at action start
- Use selectors in components: `useChatStore((s) => s.messages)`

### Error Handling
```typescript
import { extractNetworkError, logNetworkError } from '@/services/errors/networkError'

try {
  await apiClient.post('/endpoint', data)
} catch (error) {
  const errorInfo = extractNetworkError(error)
  logNetworkError('Context', error, errorInfo)
  // errorInfo.userMessage for UI, errorInfo.isRetryable for retry logic
}
```

- Store errors as `string | null`
- Use `ErrorBanner` component for UI display

### Testing
```typescript
jest.mock('@/services/db', () => ({
  repository: { getAll: jest.fn(), insert: jest.fn() },
}))

beforeEach(() => {
  useStore.setState({ items: [], isLoading: false, error: null })
  jest.clearAllMocks()
})

describe('store', () => {
  it('should load items', async () => {
    mockRepository.getAll.mockResolvedValue([{ id: 1 }])
    await useStore.getState().loadItems()
    expect(useStore.getState().items).toHaveLength(1)
  })
})
```

**Patterns:** AAA (Arrange, Act, Assert), mock dependencies, reset state in beforeEach.

## Theme Usage
```typescript
import { Colors, Spacing, BorderRadius, FontSize } from '@/constants/Theme'
```

## Important Notes

- Always run commands in `nix develop` shell
- Run `npm run typecheck` before committing
- No `console.log` - use logger from `services/debug`
- Follow OpenCode API spec: https://opencode.ai/docs/server
