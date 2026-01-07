# Architecture

## Overview

DroidCode Expo follows a clean architecture pattern with MVI-like state management using Zustand. The app uses Expo Router for navigation and is organized into clear layers.

```
┌─────────────────────────────────────────────────────────┐
│                    UI Layer                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Screens   │  │  Components │  │  Navigation │     │
│  │  (app/*)    │◄─┤             │  │             │     │
│  └─────────────┘  └──────┬──────┘  └─────────────┘     │
└──────────────────────────┼──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                   State Layer (Zustand)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  hostStore  │  │  chatStore  │  │projectStore │     │
│  └─────────────┘  └──────┬──────┘  └─────────────┘     │
└──────────────────────────┼──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                   Service Layer                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  apiClient  │  │  sseClient  │  │  database   │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────┘
```

## State Management (Zustand)

Zustand stores provide global state with minimal boilerplate:

```typescript
interface ChatState {
  messages: MessageDto[];
  isLoading: boolean;

  // Actions
  sendMessage: (text: string) => Promise<void>;
  loadSession: (hostId: number, sessionId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  messages: [],
  isLoading: false,

  sendMessage: async (text) => {
    const { hostId, sessionId } = get();
    await apiClient.sendMessage(hostId, sessionId, { text });
  },

  loadSession: async (hostId, sessionId) => {
    set({ isLoading: true });
    const messages = await apiClient.getMessages(hostId, sessionId);
    set({ messages, isLoading: false });
  },
}));
```

### Store Responsibilities

| Store | Purpose |
|-------|---------|
| hostStore | Server configurations, connection state |
| projectStore | OpenCode instances, worktrees, spawn/stop |
| sessionStore | Session list, creation, deletion |
| chatStore | Messages, SSE, sending, streaming |

## Navigation (Expo Router)

File-based routing with the following structure:

```
app/
├── index.tsx                           # Redirect to /hosts
├── hosts/
│   ├── index.tsx                       # Host list
│   └── add.tsx                         # Add host modal
├── projects/
│   └── [hostId]/
│       └── index.tsx                   # Project list
├── sessions/
│   └── [hostId]/
│       └── [projectId]/
│           ├── index.tsx               # Session list
│           └── [sessionId]/
│               └── index.tsx           # Chat screen
├── settings/
│   └── index.tsx                       # Settings
├── scanner.tsx                         # QR scanner modal
└── _layout.tsx                         # Root layout
```

### Route Parameters

| Route | Parameters |
|-------|------------|
| `/projects/[hostId]` | hostId: number |
| `/sessions/[hostId]/[projectId]` | hostId, projectId: number |
| `/sessions/[hostId]/[projectId]/[sessionId]` | + sessionId: string |

## SSE Event Flow

```
OpenCode Server ─────► sseClient ─────► chatStore ─────► UI
      │                    │                │
      │ SSE Events         │ Parse          │ State Update
      │ - message.start    │ Events         │
      │ - message.delta    │                │
      │ - message.complete │                │
      │ - todo.updated     │                │
      └────────────────────┴────────────────┘
```

### Event Handling

```typescript
// In chatStore
function handleSseEvent(event: SseEvent) {
  switch (event.type) {
    case 'message.start':
      set({ streamingMessage: { id: event.messageId, parts: [] } });
      break;
    case 'message.delta':
      // Append to streaming message
      break;
    case 'message.complete':
      // Move to messages array
      break;
  }
}
```

## Database Layer

SQLite via expo-sqlite with migrations:

```
schema_version: 2

hosts
├── id (PK)
├── name
├── host
├── port
├── is_secure
└── last_connected

projects
├── id (PK)
├── host_id (FK)
├── parent_project_id (FK, nullable)
├── manifest_id
├── name
├── directory
├── port
├── pid
├── status
└── created_at

session_preferences
├── session_id (PK)
├── host_id (FK)
├── selected_agent
├── thinking_mode
└── input_text
```

## Component Architecture

### Chat Components

```
ChatScreen
├── SessionHeader
├── TodoPanelCompact
├── ChildSessionsPanel
├── FlashList (messages)
│   └── MessageGroup
│       ├── MessageBubble
│       │   ├── StreamingText
│       │   ├── ThinkingBlock
│       │   ├── ToolUseBlock
│       │   ├── CodeBlock
│       │   └── FilePreview
├── ScrollToBottomButton
├── ChatInput
│   ├── AgentPicker
│   ├── ThinkingModeToggle
│   └── ImageAttachments
└── PermissionDialog
```

### Project Components

```
ProjectListScreen
├── FlashList (projects)
│   └── ProjectCard
│       └── StatusBadge
└── WorktreeSection
    └── ProjectCard (isWorktree)
```

## Error Handling

Errors flow through stores with consistent patterns:

```typescript
try {
  const result = await apiClient.someOperation();
  set({ data: result, error: null });
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  set({ error: message });
}
```

UI components subscribe to error state and display banners:

```tsx
{error && <ErrorBanner message={error} onDismiss={clearError} />}
```

## Threading Model

- **Main Thread**: UI rendering, navigation
- **JavaScript Thread**: State management, business logic
- **Network**: Axios requests, SSE connection
- **SQLite**: Database operations (async)

## Testing Strategy

- **Unit Tests**: Store actions, utilities
- **Component Tests**: Render and interaction
- **Integration Tests**: Full flows with mocked API

```bash
# Run all tests
npm test

# Run specific test file
npm test -- chatStore.test.ts
```
