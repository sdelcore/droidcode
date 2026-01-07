import { useState } from 'react';
import { StyleSheet, TextInput, Pressable, Switch } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useHeaderHeight } from '@react-navigation/elements';
import { router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { useHostStore } from '@/stores/hostStore';
import { Colors, Spacing, BorderRadius, FontSize } from '@/constants/Theme';

export default function AddHostScreen() {
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('4096');
  const [isSecure, setIsSecure] = useState(false);

  const headerHeight = useHeaderHeight();
  const { addHost } = useHostStore();

  const handleSave = async () => {
    if (!name.trim() || !host.trim()) return;

    try {
      await addHost({
        name: name.trim(),
        host: host.trim(),
        port: parseInt(port, 10) || 4096,
        isSecure,
      });
      router.back();
    } catch (error) {
      console.error('Failed to add host:', error);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
    >
      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="My Server"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Host</Text>
          <TextInput
            style={styles.input}
            value={host}
            onChangeText={setHost}
            placeholder="192.168.1.100 or hostname"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Port</Text>
          <TextInput
            style={styles.input}
            value={port}
            onChangeText={setPort}
            placeholder="4096"
            placeholderTextColor={Colors.textMuted}
            keyboardType="number-pad"
          />
        </View>

        <View style={styles.switchField}>
          <Text style={styles.label}>Use HTTPS</Text>
          <Switch
            value={isSecure}
            onValueChange={setIsSecure}
          />
        </View>

        <Pressable
          style={[styles.button, (!name.trim() || !host.trim()) && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={!name.trim() || !host.trim()}
        >
          <Text style={styles.buttonText}>Save</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  form: {
    padding: Spacing.lg,
  },
  field: {
    marginBottom: Spacing.xl,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginBottom: Spacing.sm,
    color: Colors.textSecondary,
  },
  input: {
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    fontSize: FontSize.lg,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  switchField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xxxl,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '600',
  },
});
