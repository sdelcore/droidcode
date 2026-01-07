import React, { useEffect, useState } from 'react';
import { Text, StyleSheet, TextStyle } from 'react-native';
import { Colors } from '@/constants/Theme';

const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

interface BrailleSpinnerProps {
  color?: string;
  size?: number;
  style?: TextStyle;
  interval?: number; // milliseconds per frame
}

/**
 * Animated braille spinner component.
 * Cycles through braille dot patterns to create a CLI-style loading indicator.
 * 
 * Usage:
 * <BrailleSpinner color={Colors.info} size={14} />
 */
export function BrailleSpinner({ 
  color = Colors.textMuted, 
  size = 14,
  style,
  interval = 80 
}: BrailleSpinnerProps) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % BRAILLE_FRAMES.length);
    }, interval);

    return () => clearInterval(timer);
  }, [interval]);

  return (
    <Text
      style={[
        styles.spinner,
        { color, fontSize: size },
        style,
      ]}
    >
      {BRAILLE_FRAMES[frameIndex]}
    </Text>
  );
}

const styles = StyleSheet.create({
  spinner: {
    fontFamily: 'monospace',
  },
});
