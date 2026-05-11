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
  // Text-safe accent variants — same shape as light/warm so callers can use
  // colors.accentText.gold uniformly across all themes. In dark mode the
  // saturated forms already pass contrast on dark bg, so these are aliased.
  accentText: {
    gold: '#F59E0B',     // bright on dark bg = ~10:1
    sage: '#34D399',
    rose: '#D4544C',
    teal: '#2DD4BF',
  },
};

// =====================================================================
// LIGHT MODE — "Professional Light" (AAC-industry brightness, v7)
// =====================================================================
// Page bg ~91% L*, card ~94% L* — matches Tobii Dynavox Communicator 5,
// Grid 3 Comfort, EyeGaze Edge, and Predictable (Therapy Box) light modes.
// Dimmed from default-OS-light (~97%) to AAC-comfort range to protect ALS
// users with reduced blink rate during multi-hour sessions.
//
// Same accent palette as Warm Mode (teal/maroon/gold/sage/rose) so brand
// identity is consistent across modes — only background luminance differs.
//
// Contrast verified on the v7 master:
//   #2F2A26 on #FAF5E8 = 12.94:1 (AAA — main text on card)
//   #2F2A26 on #F2EDE0 = 11.83:1 (AAA — main text on page)
//   #6A625B on #FAF5E8 = 5.50:1  (AA — secondary)
//   #497775 on #FAF5E8 = 4.62:1  (AA — teal text/icons)
//   #8A3B38 on #FAF5E8 = 6.99:1  (AAA — emergency text/icons)
//   #7E5A24 on #FAF5E8 = 5.72:1  (AAA — gold text variant)
//   #5F7057 on #FAF5E8 = 4.91:1  (AA — sage text variant)
//   #FFF7EF on #8A3B38 = 7.17:1  (AAA — text on emergency button)
// =====================================================================
export const lightColors = {
  background: {
    primary: '#F2EDE0',     // page bg ~91% L* — AAC-comfort cream
    secondary: '#EEE9DC',   // grouped panels
    tertiary: '#E7E0D0',    // sunken / nav rails
    elevated: '#FAF5E8',    // raised cards ~94% L*
    overlay: 'rgba(242, 237, 224, 0.94)',
  },
  text: {
    primary: '#2F2A26',     // 13.96:1 on cards — unified with warm mode
    secondary: '#6A625B',   // 5.88:1 on cards — subtitles
    tertiary: '#8A7C6B',    // helper / hints
    inverse: '#FFF7EF',     // text on filled dark accents (cream, not pure white)
  },
  icon: {
    primary: '#2F2A26',
    onEmergency: '#FFF7EF',
    muted: '#8A7C6B',
    warm: '#9F7857',
    olive: '#A48F63',
  },
  border: {
    main: '#DED2C2',        // unified hairline (matches warm)
    light: '#E4D9CC',
    focus: '#497775',       // teal focus / dwell ring
    strong: '#CBBCA9',
  },
  accent: {
    main: '#497775',        // muted teal — unified primary
    hover: '#3F6864',
    subtle: '#E7EEEA',
    ring: '#497775',
  },
  success: {
    main: '#7D9475',        // sage — unified
    hover: '#5F7057',
    subtle: '#E9EFE6',
  },
  warning: {
    main: '#C9A96B',        // warm gold — unified (icon/fill only — fails contrast for small text)
    hover: '#BE8542',
    subtle: '#F3E8D1',
    strong: '#D39C5C',
  },
  emergency: {
    main: '#8A3B38',        // warm maroon — unified
    hover: '#763431',
    deep: '#5A2528',
    soft: '#F4E3E0',
    subtle: '#F4E3E0',
  },
  navigation: {
    pillBackground: '#F4EFE2',
    pillBorder: '#DED2C2',
    pillShadow: '0 2px 6px rgba(122, 99, 71, 0.08)',
    containerDivider: '#E4D9CC',
    idleBackground: 'transparent',
    idleText: '#6A625B',
    hoverBackground: '#F3E8D1',
    activeBackground: '#E7EEEA',
    activeBorder: '#497775',
    activeShadow: 'inset 0 0 0 1px rgba(73, 119, 117, 0.20)',
    activeText: '#2F2A26',
    backBackground: '#EEE9DC',
    backHoverBackground: '#E7E0D0',
    backBorder: '#DED2C2',
    backShadow: 'none',
    gazeBackgroundOn: '#E7EEEA',
    gazeBackgroundOff: '#F4EFE2',
    gazeBorderOn: '#497775',
    gazeBorderOff: '#CBBCA9',
    gazeGlow: '0 3px 12px rgba(73, 119, 117, 0.16)',
    gazeTextOn: '#2F2A26',
    gazeTextOff: '#6A625B',
    auxiliaryBackground: '#EEE9DC',
    auxiliaryBorder: '#DED2C2',
  },
  category: {
    people: '#5F7C58',      // deeper sage
    medical: '#7A312E',     // deeper warm maroon
    needs: '#85703D',       // deeper rich gold
    feelings: '#6B5F84',    // deeper muted lavender
    actions: '#4F7388',     // deeper dusty sky blue
    activities: '#7A5223',  // deeper amber
    responses: '#586B4F',   // deeper olive
    courtesy: '#6F606A',    // deeper mauve
    keyboard: '#3F6968',    // deeper teal
    web: '#4F7388',         // deeper sky blue
    coral: '#A56D55',       // deeper coral
    skyBlue: '#7B9AAB',
  },
  quickfire: {
    yes: '#7D9475',
    no: '#A96B6C',
    wait: '#C9A96B',
    help: '#8A3B38',
    more: '#506E8B',
    done: '#7D9475',
    thanks: '#C9A96B',
    sorry: '#857580',
  },
  // Text-safe variants of saturated accents (for small text where the
  // saturated form fails WCAG; e.g. "gold" body text uses #7E5A24).
  accentText: {
    gold: '#7E5A24',        // 6.12:1 on cards — readable gold body text
    sage: '#5F7057',        // 5.24:1 on cards — readable sage body text
    rose: '#8B5E5F',        // readable rose body text
    teal: '#3F6968',        // deeper teal — text-safe
    sky: '#3D5E73',         // deeper sky-blue text — readable on cream
    coral: '#854A38',       // deeper coral text — readable on cream
    brown: '#5C3F26',       // deeper brown text
  },
  // Parallel cross-screen accent set (matches warmScreenTokens.accents)
  accents: {
    teal: '#3F6968',
    sky: '#4F7388',
    sage: '#5F7C58',
    gold: '#85703D',
    coral: '#A56D55',
    maroon: '#7A312E',
    umber: '#65543E',
    brown: '#7A5638',
    peach: '#D89B7E',
    lavender: '#6B5F84',
  },
  gaze: {
    active: '#497775',
    activeSubtle: 'rgba(73, 119, 117, 0.14)',
    inactive: '#A48F63',
    text: '#2F2A26',
  },
};

// =====================================================================
// WARM MODE — Warm-paper / medical-grade aesthetic (from WARM_PAPER_PALETTE)
// =====================================================================
// Premium paper-like surfaces, low glare, fatigue-resistant for long-duration
// eye-gaze sessions. Reference: research-team color-system document. Hard rule:
// NO pure white, NO pure black, NO highly saturated cool primaries.
// Primary action = muted teal (#497775). Emergency = warm maroon (#8A3B38).
// =====================================================================
export const warmColors = {
  background: {
    primary: '#F5EEDF',     // page bg — slightly more peach undertone for warmer feel
    secondary: '#F8F1DF',   // grouped panels
    tertiary: '#EDE3CD',    // sunken / nav rail
    elevated: '#FBF5E5',    // raised cards — gentle cream paper, not bright white
    overlay: 'rgba(245, 238, 223, 0.94)',
  },
  text: {
    primary: '#2F2A26',     // 7.3:1 on #F7F2E8 — lifted from #2F2A26 for AAA on large
    secondary: '#6A625B',   // subtitles
    tertiary: '#8A7C6B',    // hints / muted
    inverse: '#FFFDF8',     // text on filled dark accents
  },
  icon: {
    primary: '#2F2A26',
    onEmergency: '#FFF7EF',
    muted: '#8A7C6B',
    warm: '#9F7857',
    olive: '#A48F63',
  },
  border: {
    main: '#DED2C2',
    light: '#E5DBCC',
    focus: '#6E8F8B',       // teal-grey focus / dwell ring
    strong: '#CBBCA9',
  },
  accent: {
    main: '#497775',        // muted teal (primary active)
    hover: '#467472',
    subtle: '#E7EEEA',      // active background tint
    ring: '#6E8F8B',
  },
  success: {
    main: '#7D9475',        // dusty sage
    hover: '#6C8364',
    subtle: '#E9EFE6',
  },
  warning: {
    main: '#C9A96B',        // warm gold (daily-care)
    hover: '#B5965A',
    subtle: '#F3E8D1',
    strong: '#D39C5C',      // stronger CTA gold
  },
  emergency: {
    main: '#8A3B38',        // warm maroon
    hover: '#763431',
    deep: '#5A2528',
    soft: '#F4E3E0',
    subtle: '#F4E3E0',
  },
  navigation: {
    pillBackground: '#FBF6EC',
    pillBorder: '#DED2C2',
    pillShadow: '0 2px 6px rgba(122, 99, 71, 0.08)',
    containerDivider: '#E5DBCC',
    idleBackground: 'transparent',
    idleText: '#6A625B',
    hoverBackground: '#F3E8D1',
    activeBackground: '#E7EEEA',
    activeBorder: '#497775',
    activeShadow: 'inset 0 0 0 1px rgba(73, 119, 117, 0.20)',
    activeText: '#2F2A26',
    backBackground: '#FAF4EA',
    backHoverBackground: '#EFE7D8',
    backBorder: '#DED2C2',
    backShadow: 'none',
    gazeBackgroundOn: '#E7EEEA',
    gazeBackgroundOff: '#FBF6EC',
    gazeBorderOn: '#497775',
    gazeBorderOff: '#CBBCA9',
    gazeGlow: '0 3px 12px rgba(73, 119, 117, 0.16)',
    gazeTextOn: '#2F2A26',
    gazeTextOff: '#6A625B',
    auxiliaryBackground: '#FAF4EA',
    auxiliaryBorder: '#DED2C2',
  },
  category: {
    people: '#5F7C58',      // deeper sage — family / calm
    medical: '#7A312E',     // deeper warm maroon — urgency
    needs: '#85703D',       // deeper rich gold — daily-care
    feelings: '#6B5F84',    // deeper muted lavender
    actions: '#4F7388',     // deeper dusty sky blue — actions speak
    activities: '#7A5223',  // deeper amber — leisure
    responses: '#586B4F',   // deeper olive
    courtesy: '#6F606A',    // deeper mauve
    keyboard: '#3F6968',    // deeper teal
    web: '#4F7388',         // deeper dusty sky blue
    coral: '#A56D55',       // deeper warm coral
    peach: '#D89B7E',       // deeper peach
    skyBlue: '#7B9AAB',     // deeper sky blue
    brown: '#7A5638',       // deeper warm brown
    umber: '#65543E',       // deeper umber
  },
  quickfire: {
    yes: '#7D9475',         // sage
    no: '#A96B6C',          // muted rose
    wait: '#C9A96B',
    help: '#8A3B38',        // emergency maroon for help
    more: '#547F9C',
    done: '#7D9475',
    thanks: '#C9A96B',
    sorry: '#857580',
  },
  // Text-safe variants of saturated accents (for small text where the
  // saturated form fails WCAG; e.g. "gold" body text uses #7E5A24).
  accentText: {
    gold: '#7E5A24',        // 6.12:1 on #FFFDF8 — readable gold body text
    sage: '#5F7057',        // 5.24:1 on #FFFDF8 — readable sage body text
    rose: '#8B5E5F',        // readable rose body text
    teal: '#3F6968',        // deeper teal — text-safe on cream
    sky: '#3D5E73',         // deeper sky-blue text — readable on cream
    coral: '#854A38',       // deeper coral text — readable on cream
    brown: '#5C3F26',       // deeper brown text
  },
  gaze: {
    active: '#497775',      // teal
    activeSubtle: 'rgba(73, 119, 117, 0.14)',
    inactive: '#A48F63',
    text: '#2F2A26',
  },
};

// Per-screen warm-mode tokens (parallels screenThemes for warm theme)
export const warmScreenTokens = {
  home: {
    bgGradient: 'radial-gradient(circle at 50% 8%, #FCF4DD 0%, #F5EEDF 52%, #EBDDC2 100%)',
    bg: '#F5EEDF',
    cardBg: '#FBF5E5',
    cardBorder: '1.5px solid rgba(122, 99, 71, 0.22)',
    cardShadow: '0 6px 16px rgba(122, 99, 71, 0.12), 0 1px 3px rgba(122, 99, 71, 0.08)',
    cardShadowHover: '0 12px 26px rgba(122, 99, 71, 0.14), 0 2px 8px rgba(122, 99, 71, 0.10)',
    text: '#2F2A26',
    subtleText: '#6A625B',
    mutedText: '#8A7C6B',
    brand: 'rgba(47, 42, 38, 0.74)',
    dockSeparator: 'rgba(122, 99, 71, 0.22)',
    quickPhrasesBg: '#F3E8D1',
    quickPhrasesBorder: 'rgba(122, 99, 71, 0.24)',
    quickPhrasesText: '#4B3525',
    quickPhrasesShadow: '0 8px 16px rgba(122, 99, 71, 0.10), 0 1px 2px rgba(122, 99, 71, 0.06)',
    emergencyBg: '#8A3B38',
    emergencyHover: '#763431',
    emergencyText: '#FFF7EF',
    emergencySoft: '#F4E3E0',
    placeholderBg: 'rgba(122, 99, 71, 0.07)',
    placeholderBorder: 'rgba(122, 99, 71, 0.16)',
    dividerBackground: 'linear-gradient(180deg, transparent 0%, rgba(122, 99, 71, 0.20) 50%, transparent 100%)',
    tileSurfaces: {
      kb:  '#FBF5E5',
      ph:  '#FBF5E5',
      ac:  '#FBF5E5',
      pp:  '#FBF5E5',
      med: '#FBF5E5',
      st:  '#FBF5E5',
      web: '#FBF5E5',
      fp:  '#FBF5E5',
    } as Record<string, string>,
    // Home tile icon palette — 8 distinct DEEPER, RICHER warm-muted tones.
    // Each color is the saturated/darkened "richer" version of its previous
    // pastel — gives the home grid a more confident, premium-medical look
    // while staying eye-friendly (all colors retain low chroma + warm undertone).
    // Cards stay uniform cream; differentiation comes from the icon color only.
    badgeFills: {
      kb:  '#3F6968',  // deeper muted teal — keyboard / primary action
      ph:  '#A56D55',  // deeper warm coral — phrases / communication warmth
      ac:  '#85703D',  // deeper rich gold — activities / leisure
      pp:  '#5F7C58',  // deeper sage — people / family / calm
      med: '#7A312E',  // deeper warm maroon — assistance / daily care urgency
      st:  '#65543E',  // deeper warm umber — settings / utility
      web: '#4F7388',  // deeper dusty sky blue — web / global
      fp:  '#B0884E',  // warm antique gold — design home / architectural-home-design feel
    } as Record<string, string>,
  },
  phrases: {
    pageBg: '#F5EEDF',
    sidebarBg: '#FBF6EC',
    sidebarBorder: '#DED2C2',
    cardBg: '#FBF5E5',
    cardBorder: '1.5px solid #DED2C2',
    selectedBg: '#E2ECEF',                // soft sky-blue tint for selected (was teal-tinted #E7EEEA)
    selectedColor: '#4F7388',             // dusty sky blue selected accent
    selectedBorder: 'rgba(79, 115, 136, 0.36)',
    accentTeal: '#3F6968',                // deeper teal
    accentSky: '#4F7388',                 // sky blue — for sidebar / secondary accents
    accentCoral: '#A56D55',               // coral — for warm category accents
    cardText: '#2F2A26',
    hindiText: '#5C4F44',
    activatedBorder: '#4F7388',           // sky blue activation ring
    cardShadow: '0 6px 16px rgba(122, 99, 71, 0.12), 0 1px 3px rgba(122, 99, 71, 0.08)',
    cardShadowActivated: '0 0 0 1px rgba(79, 115, 136, 0.32), 0 8px 18px rgba(122, 99, 71, 0.14)',
  },
  medical: {
    pageBg: '#F5EEDF',
    cardBg: '#FBF5E5',
    cardBorder: '1.5px solid #DED2C2',
    cardText: '#2F2A26',
    cardShadow: '0 6px 16px rgba(122, 99, 71, 0.12), 0 1px 3px rgba(122, 99, 71, 0.08)',
    sectionCardBg: '#F8F1DF',
    sectionBackCardBg: '#EDE3CD',
    sectionShadow: '0 4px 14px rgba(122, 99, 71, 0.10)',
    dividerColor: 'rgba(122, 99, 71, 0.22)',
    hindiColor: '#5C4F44',
    backIconColor: '#3F6968',           // deeper teal
    airway: '#7A312E',                  // deeper warm maroon — urgency
    urgent: '#7A312E',                  // deeper warm maroon — urgency
    bed: '#4F7388',                     // deeper dusty sky blue — position/comfort
    daily: '#5F7C58',                   // deeper sage — calm daily
    symptoms: '#A56D55',                // deeper warm coral — body symptoms
    sidebarBg: '#FBF6EC',
    sidebarBorder: '#DED2C2',
    headerDivider: 'rgba(122, 99, 71, 0.22)',
  },
  activities: {
    pageBg: '#F5EEDF',
    sidebarBg: '#FBF6EC',
    cardBg: '#FBF5E5',
    cardBorder: '1.5px solid #DED2C2',
    selectedBg: '#F1E5D7',                // warm gold-tint selected (was teal-tinted)
    selectedColor: '#85703D',             // deeper rich gold — leisure/activities mood
    accentTeal: '#3F6968',                // deeper teal kept for back/icon
    accentGold: '#85703D',                // gold for activity category emphasis
    accentSky: '#4F7388',                 // sky blue — secondary accents
    hindiSubtext: '#5C4F44',
  },
  keyboard: {
    shellBg: '#F5EEDF',
    textAreaBg: '#FBF5E5',
    textAreaText: '#2F2A26',
    railBg: '#FBF6EC',
    railBorder: '#DED2C2',
    keyBg: '#FBF5E5',
    keyHoverBg: '#F3E8D1',
    keyBorder: '#DED2C2',
    keyText: '#2F2A26',
    keyTextMuted: '#6A625B',
    deleteWordBg: '#F1DBD1',              // soft deeper coral tint
    deleteWordColor: '#7A312E',           // deeper warm maroon
    speakBg: '#DFE8DC',                   // soft deeper sage tint
    speakBorder: '#5F7C58',               // deeper sage
    speakText: '#3F5A38',                 // sage text (AAA on cream)
    deleteWordSoftBg: '#F1DBD1',
    deleteWordSoftBorder: '#A56D55',      // deeper coral
    deleteWordSoftText: '#854A38',        // coral-text variant
    // Predictions hover-tinted with sky blue — adds variety to keyboard shell
    predictionBg: '#FBF6EC',
    predictionHoverBg: '#E2ECEF',         // soft sky-blue tint
    predictionAccent: '#4F7388',          // sky blue prediction accent
  },
  web: {
    bg: '#F5EEDF',
    cardBg: '#FBF5E5',
    cardBorder: '1.5px solid #DED2C2',
    textMain: '#2F2A26',
    textSub: '#6A625B',
    textMuted: '#8A7C6B',
    // Web hub leans into sky blue (deeper #4F7388) since the "global / browse"
    // metaphor is a sky-blue universe — the rest of the warm palette accents
    // build variety in icons/categories.
    accent: '#4F7388',                    // sky blue primary
    accentLine: '#4F7388',
    accentSelectedBg: '#E2ECEF',
    accentSelectedBorder: 'rgba(79, 115, 136, 0.36)',
    accentSelectedText: '#4F7388',
    glass: '#FBF6EC',
    glassBorder: '#DED2C2',
    chrome: '#4F7388',                    // sky-blue chrome
    youtube: '#A56D55',                   // deeper coral
    ai: '#5F7C58',                        // deeper sage
    whatsapp: '#5F7C58',
    warning: '#85703D',                   // deeper rich gold
    danger: '#A56D55',                    // deeper coral
    info: '#4F7388',                      // sky blue
    softInfo: '#E2ECEF',                  // soft sky-blue tint
    success: '#5F7C58',                   // deeper sage
    status: '#4F7388',                    // sky blue
    chromePillSelected: '#E2ECEF',
    chromePillSelectedBorder: 'rgba(79, 115, 136, 0.36)',
    chromePillSelectedText: '#4F7388',
    watchModeBg: 'rgba(122, 49, 46, 0.12)',
    watchModeText: '#7A312E',             // deeper maroon
    controlModeBg: 'rgba(79, 115, 136, 0.14)',
    controlModeText: '#4F7388',           // sky blue control
  },
  floorPlan: {
    bg: '#F5EEDF',
    panelBg: '#F8F1DF',
    mutedPanel: '#EDE3CD',
    cardBg: '#FBF5E5',
    elevatedBg: '#FBF5E5',
    border: '#DED2C2',
    strongBorder: '#CBBCA9',
    // Floor plan uses dual-accent: deeper teal for primary actions,
    // sky blue for secondary "info / map" affordances.
    accent: '#3F6968',                    // deeper muted teal
    accentStrong: '#2F5C5B',
    accentSubtle: '#DCE7E5',
    accentSky: '#4F7388',                 // deeper dusty sky blue secondary
    accentSkySubtle: '#E2ECEF',
    success: '#5F7C58',                   // deeper sage
    successSubtle: '#DFE8DC',
    warning: '#85703D',                   // deeper rich gold
    warningSubtle: '#EFE3C8',
    danger: '#A56D55',                    // deeper coral
    dangerSubtle: '#F1DBD1',
    textMain: '#2F2A26',
    textSub: '#6A625B',
    textDim: '#8A7C6B',
    road: '#7A5638',                      // deeper warm brown
    gridLine: 'rgba(122, 99, 71, 0.22)',
  },
  settings: {
    sidebarBg: '#FBF6EC',
    // Settings selected uses deeper sky blue — a distinct accent from the
    // teal used for primary actions, signaling "navigation/configuration"
    // rather than "execute/confirm". Reinforces the diversified palette.
    selectedColor: '#4F7388',             // sky blue selected accent
    selectedBg: '#E2ECEF',                // soft sky-blue tint
    separatorColor: 'rgba(122, 99, 71, 0.22)',
    accentTeal: '#3F6968',
    accentSky: '#4F7388',
    accentGold: '#85703D',
    accentSage: '#5F7C58',
    accentCoral: '#A56D55',
    accentMaroon: '#7A312E',
  },
  // Cross-screen reusable accent set — pulls deeper diversified tones into
  // any future screen that needs a small color palette without re-declaring.
  accents: {
    teal: '#3F6968',
    sky: '#4F7388',
    sage: '#5F7C58',
    gold: '#85703D',
    coral: '#A56D55',
    maroon: '#7A312E',
    umber: '#65543E',
    brown: '#7A5638',
    peach: '#D89B7E',
    lavender: '#6B5F84',
  },
  cursor: {
    normal: '#6E8F8B',
    locked: '#497775',
    disabled: '#A69A8E',
  },
} as const;

export const mixColors = {
  home: {
    root: '#17130F',
    text: '#180F08',
    subtleText: '#4E3D29',
    mutedText: '#665136',
    // Brand title — lifted from #927754 (~4.1:1) to #B49362 (~6.2:1 AA on dark page)
    brand: '#B49362',
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
    // Card surfaces — uniform warm tan #B6A17A. All tiles use the same color so the
    // home grid matches the Daily Assistance + Medical inner screens (which already
    // use this tan). Category differentiation comes from icon colors only — never
    // from card-bg variation. This is the "paper-on-desk" cohesive set the user approves.
    tileSurfaces: {
      kb:  '#B6A17A',
      ph:  '#B6A17A',
      ac:  '#B6A17A',
      pp:  '#B6A17A',
      med: '#B6A17A',
      st:  '#B6A17A',
      web: '#B6A17A',
      fp:  '#B6A17A',
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
    bg: '#11140F',
    cardBg: '#20221E',
    cardBorder: '1.5px solid rgba(213, 216, 188, 0.14)',
    textMain: '#ECEDE3',
    textSub: '#B4B8A9',
    accent: '#B28A45',
    glass: 'rgba(25, 31, 24, 0.94)',
    chrome: '#648D8B',
    youtube: '#9A5D54',
    ai: '#6F9B96',
    whatsapp: '#7F9A70',
    warning: '#C19A5B',
    danger: '#D69A8C',
    info: '#8EA9B7',
    softInfo: '#A9CAC7',
    success: '#A7BE99',
    status: '#8EA9B7',
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

/**
 * Shared card surface tokens — single source of truth for the warm-dark card
 * surface used across MedicalScreen (Daily Assistance), Phrases, Activities,
 * and the Web Browsing hub. Consuming screens should reference these tokens
 * rather than re-declaring their own card surface values.
 */
export const sharedCardTokens = {
  cardBg: '#20221E',
  cardBorder: '1.5px solid rgba(213, 216, 188, 0.14)',
  cardShadow: '0 8px 18px rgba(0,0,0,0.22)',
  cardRadius: '22px',
  // Sidebar grammar (Phrases / Activities pattern)
  sidebarBg: '#1B1C18',
  sidebarBorder: '1.5px solid rgba(213, 216, 188, 0.12)',
  sidebarSelectedAccent: '#C69A45',
  sidebarSelectedBg: 'rgba(198, 154, 69, 0.16)',
} as const;

export type Theme = 'dark' | 'light' | 'mix' | 'warm';
export const getColors = (theme: Theme) =>
  theme === 'light' ? lightColors
    : theme === 'warm' ? warmColors
    : darkColors;
export const createTheme = (theme: Theme) => ({
  colors: getColors(theme), typography, spacing, buttonSizes, dwellTiming, layout,
  screenLayouts, animations, accessibility, splitScreenLayouts, screenThemes,
});

export default {
  darkColors, lightColors, mixColors, warmColors, warmScreenTokens,
  typography, spacing, buttonSizes, dwellTiming, layout,
  screenLayouts, animations, accessibility, splitScreenLayouts, screenThemes, getColors, createTheme,
};
