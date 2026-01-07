import { useEffect, useState, useCallback } from 'react';
import { StyleSheet, FlatList, Pressable, RefreshControl, SectionList } from 'react-native';
import { Link, router, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Text, View } from '@/components/Themed';
import { useHostStore } from '@/stores/hostStore';
import { mdnsDiscovery, type DiscoveredHost } from '@/services/discovery/mdnsDiscovery';
import { SwipeableListItem } from '@/components/shared/SwipeableListItem';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { Colors, Spacing, BorderRadius, FontSize } from '@/constants/Theme';
import type { Host } from '@/types';

export default function HostListScreen() {
  const { hosts, isLoading, refresh, addHost, removeHost } = useHostStore();
  const [discoveredHosts, setDiscoveredHosts] = useState<DiscoveredHost[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [deleteDialogHost, setDeleteDialogHost] = useState<Host | null>(null);
  const [actionMenuHost, setActionMenuHost] = useState<Host | null>(null);

  useEffect(() => {
    // Subscribe to mDNS discovery
    const unsubscribeHosts = mdnsDiscovery.subscribe(setDiscoveredHosts);
    const unsubscribeDiscovering = mdnsDiscovery.subscribeToDiscovering(setIsDiscovering);

    // Start discovery
    mdnsDiscovery.startDiscovery();

    return () => {
      unsubscribeHosts();
      unsubscribeDiscovering();
      mdnsDiscovery.stopDiscovery();
    };
  }, []);

  const handleHostPress = (hostId: number) => {
    router.push(`/projects/${hostId}`);
  };

  const handleHostLongPress = (host: Host) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActionMenuHost(host);
  };

  const handleDelete = async () => {
    if (deleteDialogHost) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await removeHost(deleteDialogHost.id);
      setDeleteDialogHost(null);
    }
  };

  const handleAddDiscoveredHost = useCallback(async (discovered: DiscoveredHost) => {
    // Check if host already exists
    const existingHost = hosts.find(
      (h) => h.host === discovered.host && h.port === discovered.port
    );

    if (existingHost) {
      // Navigate to existing host
      router.push(`/projects/${existingHost.id}`);
      return;
    }

    // Add as new host
    try {
      const newHostId = await addHost({
        name: discovered.serviceName.replace(/-/g, ' '),
        host: discovered.host,
        port: discovered.port,
        isSecure: false,
      });
      if (newHostId) {
        router.push(`/projects/${newHostId}`);
      }
    } catch (error) {
      console.error('Failed to add discovered host:', error);
    }
  }, [hosts, addHost]);

  // Filter discovered hosts that aren't already saved
  const newDiscoveredHosts = discoveredHosts.filter(
    (dh) => !hosts.some((h) => h.host === dh.host && h.port === dh.port)
  );

  const sections = [
    ...(newDiscoveredHosts.length > 0 || isDiscovering
      ? [{
          title: '[nearby]',
          data: newDiscoveredHosts,
          type: 'discovered' as const,
        }]
      : []),
    ...(hosts.length > 0
      ? [{
          title: '[saved]',
          data: hosts,
          type: 'saved' as const,
        }]
      : []),
  ];

  const renderSectionHeader = ({ section }: { section: { title: string; type: string } }) => (
    <View style={styles.sectionHeader}>
      <Text style={[
        styles.sectionTitle,
        section.type === 'discovered' ? styles.sectionTitleNearby : styles.sectionTitleSaved
      ]}>
        {section.title}
      </Text>
      {section.type === 'discovered' && isDiscovering && (
        <MaterialCommunityIcons
          name="loading"
          size={14}
          color={Colors.purple}
          style={styles.spinningIcon}
        />
      )}
    </View>
  );

  const renderItem = ({ item, section }: { item: any; section: { type: string } }) => {
    if (section.type === 'discovered') {
      const discovered = item as DiscoveredHost;
      return (
        <Pressable
          style={styles.hostItem}
          onPress={() => handleAddDiscoveredHost(discovered)}
        >
          <View style={styles.hostInfo}>
            <View style={styles.hostText}>
              <Text style={styles.hostName}>{discovered.serviceName}</Text>
              <Text style={styles.hostAddress}>
                {discovered.host}:{discovered.port}
              </Text>
              {discovered.version && (
                <Text style={styles.hostVersion}>v{discovered.version}</Text>
              )}
            </View>
          </View>
          <MaterialCommunityIcons
            name="plus"
            size={24}
            color={Colors.primary}
          />
        </Pressable>
      );
    }

    // Saved host - wrap with swipeable
    const host = item as Host;
    return (
      <SwipeableListItem onDelete={() => setDeleteDialogHost(host)}>
        <Pressable
          style={styles.hostItem}
          onPress={() => handleHostPress(host.id)}
          onLongPress={() => handleHostLongPress(host)}
          delayLongPress={500}
        >
          <View style={styles.hostInfo}>
            <View style={styles.hostText}>
              <Text style={styles.hostName}>{host.name}</Text>
              <Text style={styles.hostAddress}>
                {host.isSecure ? 'https' : 'http'}://{host.host}:{host.port}
              </Text>
            </View>
          </View>
          {host.isSecure && (
            <View style={styles.httpsTag}>
              <Text style={styles.httpsText}>https</Text>
            </View>
          )}
          <MaterialCommunityIcons
            name="chevron-right"
            size={24}
            color={Colors.textMuted}
          />
        </Pressable>
      </SwipeableListItem>
    );
  };

  const isEmpty = hosts.length === 0 && newDiscoveredHosts.length === 0;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'servers',
          headerLargeTitle: true,
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/settings')}
              style={styles.headerButton}
            >
              <MaterialCommunityIcons name="cog" size={24} color={Colors.primary} />
            </Pressable>
          ),
        }}
      />

      <View style={styles.container}>
        {isEmpty ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>[no servers]</Text>
            <Text style={styles.emptySubtext}>
              tap + to add a server
            </Text>
            {isDiscovering && (
              <View style={styles.searchingRow}>
                <MaterialCommunityIcons
                  name="loading"
                  size={14}
                  color={Colors.purple}
                />
                <Text style={styles.searchingText}>searching...</Text>
              </View>
            )}
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item, index) =>
              'id' in item ? item.id.toString() : `discovered-${item.host}-${item.port}`
            }
            renderSectionHeader={renderSectionHeader}
            renderItem={renderItem}
            refreshControl={
              <RefreshControl
                refreshing={isLoading}
                onRefresh={() => {
                  refresh();
                  mdnsDiscovery.stopDiscovery();
                  mdnsDiscovery.startDiscovery();
                }}
              />
            }
            contentContainerStyle={styles.listContent}
            stickySectionHeadersEnabled={false}
          />
        )}

        <Link href="/hosts/add" asChild>
          <Pressable style={styles.fab}>
            <MaterialCommunityIcons name="plus" size={24} color={Colors.text} />
          </Pressable>
        </Link>

        {/* Action Menu Dialog */}
        <ConfirmDialog
          visible={!!actionMenuHost}
          title={actionMenuHost?.name || 'Host'}
          message="Choose an action"
          icon="server"
          iconColor={Colors.primary}
          confirmText="View Projects"
          confirmColor={Colors.primary}
          cancelText="Delete"
          onConfirm={() => {
            if (actionMenuHost) {
              handleHostPress(actionMenuHost.id);
              setActionMenuHost(null);
            }
          }}
          onCancel={() => {
            if (actionMenuHost) {
              setDeleteDialogHost(actionMenuHost);
              setActionMenuHost(null);
            }
          }}
        />

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          visible={!!deleteDialogHost}
          title="Delete Host"
          message={`"${deleteDialogHost?.name}" will be permanently removed.`}
          icon="trash-can-outline"
          iconColor={Colors.error}
          confirmText="Delete"
          confirmColor={Colors.error}
          isDestructive
          onConfirm={handleDelete}
          onCancel={() => setDeleteDialogHost(null)}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButton: {
    padding: Spacing.sm,
  },
  listContent: {
    padding: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
    backgroundColor: 'transparent',
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  sectionTitleNearby: {
    color: Colors.purple,
  },
  sectionTitleSaved: {
    color: Colors.textMuted,
  },
  spinningIcon: {
    // Note: animation handled by Animated API if needed
  },
  hostItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.background,
  },
  hostInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    backgroundColor: 'transparent',
  },
  hostText: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  hostName: {
    fontSize: FontSize.lg,
    fontWeight: '500',
    color: Colors.text,
  },
  hostAddress: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },
  hostVersion: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  httpsTag: {
    backgroundColor: Colors.backgroundTertiary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    marginRight: Spacing.sm,
  },
  httpsText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxxl,
  },
  emptyText: {
    fontSize: FontSize.lg,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    backgroundColor: 'transparent',
  },
  searchingText: {
    fontSize: FontSize.sm,
    color: Colors.purple,
  },
  fab: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
});
