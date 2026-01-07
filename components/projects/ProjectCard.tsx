import { StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Text, View } from '@/components/Themed';
import type { Project, ProjectStatus } from '@/types';
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS } from '@/types';
import { Colors } from '@/constants/Theme';

interface ProjectCardProps {
  project: Project;
  onPress: () => void;
  onLongPress?: () => void;
}

function getStatusIcon(status: ProjectStatus): keyof typeof MaterialCommunityIcons.glyphMap {
  switch (status) {
    case 'running':
      return 'play-circle';
    case 'stopped':
      return 'stop-circle';
    case 'starting':
    case 'stopping':
      return 'loading';
    case 'error':
      return 'alert-circle';
    default:
      return 'help-circle';
  }
}

export function ProjectCard({
  project,
  onPress,
  onLongPress,
}: ProjectCardProps) {
  const statusColor = PROJECT_STATUS_COLORS[project.status];
  const statusLabel = PROJECT_STATUS_LABELS[project.status];
  const statusIcon = getStatusIcon(project.status);

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <MaterialCommunityIcons
            name="folder-open"
            size={24}
            color={Colors.textMuted}
            style={styles.icon}
          />
          <View style={styles.titleContainer}>
            <Text style={styles.name} numberOfLines={1}>
              {project.name}
            </Text>
            <Text style={styles.directory} numberOfLines={1}>
              {project.directory}
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <MaterialCommunityIcons
              name={statusIcon}
              size={14}
              color={statusColor}
            />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusLabel}
            </Text>
          </View>
          <Text style={styles.port}>:{project.port}</Text>
        </View>
      </View>

      <MaterialCommunityIcons name="chevron-right" size={24} color={Colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 12,
  },
  titleContainer: {
    flex: 1,
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
  },
  directory: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginLeft: 36,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
  },
  port: {
    fontSize: 12,
    color: Colors.textMuted,
    marginLeft: 12,
  },
});
