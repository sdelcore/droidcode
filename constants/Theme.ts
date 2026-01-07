/**
 * Theme constants for DroidCode.
 * Matches the OpenCode TUI color palette.
 */

export const Colors = {
  // Backgrounds (OpenCode palette)
  background: '#1A1918',           // OpenCodeBackground
  backgroundSecondary: '#211E1E',  // OpenCodeSurface
  backgroundTertiary: '#2D2A2A',   // OpenCodeSurfaceVariant
  backgroundCode: '#1A1918',       // Same as background for code blocks

  // Text (OpenCode palette)
  text: '#F1ECEC',                 // OpenCodeOnBackground
  textSecondary: '#DAD9D9',        // OpenCodeOnSurface
  textMuted: '#8E8B8B',            // OpenCodeSecondary
  textInverse: '#1A1918',          // Inverse for light backgrounds

  // Primary (OpenCode palette)
  primary: '#B7B1B1',              // OpenCodePrimary
  primaryDark: '#8E8B8B',          // OpenCodeSecondary

  // Status colors
  success: '#7DB87D',              // ConnectedColor/BuildAgentColor
  warning: '#D2C36B',              // ConnectingColor
  error: '#D27B7B',                // ErrorColor
  info: '#6B9BD2',                 // PlanAgentColor

  // Agent colors
  agentPlan: '#6B9BD2',            // Soft blue
  agentBuild: '#7DB87D',           // Soft green
  agentShell: '#00C853',           // Terminal green
  agentGeneral: '#B08CD2',         // Soft purple
  agentExplore: '#D2A66B',         // Soft orange

  // Accents
  purple: '#B08CD2',               // GeneralAgentColor
  purpleLight: '#C4B5FD',
  orange: '#D2A66B',               // ExploreAgentColor
  cyan: '#6B9BD2',                 // PlanAgentColor
  pink: '#D27B7B',                 // ErrorColor variant
  gold: '#D2C36B',                 // Max thinking mode

  // Borders (OpenCode palette)
  border: '#4B4646',               // OpenCodeOutlineVariant
  borderLight: '#656363',          // OpenCodeOutline

  // Tool status colors
  toolPending: '#8E8B8B',          // OpenCodeSecondary
  toolRunning: '#6B9BD2',          // PlanAgentColor
  toolCompleted: '#7DB87D',        // BuildAgentColor
  toolFailed: '#D27B7B',           // ErrorColor

  // Diff colors
  diffAdded: '#7DB87D',            // AdditionColor
  diffAddedBackground: 'rgba(125, 184, 125, 0.15)',
  diffRemoved: '#D27B7B',          // DeletionColor
  diffRemovedBackground: 'rgba(210, 123, 123, 0.15)',

  // Syntax highlighting (from Android app)
  syntaxKeyword: '#CC7832',        // Orange for keywords
  syntaxString: '#6A8759',         // Green for strings
  syntaxComment: '#808080',        // Gray for comments
  syntaxFunction: '#FFC66D',       // Yellow for functions
  syntaxNumber: '#6897BB',         // Blue for numbers
  syntaxType: '#A9B7C6',           // Light gray for types
  syntaxVariable: '#D2A66B',       // Orange for variables
  syntaxOperator: '#A9B7C6',       // Light gray for operators
  syntaxPunctuation: '#DAD9D9',    // OnSurface for punctuation
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
};

export const FontFamily = {
  mono: 'SpaceMono',
  system: undefined, // Uses system font
};

// Animation durations
export const Duration = {
  fast: 150,
  normal: 300,
  slow: 500,
};

/**
 * Get the color for a given agent type.
 * Maps agent names (from API or domain) to their theme colors.
 */
export function getAgentColor(agent?: string): string {
  if (!agent) return Colors.primary;

  const name = agent.toLowerCase();
  if (name.includes('plan')) return Colors.agentPlan;
  if (name.includes('build')) return Colors.agentBuild;
  if (name.includes('shell')) return Colors.agentShell;
  if (name.includes('general')) return Colors.agentGeneral;
  if (name.includes('explore')) return Colors.agentExplore;

  return Colors.primary;
}
