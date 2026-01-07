/**
 * mDNS Discovery Service for finding OpenCode servers on the local network.
 * Uses react-native-zeroconf for DNS-SD/Bonjour service discovery.
 */

import Zeroconf from 'react-native-zeroconf';

export interface DiscoveredHost {
  serviceName: string;
  host: string;
  port: number;
  version?: string;
}

const SERVICE_TYPE = 'http';
const SERVICE_NAME_FILTER = 'opencode';
const HEALTH_CHECK_TIMEOUT_MS = 3000;

class MdnsDiscoveryService {
  private zeroconf: Zeroconf;
  private discoveredHosts: Map<string, DiscoveredHost> = new Map();
  private listeners: Set<(hosts: DiscoveredHost[]) => void> = new Set();
  private isDiscovering = false;
  private discoveringListeners: Set<(isDiscovering: boolean) => void> = new Set();

  constructor() {
    this.zeroconf = new Zeroconf();
    this.setupListeners();
  }

  private setupListeners() {
    this.zeroconf.on('start', () => {
      console.log('[mDNS] Discovery started');
      this.isDiscovering = true;
      this.notifyDiscoveringListeners();
    });

    this.zeroconf.on('stop', () => {
      console.log('[mDNS] Discovery stopped');
      this.isDiscovering = false;
      this.notifyDiscoveringListeners();
    });

    this.zeroconf.on('found', (name: string) => {
      console.log('[mDNS] Service found:', name);
    });

    this.zeroconf.on('resolved', async (service: any) => {
      console.log('[mDNS] Service resolved:', service);

      // Check if this is an OpenCode service
      const serviceName = service.name?.toLowerCase() || '';
      if (!serviceName.includes(SERVICE_NAME_FILTER)) {
        return;
      }

      const host = service.host || service.addresses?.[0];
      const port = service.port || 4096;

      if (!host) {
        console.log('[mDNS] No host address for service:', service.name);
        return;
      }

      // Validate via health check
      const version = await this.validateHost(host, port);
      if (version) {
        const discoveredHost: DiscoveredHost = {
          serviceName: service.name,
          host,
          port,
          version,
        };

        const key = `${host}:${port}`;
        this.discoveredHosts.set(key, discoveredHost);
        this.notifyListeners();
      }
    });

    this.zeroconf.on('remove', (name: string) => {
      console.log('[mDNS] Service removed:', name);
      // Find and remove by service name
      for (const [key, host] of this.discoveredHosts.entries()) {
        if (host.serviceName === name) {
          this.discoveredHosts.delete(key);
          this.notifyListeners();
          break;
        }
      }
    });

    this.zeroconf.on('error', (err: any) => {
      console.error('[mDNS] Discovery error:', err);
    });
  }

  private async validateHost(host: string, port: number): Promise<string | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

    try {
      const response = await fetch(`http://${host}:${port}/global/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.healthy) {
          return data.version || 'unknown';
        }
      }
    } catch (error) {
      // Host not reachable or not running OpenCode
      console.log('[mDNS] Health check failed for', host, port, error);
    } finally {
      clearTimeout(timeoutId);
    }

    return null;
  }

  private notifyListeners() {
    const hosts = Array.from(this.discoveredHosts.values());
    for (const listener of this.listeners) {
      listener(hosts);
    }
  }

  private notifyDiscoveringListeners() {
    for (const listener of this.discoveringListeners) {
      listener(this.isDiscovering);
    }
  }

  /**
   * Start mDNS discovery for OpenCode servers.
   */
  startDiscovery() {
    if (this.isDiscovering) {
      console.log('[mDNS] Discovery already active');
      return;
    }

    console.log('[mDNS] Starting discovery for _http._tcp.');
    this.discoveredHosts.clear();
    this.notifyListeners();

    try {
      this.zeroconf.scan(SERVICE_TYPE, 'tcp', 'local.');
    } catch (error) {
      console.error('[mDNS] Failed to start discovery:', error);
    }
  }

  /**
   * Stop mDNS discovery.
   */
  stopDiscovery() {
    console.log('[mDNS] Stopping discovery');
    try {
      this.zeroconf.stop();
    } catch (error) {
      console.error('[mDNS] Failed to stop discovery:', error);
    }
    this.isDiscovering = false;
    this.notifyDiscoveringListeners();
  }

  /**
   * Get current list of discovered hosts.
   */
  getDiscoveredHosts(): DiscoveredHost[] {
    return Array.from(this.discoveredHosts.values());
  }

  /**
   * Check if discovery is currently active.
   */
  getIsDiscovering(): boolean {
    return this.isDiscovering;
  }

  /**
   * Subscribe to discovered hosts updates.
   */
  subscribe(listener: (hosts: DiscoveredHost[]) => void): () => void {
    this.listeners.add(listener);
    // Immediately notify with current hosts
    listener(this.getDiscoveredHosts());

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Subscribe to discovering state updates.
   */
  subscribeToDiscovering(listener: (isDiscovering: boolean) => void): () => void {
    this.discoveringListeners.add(listener);
    // Immediately notify with current state
    listener(this.isDiscovering);

    return () => {
      this.discoveringListeners.delete(listener);
    };
  }

  /**
   * Manually add a host by checking if it's running OpenCode.
   */
  async addHostManually(host: string, port: number = 4096): Promise<DiscoveredHost | null> {
    const version = await this.validateHost(host, port);
    if (version) {
      const discoveredHost: DiscoveredHost = {
        serviceName: `manual-${host}`,
        host,
        port,
        version,
      };

      const key = `${host}:${port}`;
      this.discoveredHosts.set(key, discoveredHost);
      this.notifyListeners();
      return discoveredHost;
    }
    return null;
  }
}

// Export singleton instance
export const mdnsDiscovery = new MdnsDiscoveryService();
