/**
 * Network Monitor Service
 * 
 * Uses NetInfo to detect network connectivity changes and
 * triggers SSE reconnection when network is restored.
 */

import NetInfo, { NetInfoState } from '@react-native-community/netinfo'
import { createLogger } from '@/services/debug/logger'

const logger = createLogger('NetworkMonitor')

type NetworkCallback = (isConnected: boolean) => void

class NetworkMonitor {
  private callbacks: Set<NetworkCallback> = new Set()
  private unsubscribe: (() => void) | null = null
  private lastState: boolean | null = null

  /**
   * Start monitoring network state.
   */
  start(): void {
    if (this.unsubscribe) {
      logger.debug('Already monitoring network state')
      return
    }

    logger.info('Starting network monitoring')

    this.unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const isConnected = state.isConnected ?? false
      const wasConnected = this.lastState

      logger.debug(`Network state: ${isConnected ? 'connected' : 'disconnected'} (type: ${state.type})`)

      // Detect transition from disconnected to connected
      if (wasConnected === false && isConnected === true) {
        logger.info('Network connectivity restored')
        this.notifyCallbacks(true)
      } else if (wasConnected === true && isConnected === false) {
        logger.info('Network connectivity lost')
        this.notifyCallbacks(false)
      }

      this.lastState = isConnected
    })
  }

  /**
   * Stop monitoring network state.
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
      this.lastState = null
      logger.info('Stopped network monitoring')
    }
  }

  /**
   * Check current network state.
   */
  async isConnected(): Promise<boolean> {
    const state = await NetInfo.fetch()
    return state.isConnected ?? false
  }

  /**
   * Subscribe to network state changes.
   * Callback is called when transitioning between connected/disconnected.
   */
  onNetworkChange(callback: NetworkCallback): () => void {
    this.callbacks.add(callback)
    return () => {
      this.callbacks.delete(callback)
    }
  }

  private notifyCallbacks(isConnected: boolean): void {
    for (const callback of this.callbacks) {
      try {
        callback(isConnected)
      } catch (error) {
        logger.error(`Error in network callback: ${error}`)
      }
    }
  }
}

export const networkMonitor = new NetworkMonitor()