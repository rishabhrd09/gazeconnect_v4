/**
 * GazeConnect Pro - Professional Design System
 * =============================================
 * Color philosophy: Subtle, professional, low-fatigue.
 * Inspired by Claude AI aesthetics, Tobii blue accents, Apple accessibility.
 */

export const darkColors = {
  background: {
    primary: '#171C19',
    secondary: '#1D241F',
    tertiary: '#262E28',
    elevated: '#2B342E',
    overlay: 'rgba(10, 13, 11, 0.78)',
  },
  text: {
    primary: '#F1F3ED',
    secondary: '#BBC6BE',
    tertiary: '#8E9B92',
    inverse: '#15231C',
  },
  border: {
    main: '#4A574D',
    light: '#333D36',
    focus: '#A5D0B9',
  },
  accent: {
    main: '#A5D0B9',      // sage — ordinary selection/action (dwell progress stays teal, see gaze.active)
    hover: '#BFE0CD',
    subtle: 'rgba(165, 208, 185, 0.14)',
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
    pillBackground: '#212823',
    pillBorder: '#4A574D',
    pillShadow: 'none',
    containerDivider: 'rgba(241, 243, 237, 0.10)',
    idleBackground: 'transparent',
    idleText: '#BBC6BE',
    hoverBackground: 'rgba(255,255,255,0.055)',
    activeBackground: '#263E30',
    activeBorder: 'rgba(165, 208, 185, 0.45)',
    activeShadow: 'none',
    activeText: '#F1F3ED',
    backBackground: 'rgba(255,255,255,0.045)',
    backHoverBackground: 'rgba(255,255,255,0.08)',
    backBorder: 'rgba(255,255,255,0.06)',
    backShadow: 'none',
    gazeBackgroundOn: 'rgba(45, 212, 191, 0.14)',
    gazeBackgroundOff: '#131815',
    gazeBorderOn: 'rgba(94, 224, 207, 0.85)',
    gazeBorderOff: '#63756A',
    gazeGlow: '0 0 14px rgba(45, 212, 191, 0.16)',
    gazeTextOn: '#D7F5EF',
    gazeTextOff: '#DDE3DC',
    auxiliaryBackground: 'rgba(255,255,255,0.05)',
    auxiliaryBorder: '#4A574D',
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
    inactive: '#1D241F',
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
    primary: '#FAF5ED',     // page bg ~91% L* — AAC-comfort cream
    secondary: '#F7F1E8',   // grouped panels
    tertiary: '#F4EFE7',    // sunken / nav rails
    elevated: '#FCF8F2',    // raised cards ~94% L*
    overlay: 'rgba(250, 245, 237, 0.94)',
  },
  text: {
    primary: '#26342D',     // 13.96:1 on cards — unified with warm mode
    secondary: '#5C665E',   // 5.88:1 on cards — subtitles
    tertiary: '#656D61',    // helper / hints
    inverse: '#FFF7EF',     // text on filled dark accents (cream, not pure white)
  },
  icon: {
    primary: '#26342D',
    onEmergency: '#FFF7EF',
    muted: '#656D61',
    warm: '#9F7857',
    olive: '#A48F63',
  },
  border: {
    main: '#D6CBBB',        // unified hairline (matches warm)
    light: '#E3DACD',
    focus: '#497775',       // teal focus / dwell ring
    strong: '#C2B6A3',
  },
  accent: {
    main: '#285C4D',        // primary action green — ordinary selection (dwell progress stays teal)
    hover: '#1F4A3E',
    subtle: '#E4EAD9',
    ring: '#497775',
  },
  success: {
    main: '#4F6F4A',        // deeper sage — readable as text (4.9:1 on its tint) and under white text (5.7:1)
    hover: '#3F5A3B',
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
    pillBackground: '#F7F1E8',
    pillBorder: '#D6CBBB',
    pillShadow: 'none',
    containerDivider: '#E3DACD',
    idleBackground: 'transparent',
    idleText: '#5C665E',
    hoverBackground: '#F0E9DD',
    activeBackground: '#E4EAD9',
    activeBorder: '#285C4D',
    activeShadow: 'none',
    activeText: '#26342D',
    backBackground: '#F7F1E8',
    backHoverBackground: '#F4EFE7',
    backBorder: '#D6CBBB',
    backShadow: 'none',
    gazeBackgroundOn: '#E7EEEA',
    gazeBackgroundOff: '#F7F1E8',
    gazeBorderOn: '#497775',
    gazeBorderOff: '#C2B6A3',
    gazeGlow: '0 3px 12px rgba(73, 119, 117, 0.16)',
    gazeTextOn: '#26342D',
    gazeTextOff: '#5C665E',
    auxiliaryBackground: '#F7F1E8',
    auxiliaryBorder: '#D6CBBB',
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
    text: '#26342D',
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
    primary: '#FAF5ED',     // page bg — slightly more peach undertone for warmer feel
    secondary: '#F7F1E8',   // grouped panels
    tertiary: '#F4EFE7',    // sunken / nav rail
    elevated: '#FCF8F2',    // raised cards — gentle cream paper, not bright white
    overlay: 'rgba(250, 245, 237, 0.94)',
  },
  text: {
    primary: '#26342D',     // 7.3:1 on #F7F2E8 — lifted from #2F2A26 for AAA on large
    secondary: '#5C665E',   // subtitles
    tertiary: '#656D61',    // hints / muted
    inverse: '#FFFDF8',     // text on filled dark accents
  },
  icon: {
    primary: '#26342D',
    onEmergency: '#FFF7EF',
    muted: '#656D61',
    warm: '#9F7857',
    olive: '#A48F63',
  },
  border: {
    main: '#D6CBBB',
    light: '#E3DACD',
    focus: '#6E8F8B',       // teal-grey focus / dwell ring
    strong: '#C2B6A3',
  },
  accent: {
    main: '#285C4D',        // primary action green — ordinary selection (dwell progress stays teal)
    hover: '#1F4A3E',
    subtle: '#E4EAD9',      // selected tint
    ring: '#6E8F8B',
  },
  success: {
    main: '#4F6F4A',        // deeper sage — readable as text (4.9:1 on its tint) and under white text (5.7:1)
    hover: '#3F5A3B',
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
    pillBackground: '#F7F1E8',
    pillBorder: '#D6CBBB',
    pillShadow: 'none',
    containerDivider: '#E3DACD',
    idleBackground: 'transparent',
    idleText: '#5C665E',
    hoverBackground: '#F0E9DD',
    activeBackground: '#E4EAD9',
    activeBorder: '#285C4D',
    activeShadow: 'none',
    activeText: '#26342D',
    backBackground: '#F7F1E8',
    backHoverBackground: '#F0E9DD',
    backBorder: '#D6CBBB',
    backShadow: 'none',
    gazeBackgroundOn: '#E7EEEA',
    gazeBackgroundOff: '#F7F1E8',
    gazeBorderOn: '#497775',
    gazeBorderOff: '#C2B6A3',
    gazeGlow: '0 3px 12px rgba(73, 119, 117, 0.16)',
    gazeTextOn: '#26342D',
    gazeTextOff: '#5C665E',
    auxiliaryBackground: '#F7F1E8',
    auxiliaryBorder: '#D6CBBB',
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
    text: '#26342D',
  },
};

// Per-screen warm-mode tokens (parallels screenThemes for warm theme)
export const warmScreenTokens = {
  home: {
    bgGradient: 'radial-gradient(circle at 50% 8%, #FCF4DD 0%, #F5EEDF 52%, #EBDDC2 100%)',
    bg: '#FAF5ED',
    cardBg: '#FCF8F2',
    cardBorder: '1.5px solid rgba(122, 99, 71, 0.22)',
    cardShadow: '0 6px 16px rgba(122, 99, 71, 0.12), 0 1px 3px rgba(122, 99, 71, 0.08)',
    cardShadowHover: '0 12px 26px rgba(122, 99, 71, 0.14), 0 2px 8px rgba(122, 99, 71, 0.10)',
    text: '#26342D',
    subtleText: '#5C665E',
    mutedText: '#656D61',
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
      kb:  '#FCF8F2',
      ph:  '#FCF8F2',
      ac:  '#FCF8F2',
      pp:  '#FCF8F2',
      med: '#FCF8F2',
      st:  '#FCF8F2',
      web: '#FCF8F2',
      fp:  '#FCF8F2',
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
    pageBg: '#FAF5ED',
    sidebarBg: '#F7F1E8',
    sidebarBorder: '#D6CBBB',
    cardBg: '#FCF8F2',
    cardBorder: '1.5px solid #D6CBBB',
    selectedBg: '#E4EAD9',                // soft sky-blue tint for selected (was teal-tinted #E7EEEA)
    selectedColor: '#285C4D',             // dusty sky blue selected accent
    selectedBorder: 'rgba(40, 92, 77, 0.40)',
    accentTeal: '#3F6968',                // deeper teal
    accentSky: '#4F7388',                 // sky blue — for sidebar / secondary accents
    accentCoral: '#A56D55',               // coral — for warm category accents
    cardText: '#26342D',
    hindiText: '#5C4F44',
    activatedBorder: '#285C4D',           // sky blue activation ring
    cardShadow: 'none',
    cardShadowActivated: '0 0 0 1px rgba(40, 92, 77, 0.36)',
  },
  medical: {
    pageBg: '#FAF5ED',
    cardBg: '#FCF8F2',
    cardBorder: '1.5px solid #D6CBBB',
    cardText: '#26342D',
    cardShadow: '0 6px 16px rgba(122, 99, 71, 0.12), 0 1px 3px rgba(122, 99, 71, 0.08)',
    sectionCardBg: '#FCF8F2',
    sectionBackCardBg: '#F4EFE7',
    sectionShadow: 'none',
    dividerColor: 'rgba(122, 99, 71, 0.22)',
    hindiColor: '#5C4F44',
    backIconColor: '#3F6968',           // deeper teal
    airway: '#7A312E',                  // deeper warm maroon — urgency
    urgent: '#7A312E',                  // deeper warm maroon — urgency
    bed: '#4F7388',                     // deeper dusty sky blue — position/comfort
    daily: '#5F7C58',                   // deeper sage — calm daily
    symptoms: '#A56D55',                // deeper warm coral — body symptoms
    sidebarBg: '#F7F1E8',
    sidebarBorder: '#D6CBBB',
    headerDivider: 'rgba(122, 99, 71, 0.22)',
  },
  activities: {
    pageBg: '#FAF5ED',
    sidebarBg: '#F7F1E8',
    cardBg: '#FCF8F2',
    cardBorder: '1.5px solid #D6CBBB',
    selectedBg: '#E4EAD9',                // warm gold-tint selected (was teal-tinted)
    selectedColor: '#285C4D',             // deeper rich gold — leisure/activities mood
    accentTeal: '#3F6968',                // deeper teal kept for back/icon
    accentGold: '#85703D',                // gold for activity category emphasis
    accentSky: '#4F7388',                 // sky blue — secondary accents
    hindiSubtext: '#5C4F44',
  },
  keyboard: {
    shellBg: '#FAF5ED',
    textAreaBg: '#FCF8F2',
    textAreaText: '#26342D',
    railBg: '#F7F1E8',
    railBorder: '#D6CBBB',
    keyBg: '#FCF8F2',
    keyHoverBg: '#F3E8D1',
    keyBorder: '#D6CBBB',
    keyText: '#26342D',
    keyTextMuted: '#5C665E',
    deleteWordBg: '#F1DBD1',              // soft deeper coral tint
    deleteWordColor: '#7A312E',           // deeper warm maroon
    speakBg: '#DFE8DC',                   // soft deeper sage tint
    speakBorder: '#5F7C58',               // deeper sage
    speakText: '#3F5A38',                 // sage text (AAA on cream)
    deleteWordSoftBg: '#F1DBD1',
    deleteWordSoftBorder: '#A56D55',      // deeper coral
    deleteWordSoftText: '#854A38',        // coral-text variant
    // Predictions hover-tinted with sky blue — adds variety to keyboard shell
    predictionBg: '#F7F1E8',
    predictionHoverBg: '#E2ECEF',         // soft sky-blue tint
    predictionAccent: '#4F7388',          // sky blue prediction accent
  },
  web: {
    bg: '#FAF5ED',
    cardBg: '#FCF8F2',
    cardBorder: '1.5px solid #D6CBBB',
    textMain: '#26342D',
    textSub: '#5C665E',
    textMuted: '#656D61',
    // Web hub leans into sky blue (deeper #4F7388) since the "global / browse"
    // metaphor is a sky-blue universe — the rest of the warm palette accents
    // build variety in icons/categories.
    accent: '#4F7388',                    // sky blue primary
    accentLine: '#4F7388',
    accentSelectedBg: '#E2ECEF',
    accentSelectedBorder: 'rgba(79, 115, 136, 0.36)',
    accentSelectedText: '#4F7388',
    glass: '#F7F1E8',
    glassBorder: '#D6CBBB',
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
    bg: '#FAF5ED',
    panelBg: '#F7F1E8',
    mutedPanel: '#F4EFE7',
    cardBg: '#FCF8F2',
    elevatedBg: '#FCF8F2',
    border: '#D6CBBB',
    strongBorder: '#C2B6A3',
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
    textMain: '#26342D',
    textSub: '#5C665E',
    textDim: '#656D61',
    road: '#7A5638',                      // deeper warm brown
    gridLine: 'rgba(122, 99, 71, 0.22)',
  },
  settings: {
    sidebarBg: '#F7F1E8',
    // Settings selected uses deeper sky blue — a distinct accent from the
    // teal used for primary actions, signaling "navigation/configuration"
    // rather than "execute/confirm". Reinforces the diversified palette.
    selectedColor: '#285C4D',             // sky blue selected accent
    selectedBg: '#E4EAD9',                // soft sky-blue tint
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
    bg: '#171C19',
    glass: '#1D241F',
    border: '#4A574D',
    cardBg: '#212823',
    cardBorder: '1.5px solid #4A574D',
    teal: '#B9CDA8',
    tealIcon: '#B9CDA8',
    text: '#F1F3ED',
    subtleBorder: '#4A574D',
    red: '#8A463D',
    brand: '#B9CDA8',
    dockSeparator: 'rgba(241, 243, 237, 0.10)',
    quickPhrasesBg: '#1D241F',
    quickPhrasesBorder: '#4A574D',
    quickPhrasesText: '#F1F3ED',
  },
  phrases: {
    selectedColor: '#A5D0B9',
    sidebarBg: '#1D241F',
    accentTeal: '#A5D0B9',
    cardBg: '#212823',
    cardBorder: '1.5px solid #4A574D',
    selectedBg: '#263E30',
    aacLinkBg: 'rgba(165, 208, 185, 0.10)',
    aacLinkBorder: 'rgba(165, 208, 185, 0.26)',
    hindiText: '#D79A83',
  },
  medical: {
    airway: '#A64E3F',
    urgent: '#A64E3F',
    bed: '#C69A45',
    daily: '#8FAE72',
    symptoms: '#C7838F',
    sidebarBg: '#1D241F',
    sidebarBorder: '#4A574D',
    cardBg: '#212823',
    cardBorder: '1.5px solid #4A574D',
    headerDivider: '#414D44',
  },
  activities: {
    selectedColor: '#A5D0B9',
    sidebarBg: '#1D241F',
    accentTeal: '#A5D0B9',
    cardBg: '#212823',
    cardBorder: '1.5px solid #4A574D',
    selectedBg: '#263E30',
    hindiSubtext: 'rgba(255, 235, 205, 0.9)',
  },
  keyboard: {
    shellBg: '#171C19',
    textAreaBg: '#1D241F',
    railBg: '#141916',
    railBorder: '#333D36',
    keyBg: '#212823',
    keyHoverBg: '#2A332D',
    keyBorder: '#4A574D',
    keyText: '#F1F3ED',
    keyTextMuted: '#BBC6BE',
    deleteWordBg: '#2C2921',
    deleteWordColor: '#DCC28D',
    speakBg: '#263E30',
    speakBorder: '#8FB49B',
    speakText: '#A5D0B9',
    deleteWordSoftBg: '#2F2624',
    deleteWordSoftBorder: '#A87970',
    deleteWordSoftText: '#E3A49B',
    predictionBg: '#1D241F',
    predictionHoverBg: 'rgba(165, 208, 185, 0.10)',
  },
  web: {
    bg: '#171C19',
    cardBg: '#212823',
    cardBorder: '1.5px solid #4A574D',
    textMain: '#F1F3ED',
    textSub: '#BBC6BE',
    accent: '#B28A45',
    glass: '#1D241F',
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
    bg: '#171C19',
    panelBg: '#1D241F',
    mutedPanel: '#1A201C',
    cardBg: '#2B342E',
    elevatedBg: '#212823',
    border: 'rgba(74, 87, 77, 0.85)',
    strongBorder: 'rgba(99, 117, 106, 0.92)',
    accent: '#A5D0B9',
    accentStrong: '#BFE0CD',
    accentSubtle: 'rgba(165, 208, 185, 0.12)',
    success: '#9CC5B1',
    successSubtle: 'rgba(156, 197, 177, 0.14)',
    warning: '#DCC28D',
    warningSubtle: 'rgba(220, 194, 141, 0.14)',
    danger: '#E3A49B',
    dangerSubtle: 'rgba(227, 164, 155, 0.14)',
    textMain: '#F1F3ED',
    textSub: '#BBC6BE',
    textDim: '#8E9B92',
    road: '#74B7D9',
    gridLine: 'rgba(74, 87, 77, 0.72)',
  },
  settings: {
    sidebarBg: '#1D241F',
    selectedColor: '#A5D0B9',
    selectedBg: '#263E30',
    separatorColor: 'rgba(74, 87, 77, 0.72)',
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
  cardBg: '#212823',
  cardBorder: '1.5px solid #4A574D',
  cardShadow: 'none',
  cardRadius: '22px',
  // Sidebar grammar (Phrases / Activities pattern)
  sidebarBg: '#1D241F',
  sidebarBorder: '1.5px solid #4A574D',
  sidebarSelectedAccent: '#A5D0B9',
  sidebarSelectedBg: '#263E30',
} as const;

export type Theme = 'dark' | 'warm';
export const getColors = (theme: Theme) =>
  theme === 'warm' ? warmColors
    : darkColors;
export const createTheme = (theme: Theme) => ({
  colors: getColors(theme), typography, spacing, buttonSizes, layout,
  screenLayouts, animations, accessibility, splitScreenLayouts, screenThemes,
});

export default {
  darkColors, lightColors, mixColors, warmColors, warmScreenTokens,
  typography, spacing, buttonSizes, layout,
  screenLayouts, animations, accessibility, splitScreenLayouts, screenThemes, getColors, createTheme,
};
