declare module 'react-native-zeroconf' {
  interface ZeroconfService {
    name: string;
    fullName: string;
    host: string;
    port: number;
    addresses: string[];
    txt: Record<string, string>;
  }

  class Zeroconf {
    constructor();
    scan(type?: string, protocol?: string, domain?: string): void;
    stop(): void;
    getServices(): Record<string, ZeroconfService>;
    on(event: 'start', callback: () => void): void;
    on(event: 'stop', callback: () => void): void;
    on(event: 'found', callback: (name: string) => void): void;
    on(event: 'resolved', callback: (service: ZeroconfService) => void): void;
    on(event: 'remove', callback: (name: string) => void): void;
    on(event: 'update', callback: () => void): void;
    on(event: 'error', callback: (error: Error) => void): void;
    removeDeviceListeners(): void;
  }

  export = Zeroconf;
}
