export { useHostStore } from './hostStore'
export { useSessionStore } from './sessionStore'
export { useConfigStore } from './configStore'
export { useSettingsStore } from './settingsStore'
export { useVisibilityStore } from './visibilityStore'

// Session-state hooks moved out of zustand into the SessionRegistry. Re-export
// here so existing call sites that import from '@/stores' still work.
export {
  useChatPane,
  useLiveStatus,
  useStickyChat,
  useWatchLive,
  useWatchLiveMany,
  sendPrompt,
  interrupt,
  respondPermission,
  runClientSlashCommand,
} from '@/services/sessions/sessionRegistry'
export type {
  ChatPaneSnapshot,
  ConnectionState,
  LiveStatusSnapshot,
} from '@/services/sessions/sessionRegistry'
