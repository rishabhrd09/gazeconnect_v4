/**
 * GazeConnect Pro - Professional Design System
 * =============================================
 * Color philosophy: Subtle, professional, low-fatigue.
 * Inspired by Claude AI aesthetics, Tobii blue accents, Apple accessibility.
 */

export const darkColors = {
  background: {
    primary: '#0E1620',
    secondary: '#131E2E',
    tertiary: '#1C2B3E',
    elevated: '#223247',
    overlay: 'rgba(7, 10, 16, 0.76)',
  },
  text: {
    primary: '#F0EDE8',
    secondary: '#A8B5C4',
    tertiary: '#74879B',
    inverse: '#0E1620',
  },
  border: {
    main: '#2A3D52',
    light: '#223246',
    focus: '#38BDF8',
  },
  accent: {
    main: '#38BDF8',
    hover: '#67D0FA',
    subtle: 'rgba(56, 189, 248, 0.14)',
  },
  success: {
    main: '#34D399',
    hover: '#5CE6B2',
    subtle: 'rgba(52, 211, 153, 0.14)',
  },
  warning: {
    main: '#F59E0B',
    hover: '#F7B84B',
    subtle: 'rgba(245, 158, 11, 0.14)',
  },
  emergency: {
    main: '#D4544C',
    hover: '#E06560',
    subtle: '#2E1A1A',
  },
  navigation: {
    pillBackground: 'rgba(14, 20, 28, 0.96)',
    pillBorder: 'rgba(168, 181, 196, 0.24)',
    pillShadow: '0 8px 18px rgba(0,0,0,0.22)',
    containerDivider: 'rgba(213, 216, 188, 0.08)',
    idleBackground: 'rgba(6, 10, 16, 0.34)',
    idleText: '#A8B5C4',
    hoverBackground: 'rgba(255,255,255,0.055)',
    activeBackground: 'rgba(240, 237, 232, 0.14)',
    activeBorder: 'rgba(240, 237, 232, 0.22)',
    activeShadow: 'inset 0 0 0 1px rgba(240, 237, 232, 0.06)',
    activeText: '#F0EDE8',
    backBackground: 'rgba(255,255,255,0.045)',
    backHoverBackground: 'rgba(255,255,255,0.08)',
    backBorder: 'rgba(255,255,255,0.06)',
    backShadow: 'none',
    gazeBackgroundOn: 'rgba(56, 189, 248, 0.18)',
    gazeBackgroundOff: 'rgba(12, 18, 28, 0.88)',
    gazeBorderOn: 'rgba(145, 203, 255, 0.82)',
    gazeBorderOff: 'rgba(120, 135, 150, 0.82)',
    gazeGlow: '0 0 18px rgba(96, 165, 250, 0.18)',
    gazeTextOn: '#D9F1FF',
    gazeTextOff: '#D7DEE6',
    auxiliaryBackground: 'rgba(255,255,255,0.05)',
    auxiliaryBorder: '#2A3D52',
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
    primary: '#AFA087', secondary: '#BFAE8C', tertiary: '#B6A481',
    elevated: '#C8B793', overlay: 'rgba(200, 183, 147, 0.94)',
  },
  text: {
    primary: '#1B140E', secondary: '#251D16', tertiary: '#342A20', inverse: '#FFF7ED',
  },
  icon: {
    primary: '#1B140E', onEmergency: '#FFF7ED', muted: '#342A20',
  },
  border: { main: '#8D7959', light: '#9A8564', focus: '#6F5D43', strong: '#6F5D43' },
  accent: { main: '#B78E49', hover: '#A57E3F', subtle: 'rgba(183, 142, 73, 0.12)' },
  success: { main: '#1A3B1C', hover: '#143016', subtle: 'rgba(26, 59, 28, 0.12)' },
  warning: { main: '#B78E49', hover: '#A57E3F', subtle: 'rgba(183, 142, 73, 0.12)' },
  emergency: { main: '#8A463D', hover: '#7A3A34', deep: '#6A302C', soft: '#CFA094', subtle: '#CFA094' },
  navigation: {
    pillBackground: '#BFAE8C',
    pillBorder: '#8D7959',
    pillShadow: '0 2px 8px rgba(82, 66, 45, 0.16)',
    containerDivider: '#9A8564',
    idleBackground: 'transparent',
    idleText: '#251D16',
    hoverBackground: '#B6A481',
    activeBackground: '#B6A481',
    activeBorder: '#6F5D43',
    activeShadow: 'inset 0 0 0 1px rgba(111, 93, 67, 0.34)',
    activeText: '#1B140E',
    backBackground: '#B6A481',
    backHoverBackground: '#AFA087',
    backBorder: '#8D7959',
    backShadow: 'none',
    gazeBackgroundOn: '#B6A481',
    gazeBackgroundOff: '#BFAE8C',
    gazeBorderOn: '#6F5D43',
    gazeBorderOff: '#7D6A4E',
    gazeGlow: '0 3px 12px rgba(82, 66, 45, 0.18)',
    gazeTextOn: '#1B140E',
    gazeTextOff: '#251D16',
    auxiliaryBackground: '#B6A481',
    auxiliaryBorder: '#8D7959',
  },
  category: {
    people: '#6B7F98', medical: '#E05550', needs: '#34C759', feelings: '#7B6BAE',
    actions: '#4E8CA8', activities: '#B98A4A', responses: '#6B8E6B', courtesy: '#8B7B90',
  },
  quickfire: {
    yes: '#6E8C5C', no: '#B35A4B', wait: '#B78E49', help: '#B35A4B',
    more: '#7F97A8', done: '#6E8C5C', thanks: '#B78E49', sorry: '#847565',
  },
  gaze: {
    active: '#7F97A8',
    activeSubtle: 'rgba(127, 151, 168, 0.14)',
    inactive: '#A48F6A',
    text: '#251D16',
  },
};

export const mixColors = {
  home: {
    root: '#17130F',
    text: '#180F08',
    subtleText: '#4E3D29',
    mutedText: '#665136',
    brand: '#927754',
    cardBorder: 'rgba(70, 52, 32, 0.56)',
    cardShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), 0 7px 16px rgba(0,0,0,0.22)',
    dockSeparator: 'rgba(180, 157, 112, 0.18)',
    quickPhrasesBg: '#2E261D',
    quickPhrasesBorder: '#7C6445',
    quickPhrasesText: '#F0E2C4',
    quickPhrasesShadow: '0 0 0 1px rgba(124,100,69,0.22), 0 8px 18px rgba(0,0,0,0.24)',
    emergencyBg: '#8A463D',
    emergencyHover: '#7A3A34',
    emergencySoft: '#CFA094',
    placeholderBg: 'rgba(184, 164, 130, 0.08)',
    placeholderBorder: 'rgba(184, 164, 130, 0.18)',
    dividerBackground: 'linear-gradient(180deg, transparent 0%, rgba(180, 157, 112, 0.18) 50%, transparent 100%)',
    tileSurfaces: {
      kb: '#B6A17A',
      ph: '#B6A17A',
      ac: '#B6A17A',
      pp: '#B6A17A',
      med: '#B6A17A',
      st: '#B6A17A',
      web: '#B6A17A',
      fp: '#B6A17A',
    } as Record<string, string>,
  },
  navigation: {
    pillBackground: 'rgba(27, 24, 22, 0.96)',
    pillBorder: 'rgba(245, 234, 211, 0.12)',
    pillShadow: '0 8px 18px rgba(0,0,0,0.24)',
    containerDivider: 'rgba(245, 234, 211, 0.08)',
    idleBackground: 'rgba(245, 234, 211, 0.025)',
    idleText: '#E0D3C2',
    hoverBackground: 'rgba(245, 234, 211, 0.065)',
    activeBackground: 'rgba(214, 197, 171, 0.16)',
    activeBorder: 'rgba(214, 197, 171, 0.22)',
    activeShadow: 'none',
    activeText: '#FFF5E7',
    backBackground: 'rgba(245, 234, 211, 0.06)',
    backHoverBackground: 'rgba(245, 234, 211, 0.09)',
    backBorder: 'rgba(245, 234, 211, 0.10)',
    backShadow: 'none',
    gazeBackgroundOn: 'rgba(228, 217, 198, 0.12)',
    gazeBackgroundOff: 'rgba(27, 24, 22, 0.96)',
    gazeBorderOn: 'rgba(224, 211, 194, 0.78)',
    gazeBorderOff: 'rgba(204, 191, 174, 0.46)',
    gazeGlow: '0 0 16px rgba(220, 209, 190, 0.14)',
    gazeTextOn: '#F5EAD3',
    gazeTextOff: '#E0D3C2',
    auxiliaryBackground: 'rgba(245, 234, 211, 0.04)',
    auxiliaryBorder: 'rgba(245, 234, 211, 0.08)',
    emergencyBackground: 'rgba(138, 74, 61, 0.36)',
    emergencyBorder: 'rgba(185, 120, 108, 0.52)',
    emergencyText: '#F0D7C8',
    emergencyHoverBackground: 'rgba(154, 90, 77, 0.42)',
    emergencyHoverBorder: 'rgba(196, 132, 120, 0.62)',
    emergencyGlow: '0 0 18px rgba(138, 74, 61, 0.18)',
  },
};

export const typography = {
  fontFamily: {
    primary: "'Atkinson Hyperlegible Next', 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif",
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
    bg: '#131412',
    glass: 'rgba(27, 28, 24, 0.94)',
    border: 'rgba(213, 216, 188, 0.12)',
    cardBg: '#20221E',
    cardBorder: '1.5px solid rgba(213, 216, 188, 0.12)',
    teal: '#D6C98E',
    tealIcon: '#D6C98E',
    text: '#ECEDE3',
    subtleBorder: 'rgba(213, 216, 188, 0.14)',
    red: '#8A463D',
    brand: '#B4AB96',
    dockSeparator: 'rgba(213, 216, 188, 0.10)',
    quickPhrasesBg: '#1B1C18',
    quickPhrasesBorder: '#3D4034',
    quickPhrasesText: '#ECEDE3',
  },
  phrases: {
    selectedColor: '#C69A45',
    sidebarBg: '#1B1C18',
    accentTeal: '#6FB7B1',
    cardBg: '#20221E',
    cardBorder: '1.5px solid rgba(213, 216, 188, 0.14)',
    selectedBg: 'rgba(198, 154, 69, 0.16)',
    aacLinkBg: 'rgba(111, 183, 177, 0.10)',
    aacLinkBorder: 'rgba(111, 183, 177, 0.24)',
    hindiText: '#D79A83',
  },
  medical: {
    airway: '#A64E3F',
    urgent: '#A64E3F',
    bed: '#C69A45',
    daily: '#8FAE72',
    symptoms: '#C7838F',
    sidebarBg: '#1B1C18',
    sidebarBorder: 'rgba(213, 216, 188, 0.14)',
    cardBg: '#20221E',
    cardBorder: '1.5px solid rgba(213, 216, 188, 0.14)',
    headerDivider: 'rgba(213, 216, 188, 0.14)',
  },
  activities: {
    selectedColor: '#C69A45',
    sidebarBg: '#1B1C18',
    accentTeal: '#6FB7B1',
    cardBg: '#20221E',
    cardBorder: '1.5px solid rgba(213, 216, 188, 0.14)',
    selectedBg: 'rgba(198, 154, 69, 0.16)',
    hindiSubtext: 'rgba(255, 235, 205, 0.9)',
  },
  keyboard: {
    shellBg: '#0E1620',
    textAreaBg: '#131B24',
    railBg: '#0F141C',
    railBorder: '#263649',
    keyBg: '#121821',
    keyHoverBg: '#18212C',
    keyBorder: '#243243',
    keyText: '#F3EFE8',
    keyTextMuted: '#A8B5C4',
    deleteWordBg: 'rgba(58, 41, 25, 0.96)',
    deleteWordColor: '#D7A152',
    speakBg: 'rgba(33, 50, 42, 0.94)',
    speakBorder: '#8FB49B',
    speakText: '#A7C8B0',
    deleteWordSoftBg: 'rgba(62, 40, 42, 0.94)',
    deleteWordSoftBorder: '#C28F8A',
    deleteWordSoftText: '#D6A6A0',
    predictionBg: '#141B24',
    predictionHoverBg: 'rgba(56, 189, 248, 0.10)',
  },
  web: {
    bg: '#0E1620',
    cardBg: '#223247',
    cardBorder: '2px solid rgba(42, 61, 82, 0.78)',
    textMain: '#F0EDE8',
    textSub: '#A8B5C4',
    accent: '#38BDF8',
    glass: 'rgba(19, 30, 46, 0.94)',
    chrome: '#8CB8D9',
    youtube: '#D4544C',
    ai: '#5FCDBD',
    whatsapp: '#84B69C',
    warning: '#D7A152',
    danger: '#E28C83',
    info: '#96C4E8',
    softInfo: '#B4D7EE',
    success: '#9CC5B1',
    status: '#7EC3DD',
  },
  floorPlan: {
    bg: '#0E1620',
    panelBg: '#131E2E',
    mutedPanel: '#172231',
    cardBg: '#223247',
    elevatedBg: '#1A2638',
    border: 'rgba(42, 61, 82, 0.82)',
    strongBorder: 'rgba(42, 61, 82, 0.94)',
    accent: '#74C6D4',
    accentStrong: '#38BDF8',
    accentSubtle: 'rgba(116, 198, 212, 0.12)',
    success: '#9CC5B1',
    successSubtle: 'rgba(156, 197, 177, 0.14)',
    warning: '#D7A152',
    warningSubtle: 'rgba(215, 161, 82, 0.14)',
    danger: '#E28C83',
    dangerSubtle: 'rgba(226, 140, 131, 0.14)',
    textMain: '#F0EDE8',
    textSub: '#A8B5C4',
    textDim: '#74879B',
    road: '#74B7D9',
    gridLine: 'rgba(42, 61, 82, 0.72)',
  },
  settings: {
    sidebarBg: '#172231',
    selectedColor: '#74C6D4',
    selectedBg: 'rgba(116, 198, 212, 0.12)',
    separatorColor: 'rgba(42, 61, 82, 0.72)',
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

export type Theme = 'dark' | 'light' | 'mix';
export const getColors = (theme: Theme) => theme === 'light' ? lightColors : darkColors;
export const createTheme = (theme: Theme) => ({
  colors: getColors(theme), typography, spacing, buttonSizes, dwellTiming, layout,
  screenLayouts, animations, accessibility, splitScreenLayouts, screenThemes,
});

export default {
  darkColors, lightColors, mixColors, typography, spacing, buttonSizes, dwellTiming, layout,
  screenLayouts, animations, accessibility, splitScreenLayouts, screenThemes, getColors, createTheme,
};
