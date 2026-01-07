import { useHostStore } from '@/stores/hostStore';
import { hostRepository } from '@/services/db';

// Mock the hostRepository
jest.mock('@/services/db', () => ({
  hostRepository: {
    getAll: jest.fn(),
    getById: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    updateLastConnected: jest.fn(),
    delete: jest.fn(),
    exists: jest.fn(),
  },
}));

const mockHostRepository = hostRepository as jest.Mocked<typeof hostRepository>;

// Reset store before each test
beforeEach(() => {
  useHostStore.setState({
    hosts: [],
    selectedHostId: null,
    isLoading: false,
    isInitialized: false,
    error: null,
  });
  jest.clearAllMocks();
});

describe('hostStore', () => {
  describe('initialize', () => {
    it('should load hosts from repository', async () => {
      const mockHosts = [
        {
          id: 1,
          name: 'Server 1',
          host: '192.168.1.1',
          port: 4096,
          isSecure: false,
          createdAt: Date.now(),
        },
      ];
      mockHostRepository.getAll.mockResolvedValue(mockHosts);

      await useHostStore.getState().initialize();

      expect(mockHostRepository.getAll).toHaveBeenCalled();
      expect(useHostStore.getState().hosts).toEqual(mockHosts);
      expect(useHostStore.getState().isInitialized).toBe(true);
    });

    it('should only initialize once', async () => {
      mockHostRepository.getAll.mockResolvedValue([]);

      await useHostStore.getState().initialize();
      await useHostStore.getState().initialize();

      expect(mockHostRepository.getAll).toHaveBeenCalledTimes(1);
    });

    it('should set error on failure', async () => {
      mockHostRepository.getAll.mockRejectedValue(new Error('Database error'));

      await useHostStore.getState().initialize();

      expect(useHostStore.getState().error).toBe('Database error');
      expect(useHostStore.getState().isInitialized).toBe(false);
    });
  });

  describe('addHost', () => {
    it('should add a host and refresh list', async () => {
      const newHost = {
        name: 'Test Server',
        host: '192.168.1.100',
        port: 4096,
        isSecure: false,
      };

      const insertedHost = {
        ...newHost,
        id: 1,
        createdAt: Date.now(),
      };

      mockHostRepository.insert.mockResolvedValue(1);
      mockHostRepository.getAll.mockResolvedValue([insertedHost]);

      const id = await useHostStore.getState().addHost(newHost);

      expect(mockHostRepository.insert).toHaveBeenCalledWith(newHost);
      expect(mockHostRepository.getAll).toHaveBeenCalled();
      expect(id).toBe(1);
      expect(useHostStore.getState().hosts).toEqual([insertedHost]);
    });

    it('should throw on failure', async () => {
      mockHostRepository.insert.mockRejectedValue(new Error('Insert failed'));

      await expect(
        useHostStore.getState().addHost({
          name: 'Test',
          host: 'localhost',
          port: 4096,
          isSecure: false,
        })
      ).rejects.toThrow('Insert failed');

      expect(useHostStore.getState().error).toBe('Insert failed');
    });
  });

  describe('updateHost', () => {
    it('should update a host', async () => {
      const updatedHost = {
        id: 1,
        name: 'Updated Server',
        host: '192.168.1.100',
        port: 8080,
        isSecure: false,
        createdAt: Date.now(),
      };

      mockHostRepository.update.mockResolvedValue();
      mockHostRepository.getAll.mockResolvedValue([updatedHost]);

      await useHostStore.getState().updateHost(1, { name: 'Updated Server', port: 8080 });

      expect(mockHostRepository.update).toHaveBeenCalledWith(1, {
        name: 'Updated Server',
        port: 8080,
      });
      expect(useHostStore.getState().hosts[0].name).toBe('Updated Server');
    });
  });

  describe('removeHost', () => {
    it('should remove a host', async () => {
      mockHostRepository.delete.mockResolvedValue();
      mockHostRepository.getAll.mockResolvedValue([]);

      await useHostStore.getState().removeHost(1);

      expect(mockHostRepository.delete).toHaveBeenCalledWith(1);
      expect(useHostStore.getState().hosts).toEqual([]);
    });

    it('should clear selectedHostId if removing selected host', async () => {
      useHostStore.setState({ selectedHostId: 1 });
      mockHostRepository.delete.mockResolvedValue();
      mockHostRepository.getAll.mockResolvedValue([]);

      await useHostStore.getState().removeHost(1);

      expect(useHostStore.getState().selectedHostId).toBeNull();
    });
  });

  describe('selectHost', () => {
    it('should select a host', () => {
      useHostStore.getState().selectHost(1);
      expect(useHostStore.getState().selectedHostId).toBe(1);
    });

    it('should deselect when passed null', () => {
      useHostStore.setState({ selectedHostId: 1 });
      useHostStore.getState().selectHost(null);
      expect(useHostStore.getState().selectedHostId).toBeNull();
    });
  });

  describe('updateLastConnected', () => {
    it('should update last connected time', async () => {
      const host = {
        id: 1,
        name: 'Server',
        host: 'localhost',
        port: 4096,
        isSecure: false,
        createdAt: Date.now(),
      };
      useHostStore.setState({ hosts: [host] });
      mockHostRepository.updateLastConnected.mockResolvedValue();

      await useHostStore.getState().updateLastConnected(1);

      expect(mockHostRepository.updateLastConnected).toHaveBeenCalledWith(1);
      expect(useHostStore.getState().hosts[0].lastConnected).toBeDefined();
    });
  });

  describe('refresh', () => {
    it('should refresh hosts from repository', async () => {
      const hosts = [
        { id: 1, name: 'Server', host: 'localhost', port: 4096, isSecure: false, createdAt: Date.now() },
      ];
      mockHostRepository.getAll.mockResolvedValue(hosts);

      await useHostStore.getState().refresh();

      expect(mockHostRepository.getAll).toHaveBeenCalled();
      expect(useHostStore.getState().hosts).toEqual(hosts);
    });
  });
});
