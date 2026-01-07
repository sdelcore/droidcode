/**
 * ChatInput component with image attachments.
 * Provides a rich input experience for sending messages to the AI agent.
 */

import { useState, useCallback } from 'react';
import {
  StyleSheet,
  TextInput,
  Pressable,
  View,
  Text,
  Image,
  ScrollView,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Colors, Spacing, BorderRadius, FontSize, FontFamily } from '@/constants/Theme';
import { AgentType, ThinkingModeType } from '@/types';
import { SlashCommandAutocomplete } from '@/components/input/SlashCommandAutocomplete';
import { useChatStore } from '@/stores/chatStore';

interface ImageAttachment {
  uri: string;
  width?: number;
  height?: number;
  mimeType?: string;
  base64?: string | null;
  fileSize?: number; // Estimated size in bytes
}

/**
 * Calculate estimated size of a base64 string in bytes
 */
function calculateBase64Size(base64: string): number {
  // Base64 encoded data is roughly 4/3 the size of original
  // Subtract padding characters (=)
  const padding = (base64.match(/=/g) || []).length;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Format bytes to human-readable string (e.g., "1.5 MB")
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Resize image if it's too large (>1920px width or >5MB base64 size)
 */
async function resizeImageIfNeeded(
  uri: string,
  width?: number,
  height?: number
): Promise<{ uri: string; width: number; height: number }> {
  const MAX_WIDTH = 1920;
  const MAX_HEIGHT = 1920;

  // If dimensions are within limits, return original
  if (width && height && width <= MAX_WIDTH && height <= MAX_HEIGHT) {
    return { uri, width, height };
  }

  // Calculate new dimensions maintaining aspect ratio
  const aspectRatio = width && height ? width / height : 1;
  let newWidth = width || MAX_WIDTH;
  let newHeight = height || MAX_HEIGHT;

  if (newWidth > MAX_WIDTH) {
    newWidth = MAX_WIDTH;
    newHeight = Math.floor(newWidth / aspectRatio);
  }

  if (newHeight > MAX_HEIGHT) {
    newHeight = MAX_HEIGHT;
    newWidth = Math.floor(newHeight * aspectRatio);
  }

  // Resize the image
  const manipResult = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: newWidth, height: newHeight } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  return {
    uri: manipResult.uri,
    width: manipResult.width,
    height: manipResult.height,
  };
}

interface ChatInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: (images?: string[]) => void;
  onSlashCommand?: (command: string, args?: string) => Promise<boolean>;
  isLoading?: boolean;
  isBusy?: boolean;
  disabled?: boolean;  // Disables input when session not ready
  selectedAgent: AgentType;
  onAgentChange: (agent: AgentType) => void;
  thinkingMode: ThinkingModeType;
  onThinkingModeChange: (mode: ThinkingModeType) => void;
  placeholder?: string;
  maxLength?: number;
  bottomInset?: number;
}

export function ChatInput({
  value,
  onChangeText,
  onSend,
  onSlashCommand,
  isLoading,
  isBusy,
  disabled,
  selectedAgent,
  onAgentChange,
  thinkingMode,
  onThinkingModeChange,
  placeholder = 'Message...',
  maxLength = 10000,
  bottomInset = 0,
}: ChatInputProps) {
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [showSlashAutocomplete, setShowSlashAutocomplete] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [isExecutingCommand, setIsExecutingCommand] = useState(false);

  // Get available slash commands from store (fetched from server + built-in)
  const availableCommands = useChatStore((state) => state.availableCommands);

  const buttonScale = useSharedValue(1);

  // Handle text changes to detect "/" for slash command autocomplete
  const handleTextChange = (text: string) => {
    onChangeText(text);

    // Show slash autocomplete if input starts with "/" and no space yet
    if (text.startsWith('/') && !text.includes(' ')) {
      setShowSlashAutocomplete(true);
      setSlashQuery(text.substring(1)); // Query without "/"
    } else {
      setShowSlashAutocomplete(false);
      setSlashQuery('');
    }
  };

  // Handle slash command selection from autocomplete
  const handleSlashCommandSelect = (command: { name: string }) => {
    onChangeText(`/${command.name} `);
    setShowSlashAutocomplete(false);
    setSlashQuery('');
  };

  const canSend = (value.trim().length > 0 || images.length > 0) && !isLoading && !isExecutingCommand;

  const handleSend = async () => {
    if (!canSend) return;

    const trimmedValue = value.trim();

    // Check for slash commands
    if (trimmedValue.startsWith('/') && onSlashCommand) {
      const parts = trimmedValue.split(' ');
      const command = parts[0];
      const args = parts.slice(1).join(' ') || undefined;

      try {
        setIsExecutingCommand(true);
        const handled = await onSlashCommand(command, args);
        if (handled) {
          onChangeText(''); // Safe to clear - command succeeded
          return;
        }
        // If not handled (returned false), fall through to send as message
      } catch (error) {
        // Command threw an error - don't clear input, don't send as message
        console.error('Command execution error:', error);
        return;
      } finally {
        setIsExecutingCommand(false);
      }
    }

    // Construct data URLs for images with base64 data
    const imageDataUrls = images
      .filter((img) => img.base64) // Only include images with base64 data
      .map((img) => {
        const mimeType = img.mimeType || 'image/jpeg';
        return `data:${mimeType};base64,${img.base64}`;
      });
    onSend(imageDataUrls.length > 0 ? imageDataUrls : undefined);
    setImages([]);
  };

  const pickImage = useCallback(async () => {
    if (isPickingImage) return;

    try {
      setIsPickingImage(true);

      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please allow access to your photo library to attach images.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 5 - images.length,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets) {
        const processedImages: ImageAttachment[] = [];

        for (const asset of result.assets) {
          try {
            // Resize if needed
            const resized = await resizeImageIfNeeded(asset.uri, asset.width, asset.height);

            // Re-encode as base64 after resize
            const manipResult = await ImageManipulator.manipulateAsync(
              resized.uri,
              [],
              { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
            );

            const fileSize = manipResult.base64
              ? calculateBase64Size(manipResult.base64)
              : 0;

            processedImages.push({
              uri: manipResult.uri,
              width: manipResult.width,
              height: manipResult.height,
              mimeType: 'image/jpeg',
              base64: manipResult.base64,
              fileSize,
            });
          } catch (err) {
            console.error('Error processing image:', err);
            // Skip this image if processing fails
          }
        }

        // Calculate total size
        const totalSize = [...images, ...processedImages].reduce(
          (sum, img) => sum + (img.fileSize || 0),
          0
        );

        // Warn if total size is large (>8MB)
        if (totalSize > 8 * 1024 * 1024) {
          Alert.alert(
            'Large Upload',
            `Total size is ${formatFileSize(totalSize)}. This may take a while to upload and could fail on slow connections.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Continue',
                onPress: () => setImages((prev) => [...prev, ...processedImages].slice(0, 5)),
              },
            ]
          );
        } else {
          setImages((prev) => [...prev, ...processedImages].slice(0, 5));
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    } finally {
      setIsPickingImage(false);
    }
  }, [images, isPickingImage]);

  const takePhoto = useCallback(async () => {
    if (isPickingImage) return;

    try {
      setIsPickingImage(true);

      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please allow camera access to take photos.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];

        try {
          // Resize if needed
          const resized = await resizeImageIfNeeded(asset.uri, asset.width, asset.height);

          // Re-encode as base64 after resize
          const manipResult = await ImageManipulator.manipulateAsync(
            resized.uri,
            [],
            { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
          );

          const fileSize = manipResult.base64
            ? calculateBase64Size(manipResult.base64)
            : 0;

          const newImage: ImageAttachment = {
            uri: manipResult.uri,
            width: manipResult.width,
            height: manipResult.height,
            mimeType: 'image/jpeg',
            base64: manipResult.base64,
            fileSize,
          };

          // Calculate total size
          const totalSize = [...images, newImage].reduce(
            (sum, img) => sum + (img.fileSize || 0),
            0
          );

          // Warn if total size is large (>8MB)
          if (totalSize > 8 * 1024 * 1024) {
            Alert.alert(
              'Large Upload',
              `Total size is ${formatFileSize(totalSize)}. This may take a while to upload and could fail on slow connections.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Continue',
                  onPress: () => setImages((prev) => [...prev, newImage].slice(0, 5)),
                },
              ]
            );
          } else {
            setImages((prev) => [...prev, newImage].slice(0, 5));
          }
        } catch (err) {
          console.error('Error processing photo:', err);
          Alert.alert('Error', 'Failed to process photo. Please try again.');
        }
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    } finally {
      setIsPickingImage(false);
    }
  }, [images, isPickingImage]);

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddImage = () => {
    if (images.length >= 5 || isPickingImage) return;

    Alert.alert(
      'Add Image',
      'Choose an option',
      [
        { text: 'Take Photo', onPress: takePhoto },
        { text: 'Choose from Library', onPress: pickImage },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleButtonPressIn = () => {
    buttonScale.value = withSpring(0.95);
  };

  const handleButtonPressOut = () => {
    buttonScale.value = withSpring(1);
  };

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  return (
    <View style={[styles.container, { paddingBottom: bottomInset }]}>
      {/* Image Attachments */}
      {images.length > 0 && (
        <View>
          <ScrollView
            horizontal
            style={styles.imageList}
            contentContainerStyle={styles.imageListContent}
            showsHorizontalScrollIndicator={false}
          >
            {images.map((image, index) => (
              <View key={image.uri} style={styles.imageContainer}>
                <Image source={{ uri: image.uri }} style={styles.imageThumbnail} />
                {image.fileSize !== undefined && (
                  <View style={styles.fileSizeLabel}>
                    <Text style={styles.fileSizeText}>
                      {formatFileSize(image.fileSize)}
                    </Text>
                  </View>
                )}
                <Pressable
                  style={styles.removeImageButton}
                  onPress={() => removeImage(index)}
                  hitSlop={8}
                >
                  <MaterialCommunityIcons
                    name="close-circle"
                    size={20}
                    color={Colors.text}
                  />
                </Pressable>
              </View>
            ))}
            {images.length < 5 && (
              <Pressable style={styles.addImageButton} onPress={handleAddImage}>
                <MaterialCommunityIcons
                  name="plus"
                  size={24}
                  color={Colors.textMuted}
                />
              </Pressable>
            )}
          </ScrollView>
          <View style={styles.imageInfo}>
            <Text style={styles.imageInfoText}>
              {images.length} {images.length === 1 ? 'image' : 'images'} attached
              {(() => {
                const totalSize = images.reduce((sum, img) => sum + (img.fileSize || 0), 0);
                return totalSize > 0 ? ` • ${formatFileSize(totalSize)} total` : '';
              })()}
              {isLoading && ' • Uploading...'}
            </Text>
          </View>
        </View>
      )}

      {/* Slash Command Autocomplete */}
      <SlashCommandAutocomplete
        query={slashQuery}
        commands={availableCommands}
        onSelect={handleSlashCommandSelect}
        onDismiss={() => setShowSlashAutocomplete(false)}
        visible={showSlashAutocomplete}
      />

      {/* Input Row */}
      <View style={styles.inputRow}>
        <Pressable
          onPress={handleAddImage}
          disabled={disabled || images.length >= 5 || isPickingImage}
          style={styles.imageButton}
        >
          <MaterialCommunityIcons
            name="image-plus"
            size={24}
            color={
              disabled || images.length >= 5 || isPickingImage
                ? Colors.textMuted
                : Colors.textSecondary
            }
          />
        </Pressable>

        <TextInput
          style={styles.input}
          value={value}
          onChangeText={handleTextChange}
          placeholder={disabled ? 'Initializing session...' : placeholder}
          placeholderTextColor={Colors.textMuted}
          multiline
          maxLength={maxLength}
          editable={!isLoading && !disabled}
          autoCapitalize="sentences"
          autoCorrect
        />

        <Pressable
          onPressIn={handleButtonPressIn}
          onPressOut={handleButtonPressOut}
          onPress={handleSend}
          disabled={!canSend || disabled || isExecutingCommand}
        >
          <Animated.View
            style={[
              styles.sendButton,
              !canSend && styles.sendButtonDisabled,
              buttonAnimatedStyle,
            ]}
          >
            {isLoading || isExecutingCommand ? (
              <MaterialCommunityIcons
                name="loading"
                size={20}
                color={Colors.textMuted}
              />
            ) : (
              <MaterialCommunityIcons
                name="send"
                size={20}
                color={canSend ? Colors.text : Colors.textMuted}
              />
            )}
          </Animated.View>
        </Pressable>
      </View>

      {/* Character Count */}
      {value.length > maxLength * 0.8 && (
        <Text
          style={[
            styles.charCount,
            value.length >= maxLength && styles.charCountLimit,
          ]}
        >
          {value.length}/{maxLength}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.backgroundSecondary,
  },
  imageList: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  imageListContent: {
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  imageInfo: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  imageInfoText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: FontFamily.mono,
  },
  imageContainer: {
    position: 'relative',
  },
  imageThumbnail: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.backgroundTertiary,
  },
  removeImageButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 10,
  },
  fileSizeLabel: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    right: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fileSizeText: {
    fontSize: 9,
    color: Colors.text,
    fontFamily: FontFamily.mono,
    textAlign: 'center',
  },
  addImageButton: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.backgroundTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  imageButton: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingTop: Spacing.sm,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.mono,
    color: Colors.text,
    maxHeight: 120,
    minHeight: 40,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: Colors.backgroundTertiary,
  },
  charCount: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    paddingRight: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  charCountLimit: {
    color: Colors.error,
  },
});
