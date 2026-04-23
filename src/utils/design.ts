/**
 * GazeConnect Pro - Professional Design System
 * =============================================
 * Color philosophy: Subtle, professional, low-fatigue.
 * Inspired by Claude AI aesthetics, Tobii blue accents, Apple accessibility.
 */

export const darkColors = {
  background: {
    primary: '#0D1117',
    secondary: '#161B22',
    tertiary: '#1C2128',
    elevated: '#2D333B',
    overlay: 'rgba(0, 0, 0, 0.7)',
  },
  text: {
    primary: '#E6EDF3',
    secondary: '#8B949E',
    tertiary: '#6E7681',
    inverse: '#0D1117',
  },
  border: {
    main: '#2D333B',
    light: '#21262D',
    focus: '#4B8BDB',
  },
  accent: {
    main: '#4B8BDB',
    hover: '#6BA3E8',
    subtle: '#1A2A42',
  },
  success: {
    main: '#4CAF7D',
    hover: '#5FBF8E',
    subtle: '#1A2E24',
  },
  warning: {
    main: '#C9963A',
    hover: '#D4A64D',
    subtle: '#2E2518',
  },
  emergency: {
    main: '#D4544C',
    hover: '#E06560',
    subtle: '#2E1A1A',
  },
  category: {
    people: '#7B8FA8',
    medical: '#D4544C',
    needs: '#4CAF7D',
    feelings: '#8B7BAE',
    actions: '#5E9CB8',
    activities: '#C99A5A',
    responses: '#7B9E7B',
    courtesy: '#9B8BA0',
  },
  quickfire: {
    yes: '#4CAF7D',
    no: '#D4544C',
    wait: '#C9963A',
    help: '#D4544C',
    more: '#4B8BDB',
    done: '#4CAF7D',
    thanks: '#8B7BAE',
    sorry: '#8B949E',
  },
  // Gaze Activation Theme (User Options: Teal, Orange, Green)
  // Current Selection: "Warm Subtle Teal" (#2DD4BF / #14B8A6)
  // Option 2 (Orange): #F59E0B
  // Option 3 (Green): #34C759
  gaze: {
    active: '#2DD4BF', // Teal-400 (Warm Subtle Teal)
    activeSubtle: 'rgba(45, 212, 191, 0.15)',
    inactive: '#1C2128',
    text: '#2DD4BF',
  },
};

export const lightColors = {
  background: {
    primary: '#F5F5F7', secondary: '#EBEBED', tertiary: '#E0E0E2',
    elevated: '#FFFFFF', overlay: 'rgba(255, 255, 255, 0.9)',
  },
  text: {
    primary: '#1D1D1F', secondary: '#48484A', tertiary: '#6E6E73', inverse: '#FFFFFF',
  },
  border: { main: '#D1D1D6', light: '#E5E5EA', focus: '#0071E3' },
  accent: { main: '#0071E3', hover: '#0077ED', subtle: '#E8F4FD' },
  success: { main: '#34C759', hover: '#30D158', subtle: '#E8F9ED' },
  warning: { main: '#FF9500', hover: '#FF9F0A', subtle: '#FFF4E5' },
  emergency: { main: '#FF3B30', hover: '#FF453A', subtle: '#FFEBE9' },
  category: {
    people: '#6B7F98', medical: '#E05550', needs: '#34C759', feelings: '#7B6BAE',
    actions: '#4E8CA8', activities: '#B98A4A', responses: '#6B8E6B', courtesy: '#8B7B90',
  },
  quickfire: {
    yes: '#34C759', no: '#FF3B30', wait: '#FF9500', help: '#FF3B30',
    more: '#0071E3', done: '#34C759', thanks: '#AF52DE', sorry: '#8E8E93',
  },
  gaze: {
    active: '#0D9488', // Teal-700
    activeSubtle: 'rgba(13, 148, 136, 0.1)',
    inactive: '#E0E0E2',
    text: '#0D9488',
  },
};

export const typography = {
  fontFamily: {
    primary: "'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif",
    mono: '"SF Mono", "Consolas", "Liberation Mono", Menlo, monospace',
  },
  fontSize: {
    xs: '0.875rem',    // 14px - was 12px
    sm: '1rem',        // 16px - was 14px  
    base: '1.125rem',  // 18px - was 16px
    lg: '1.25rem',     // 20px - was 18px
    xl: '1.375rem',    // 22px - was 20px
    '2xl': '1.625rem', // 26px - was 24px
    '3xl': '2rem',     // 32px - was 30px
    '4xl': '2.5rem',   // 40px - was 36px
    '5xl': '3.25rem',  // 52px - was 48px
  },
  fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
  lineHeight: { tight: 1.25, normal: 1.5, relaxed: 1.75 },
};

export const spacing: Record<string, string> = {
  0: '0', 1: '0.25rem', 2: '0.5rem', 3: '0.75rem', 4: '1rem',
  5: '1.25rem', 6: '1.5rem', 8: '2rem', 10: '2.5rem', 12: '3rem',
  16: '4rem', 20: '5rem', 24: '6rem',
};

export const buttonSizes = {
  // Larger sizes for easier gaze selection (AAC standard: min 44px, prefer 80px+)
  xs: { width: 60, height: 60, fontSize: typography.fontSize.sm, padding: spacing[2] },
  sm: { width: 80, height: 80, fontSize: typography.fontSize.base, padding: spacing[3] },
  md: { width: 100, height: 100, fontSize: typography.fontSize.lg, padding: spacing[4] },
  lg: { width: 120, height: 120, fontSize: typography.fontSize.xl, padding: spacing[5] },
  xl: { width: 140, height: 140, fontSize: typography.fontSize['2xl'], padding: spacing[6] },
  xxl: { width: 160, height: 160, fontSize: typography.fontSize['3xl'], padding: spacing[8] },
};

export const dwellTiming = {
  bySize: { xs: 1500, sm: 1350, md: 1200, lg: 1050, xl: 975, xxl: 900 },
  contexts: {
    quickfire: 700,
    keyboard: 700,
    keyboardKey: 700,
    spatialZone: 900,
    navigation: 1200,
    phrases: 1000,
    settings: 1300,
    emergency: 1500,
    calibration: 1300,
    spatial: 1200,
  },
  onsetDelay: 150, min: 400, max: 2000,
};

export const layout = {
  borderRadius: { none: '0', sm: '4px', md: '8px', lg: '12px', xl: '16px', '2xl': '24px', full: '9999px' },
  zIndex: { base: 0, dropdown: 100, modal: 200, toast: 300, tooltip: 400, gaze: 500, emergency: 999 },
  gap: { grid: spacing[4], button: spacing[3], section: spacing[8] },
};

export const screenLayouts = {
  home: { gridColumns: 5, gridRows: 2, buttonSize: 'xl' as const, gap: 8, padding: 12 },
  keyboard: { gridColumns: 10, gridRows: 4, buttonSize: 'md' as const, gap: 4, padding: 8 },
  phrases: { gridColumns: 3, gridRows: 4, buttonSize: 'lg' as const, gap: 12, padding: 16 },
  quickfire: { columns: 8, buttonSize: 'md' as const, gap: 8 },
  settings: { maxWidth: 800, padding: 32 },
};

export const animations = {
  duration: { instant: 0, fast: 100, normal: 200, slow: 300, verySlow: 500 },
  easing: {
    linear: 'linear', easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)', easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
};

export const accessibility = {
  contrast: { textAA: 4.5, textAAA: 7, largeTextAA: 3, uiComponentsAA: 3 },
  minTargetSize: 44, focusRing: { width: 2, offset: 2 },
  prefersReducedMotion: '@media (prefers-reduced-motion: reduce)',
};

export const splitScreenLayouts = {
  notepad: { topHeight: '35%', bottomHeight: '65%', dividerHeight: 4 },
  browser: { topHeight: '65%', bottomHeight: '35%', dividerHeight: 4 },
};

// Per-screen theme colors — centralizes hardcoded hex values from individual screens
export const screenThemes = {
  home: {
    bg: '#0D1117',
    glass: 'rgba(30, 45, 60, 0.65)',
    border: 'rgba(100, 140, 180, 0.15)',
    cardBg: 'linear-gradient(145deg, rgba(50, 62, 75, 0.65) 0%, rgba(40, 52, 65, 0.55) 100%)',
    cardBorder: '2px solid rgba(90, 110, 130, 0.3)',
    teal: '#2DD4BF',
    tealIcon: '#6BB8C9',
    text: '#E6EDF3',
    subtleBorder: 'rgba(255, 255, 255, 0.1)',
    red: '#E53E3E',
  },
  phrases: {
    selectedColor: '#E07A5F',
    sidebarBg: 'rgba(30, 45, 60, 0.65)',
    accentTeal: '#6BB8C9',
    cardBg: 'linear-gradient(145deg, rgba(50, 62, 75, 0.65) 0%, rgba(40, 52, 65, 0.55) 100%)',
    cardBorder: '2px solid rgba(90, 110, 130, 0.45)',
    selectedBg: 'rgba(224, 122, 95, 0.18)',
    aacLinkBg: 'rgba(45, 212, 191, 0.1)',
    aacLinkBorder: 'rgba(45, 212, 191, 0.3)',
    hindiText: 'rgba(200, 215, 230, 0.85)',
  },
  medical: {
    urgent: '#FF8A65',
    bed: '#4299E1',
    daily: '#4DB6AC',
  },
  activities: {
    selectedColor: '#C99A5A',
    sidebarBg: 'rgba(30, 45, 60, 0.65)',
    accentTeal: '#6BB8C9',
    selectedBg: 'rgba(201, 154, 90, 0.18)',
    hindiSubtext: 'rgba(255, 235, 205, 0.9)',
  },
  keyboard: {
    deleteWordBg: '#2A2520',
    deleteWordColor: '#C99A5A',
  },
  web: {
    bg: '#0D1117',
    cardBg: 'linear-gradient(145deg, rgba(30, 42, 56, 0.95) 0%, rgba(20, 28, 38, 0.85) 100%)',
    cardBorder: '1px solid rgba(255, 255, 255, 0.1)',
    textMain: '#F0F6FC',
    textSub: '#8B949E',
    accent: '#58A6FF',
    glass: 'rgba(255, 255, 255, 0.05)',
    chrome: '#4285F4',
    youtube: '#FF0000',
    ai: '#4ECDC4',
    whatsapp: '#25D366',
  },
  floorPlan: {
    bg: '#0F172A',
    panelBg: 'rgba(30, 41, 59, 0.7)',
    border: '1px solid rgba(148, 163, 184, 0.1)',
    accent: '#38BDF8',
    success: '#10B981',
    warning: '#F59E0B',
    textMain: '#F8FAFC',
    textSub: '#94A3B8',
    gridLine: 'rgba(255, 255, 255, 0.05)',
  },
  settings: {
    sidebarBg: 'rgba(30, 45, 60, 0.65)',
    selectedColor: '#6BB8C9',
    selectedBg: 'rgba(107, 184, 201, 0.15)',
    separatorColor: 'rgba(100, 140, 180, 0.2)',
  },
  cursor: {
    normal: '#38BDF8',
    locked: '#2DD4BF',
    disabled: '#666666',
    debugActive: '#0F0',
    debugWarning: '#F80',
    debugGaze: '#0FF',
    debugInactive: '#888',
  },
};

export type Theme = 'dark' | 'light';
export const getColors = (theme: Theme) => theme === 'dark' ? darkColors : lightColors;
export const createTheme = (theme: Theme) => ({
  colors: getColors(theme), typography, spacing, buttonSizes, dwellTiming, layout,
  screenLayouts, animations, accessibility, splitScreenLayouts, screenThemes,
});

export default {
  darkColors, lightColors, typography, spacing, buttonSizes, dwellTiming, layout,
  screenLayouts, animations, accessibility, splitScreenLayouts, screenThemes, getColors, createTheme,
};
