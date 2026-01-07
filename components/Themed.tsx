/**
 * Themed components with OpenCode styling.
 * Uses monospace font throughout for terminal aesthetic.
 */

import { Text as DefaultText, View as DefaultView, TextStyle } from 'react-native';

import Colors from '@/constants/Colors';
import { FontFamily } from '@/constants/Theme';
import { useColorScheme } from './useColorScheme';

type ThemeProps = {
  lightColor?: string;
  darkColor?: string;
};

export type TextProps = ThemeProps & DefaultText['props'];
export type ViewProps = ThemeProps & DefaultView['props'];

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  const theme = useColorScheme() ?? 'light';
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme][colorName];
  }
}

export function Text(props: TextProps) {
  const { style, lightColor, darkColor, ...otherProps } = props;
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  // Apply monospace font globally
  const monoStyle: TextStyle = { fontFamily: FontFamily.mono };

  return <DefaultText style={[{ color }, monoStyle, style]} {...otherProps} />;
}

export function View(props: ViewProps) {
  const { style, lightColor, darkColor, ...otherProps } = props;
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, 'background');

  return <DefaultView style={[{ backgroundColor }, style]} {...otherProps} />;
}

/**
 * MonoText - Text component that always uses monospace font.
 * Use this when importing from react-native directly isn't an option.
 */
export function MonoText(props: DefaultText['props']) {
  const { style, ...otherProps } = props;
  const monoStyle: TextStyle = { fontFamily: FontFamily.mono };

  return <DefaultText style={[monoStyle, style]} {...otherProps} />;
}
