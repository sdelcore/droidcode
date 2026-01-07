/**
 * Health Monitor Service
 *
 * Periodically polls /global/health endpoint during active streaming to detect
 * server failures. Uses a failure threshold approach instead of arbitrary timeouts.
 *
 * Architecture:
 * - Polls every 30 seconds during active streaming
 * - Tracks consecutive failures (threshold: 2 failures = unhealthy)
 * - Notifies subscribers when health status changes
 * - Auto-starts when streaming begins, auto-stops when streaming ends
 */

import { apiClient } from '@/services/api/apiClient'
import { createLogger } from '@/services/debug/logger'

const logger = createLogger('HealthMonitor')

const HEALTH_CHECK_INTERVAL_MS = 30000 // 30 seconds
const CONSECUTIVE_FAILURE_THRESHOLD = 2 // 2 failures = 60 seconds before unhealthy

type HealthStatus = 'healthy' | 'unhealthy' | 'unknown'

interface HealthState {
  status: HealthStatus
  consecutiveFailures: number
  lastCheckTime: number | null
  error: string | null
}

type HealthCallback = (state: HealthState) => void

/**
 * Health Monitor for detecting server failures during streaming.
 * Singleton service that manages periodic health checks.
 */
class HealthMonitor {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private callbacks: Set<HealthCallback> = new Set()
  private state: HealthState = {
    status: 'unknown',
    consecutiveFailures: 0,
    lastCheckTime: null,
    error: null,
  }

  // Connection parameters
  private hostId: number | null = null
  private port: number | null = null

  /**
   * Start monitoring health for a specific host/port.
   * @param hostId - Host ID to monitor
   * @param port - Port to monitor
   */
  start(hostId: number, port: number): void {
    // If already monitoring the same host/port, do nothing
    if (this.intervalId && this.hostId === hostId && this.port === port) {
      logger.debug(`Already monitoring health for host ${hostId}:${port}`)
      return
    }

    // Stop existing monitoring if switching to different host/port
    if (this.intervalId) {
      this.stop()
    }

    this.hostId = hostId
    this.port = port

    logger.info(`Starting health monitoring for host ${hostId}:${port}`)

    // Reset state
    this.state = {
      status: 'unknown',
      consecutiveFailures: 0,
      lastCheckTime: null,
      error: null,
    }

    // Perform initial check immediately
    this.performHealthCheck()

    // Start periodic checks
    this.intervalId = setInterval(() => {
      this.performHealthCheck()
    }, HEALTH_CHECK_INTERVAL_MS)
  }

  /**
   * Stop monitoring health.
   */
  stop(): void {
    if (!this.intervalId) {
      return
    }

    logger.info(`Stopping health monitoring for host ${this.hostId}:${this.port}`)

    clearInterval(this.intervalId)
    this.intervalId = null
    this.hostId = null
    this.port = null

    // Reset state
    this.state = {
      status: 'unknown',
      consecutiveFailures: 0,
      lastCheckTime: null,
      error: null,
    }
  }

  /**
   * Check if monitoring is active.
   */
  get isActive(): boolean {
    return this.intervalId !== null
  }

  /**
   * Get current health state.
   */
  getState(): HealthState {
    return { ...this.state }
  }

  /**
   * Subscribe to health status changes.
   * @returns Unsubscribe function
   */
  onHealthChange(callback: HealthCallback): () => void {
    this.callbacks.add(callback)
    return () => {
      this.callbacks.delete(callback)
    }
  }

  /**
   * Perform a single health check.
   */
  private async performHealthCheck(): Promise<void> {
    if (!this.hostId || !this.port) {
      logger.warn('Cannot perform health check: no host/port configured')
      return
    }

    const checkStartTime = Date.now()

    try {
      const response = await apiClient.checkGlobalHealth(this.hostId, this.port)

      if (response.healthy) {
        // Success - reset failure count
        const wasUnhealthy = this.state.status === 'unhealthy'

        this.state = {
          status: 'healthy',
          consecutiveFailures: 0,
          lastCheckTime: checkStartTime,
          error: null,
        }

        if (wasUnhealthy) {
          logger.info('Server health recovered')
        } else {
          logger.debug('Health check passed')
        }

        this.notifyCallbacks()
      } else {
        // Server responded but reported unhealthy
        this.handleFailure('Server reported unhealthy status', checkStartTime)
      }
    } catch (error) {
      // Network error or timeout
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.handleFailure(errorMessage, checkStartTime)
    }
  }

  /**
   * Handle a failed health check.
   */
  private handleFailure(errorMessage: string, checkTime: number): void {
    this.state.consecutiveFailures++
    this.state.lastCheckTime = checkTime
    this.state.error = errorMessage

    const wasHealthy = this.state.status === 'healthy' || this.state.status === 'unknown'

    // Check if we've crossed the failure threshold
    if (this.state.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
      this.state.status = 'unhealthy'

      if (wasHealthy) {
        logger.warn(
          `Server unhealthy after ${this.state.consecutiveFailures} consecutive failures: ${errorMessage}`
        )
      } else {
        logger.debug(`Health check failed (${this.state.consecutiveFailures} consecutive)`)
      }
    } else {
      // Still below threshold - keep previous status
      logger.debug(
        `Health check failed (${this.state.consecutiveFailures}/${CONSECUTIVE_FAILURE_THRESHOLD}): ${errorMessage}`
      )
    }

    this.notifyCallbacks()
  }

  /**
   * Notify all subscribers of state change.
   */
  private notifyCallbacks(): void {
    const state = this.getState()
    for (const callback of this.callbacks) {
      try {
        callback(state)
      } catch (error) {
        logger.error(`Error in health callback: ${error}`)
      }
    }
  }
}

// Singleton instance
export const healthMonitor = new HealthMonitor()
