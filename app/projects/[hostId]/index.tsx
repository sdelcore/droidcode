import { useEffect, useState } from 'react';
import { StyleSheet, FlatList, Pressable, RefreshControl } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Text, View } from '@/components/Themed';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { CreateProjectDialog } from '@/components/dialogs/CreateProjectDialog';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { SwipeableListItem } from '@/components/shared/SwipeableListItem';
import { useProjectStore } from '@/stores/projectStore';
import { useHostStore } from '@/stores/hostStore';
import { Colors, Spacing, BorderRadius, FontSize } from '@/constants/Theme';
import type { Project } from '@/types';

export default function ProjectListScreen() {
  const { hostId: hostIdParam } = useLocalSearchParams<{ hostId: string }>();
  const hostId = parseInt(hostIdParam, 10);

  const { hosts, updateLastConnected } = useHostStore();
  const {
    projects,
    isLoading,
    error,
    loadProjects,
    refresh,
    spawnProject,
    stopProject,
    removeProject,
  } = useProjectStore();

  const host = hosts.find((h) => h.id === hostId);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDialogProject, setDeleteDialogProject] = useState<Project | null>(null);
  const [actionMenuProject, setActionMenuProject] = useState<Project | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadProjects(hostId);
    updateLastConnected(hostId);
  }, [hostId]);

  const handleProjectPress = (project: Project) => {
    router.push(`/sessions/${hostId}/${project.id}` as any);
  };

  const handleProjectLongPress = (project: Project) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActionMenuProject(project);
  };

  const handleDelete = async () => {
    if (deleteDialogProject) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await removeProject(deleteDialogProject.id);
      setDeleteDialogProject(null);
    }
  };

  const handleStopStart = async () => {
    if (actionMenuProject) {
      if (actionMenuProject.status === 'running') {
        await stopProject(actionMenuProject.id);
      } else {
        setErrorMessage('Start project feature coming soon');
      }
      setActionMenuProject(null);
    }
  };

  const handleAddProject = () => {
    setShowAddDialog(true);
  };

  const handleCreateProject = async (name: string, directory: string) => {
    setIsCreating(true);
    try {
      console.log(`[ProjectList] Creating project: ${name} at ${directory}`);
      await spawnProject(hostId, name, directory);
      setShowAddDialog(false);
      console.log(`[ProjectList] Project created successfully`);
    } catch (error) {
      console.error(`[ProjectList] Failed to create project:`, error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  const renderItem = ({ item: project }: { item: Project }) => (
    <SwipeableListItem onDelete={() => setDeleteDialogProject(project)}>
      <ProjectCard
        project={project}
        onPress={() => handleProjectPress(project)}
        onLongPress={() => handleProjectLongPress(project)}
      />
    </SwipeableListItem>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: host?.name || 'Projects',
          headerBackTitle: 'Hosts',
        }}
      />

      <View style={styles.container}>
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <FlatList
          data={projects}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={() => refresh(hostId)}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons
                name="folder-open-outline"
                size={64}
                color={Colors.textMuted}
              />
              <Text style={styles.emptyText}>No projects</Text>
              <Text style={styles.emptySubtext}>
                Add a project to get started
              </Text>
            </View>
          }
          contentContainerStyle={projects.length === 0 ? styles.emptyList : undefined}
        />

        <Pressable style={styles.fab} onPress={handleAddProject}>
          <MaterialCommunityIcons name="plus" size={24} color={Colors.text} />
        </Pressable>

        <CreateProjectDialog
          visible={showAddDialog}
          hostId={hostId}
          onConfirm={handleCreateProject}
          onDismiss={() => setShowAddDialog(false)}
          isLoading={isCreating}
        />

        {/* Action Menu Dialog */}
        <ConfirmDialog
          visible={!!actionMenuProject}
          title={actionMenuProject?.name || 'Project'}
          message="Choose an action"
          icon="folder-cog"
          iconColor={Colors.primary}
          confirmText="View Sessions"
          confirmColor={Colors.primary}
          cancelText={actionMenuProject?.status === 'running' ? 'Stop' : 'Start'}
          onConfirm={() => {
            if (actionMenuProject) {
              handleProjectPress(actionMenuProject);
              setActionMenuProject(null);
            }
          }}
          onCancel={handleStopStart}
        />

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          visible={!!deleteDialogProject}
          title="Delete Project"
          message={`"${deleteDialogProject?.name}" will be removed from the list. This won't affect files on the server.`}
          icon="trash-can-outline"
          iconColor={Colors.error}
          confirmText="Delete"
          confirmColor={Colors.error}
          isDestructive
          onConfirm={handleDelete}
          onCancel={() => setDeleteDialogProject(null)}
        />

        {/* Error Message Dialog */}
        <ConfirmDialog
          visible={!!errorMessage}
          title="Error"
          message={errorMessage || ''}
          icon="alert-circle"
          iconColor={Colors.warning}
          confirmText="OK"
          confirmColor={Colors.primary}
          cancelText=""
          onConfirm={() => setErrorMessage(null)}
          onCancel={() => setErrorMessage(null)}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorBanner: {
    backgroundColor: Colors.error,
    padding: Spacing.md,
  },
  errorText: {
    color: Colors.text,
    textAlign: 'center',
    fontSize: FontSize.sm,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxxl,
  },
  emptyText: {
    fontSize: FontSize.xl,
    fontWeight: '600',
    marginTop: Spacing.lg,
    color: Colors.text,
  },
  emptySubtext: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
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
