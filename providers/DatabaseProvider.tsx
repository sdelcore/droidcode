import { useEffect, useState, createContext, useContext, type ReactNode } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { database } from '@/services/db';
import { useHostStore } from '@/stores/hostStore';

interface DatabaseContextValue {
  isReady: boolean;
  error: string | null;
}

const DatabaseContext = createContext<DatabaseContextValue>({
  isReady: false,
  error: null,
});

export function useDatabaseReady(): boolean {
  return useContext(DatabaseContext).isReady;
}

interface Props {
  children: ReactNode;
}

export function DatabaseProvider({ children }: Props) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializeHosts = useHostStore((state) => state.initialize);

  useEffect(() => {
    async function init() {
      try {
        // Initialize database
        await database.init();

        // Initialize stores that depend on database
        await initializeHosts();

        setIsReady(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to initialize database';
        console.error('[DatabaseProvider] Initialization failed:', err);
        setError(message);
      }
    }

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount - initializeHosts reference changes each render

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>Database Error</Text>
        <Text style={styles.errorMessage}>{error}</Text>
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <DatabaseContext.Provider value={{ isReady, error }}>
      {children}
    </DatabaseContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FF453A',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
