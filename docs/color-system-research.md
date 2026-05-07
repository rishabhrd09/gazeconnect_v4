# GazeConnect Color System Research & Recommendation

Date: 2026-04-24

Scope: research and recommendation only. No source code changes were made.

## 1. Executive Summary

GazeConnect currently has three theme states: `dark`, `light`, and `mix`. The code implements them through `ThemeContext`, persisted in `localStorage` as `gc-theme`, with `isLight` and `isMix` branches used most visibly on the home screen. Light mode is the most coherent of the three: warm cream surfaces, terracotta emergency cards, and dark warm text. It should mostly stay. Its one clear issue is that light emergency text is just below WCAG AA in the current implementation.

Dark mode is the mode that needs the strongest correction. The current code is partly cool blue-slate (`screenThemes.home.bg`, nav, quick phrases) and partly warm cocoa cards (`HomeScreen` card background), with colored icon badges. That direction is promising, but the system is not complete: emergency cards are muted, the top emergency nav button is low contrast, and the palette still carries cool-slate remnants. The attached dark-mode idea using a near-black warm root, cocoa/olive cards, cream text, and muted category badges is the right direction. My verdict on the warm + olive combination: keep it, but use olive as a low-chroma structural tint, not as a saturated green card family. The card/base combination in the image feels calm, premium, and less clinical than blue-slate; it also better matches long-duration AAC use because it reduces blue glow and color temperature conflict.

Mix mode is manually selected in Settings; it is not automatically triggered by time of day. The code currently treats Mix as a dark-mode setting for global app behavior (`isDarkMode: true`) while `HomeScreen` uses its own mixed palette. Visually, Mix is best defined as a dim-room "spotlight" mode: dark root, warm sand cards, dark text on cards, and warm saturated emergency cards. That makes it genuinely distinct from both Light and Dark instead of a muddy middle.

Industry AAC products converge on a pattern: stable layouts, neutral or high-contrast backgrounds, category color coding as a navigational/linguistic cue, and user-adjustable color intensity. TD Snap Core First High Contrast uses a dark background and reduced visual complexity for low-vision users. Proloquo2Go defaults to Modified Fitzgerald color coding, often as borders for core/template buttons and bleached fills for fringe buttons, and explicitly recommends black page backgrounds for some users. Smartbox Super Core and WordPower document Modified Fitzgerald-style color coding. TouchChat/WordPower and LAMP Words for Life also use stable motor layouts plus part-of-speech color coding. The evidence supports color as a cue, but not as the only cue; color should be paired with label text, icon shape, layout position, and contrast.

Recommended direction:

- Light mode: keep warm cream/terracotta, darken emergency slightly and darken secondary text enough to reach AAA on cards.
- Dark mode: move fully to warm cohesive dark: root `#131412`, card `#20221E`, primary text `#ECEDE3`, pale olive neutral borders, and category color as icon badge only.
- Mix mode: define as dim-room spotlight: root `#17130F`, card `#E2D3B2`, primary text `#23180C`, emergency `#D16F54` with dark text, and the same category hues in icon badges only.
- Accent technique: use colored icon badges only. Do not use colored card borders, colored left bars, or colored outlines on category cards. This preserves category signaling without making card boundaries visually noisy.

## 2. Current State Audit

### 2.1 Theme And Color Files Found

| File | Summary |
|---|---|
| `src/utils/design.ts` | Central color tokens: `darkColors`, `lightColors`, `mixColors`, `screenThemes`, typography, spacing, dwell timing, layout, and theme factory. |
| `src/contexts/ThemeContext.tsx` | Defines `Theme = 'dark' | 'light' | 'mix'`; persists `gc-theme`; sets `data-theme` and `.theme-*` classes on `html` and `body`. |
| `src/screens/HomeScreen.tsx` | Main effective home palette assembly. It overrides central tokens for each mode and contains dark/mix emergency priority maps and dark category icon badge fills. |
| `src/lightmode.css` | CSS-only light-mode overrides and CSS variables for warm cream/terracotta mode. No equivalent full CSS file exists for mix. |
| `src/index.css` | Global dark defaults for body and scrollbar colors. |
| `src/components/GlobalNavBar.tsx` | Uses only `isDarkMode` to choose `darkColors` or `lightColors`; contains hard-coded emergency nav colors and no explicit `isMix` support. |
| `src/App.tsx` | App shell still selects `darkColors` or `lightColors` from `settings.isDarkMode`; connection indicator and persistent emergency button do not know about `theme === 'mix'`. |
| `src/components/core/GazeControlToggle.tsx` | Gaze ON/OFF button uses `darkColors`/`lightColors` and hard-coded green border. |
| `src/components/shared/QuickWordsGrid.tsx` and many screens | Several screens still branch on `isDarkMode` and only partially consult `useTheme`; these are migration impact items. |

### 2.2 Current Home Palette: Light Mode

| Role | Current value | Source |
|---|---:|---|
| Root background | `#ECE5D9` | `src/utils/design.ts:107`, `src/screens/HomeScreen.tsx:162` |
| Card background | `#F7F2EA` | `src/utils/design.ts:107`, `src/screens/HomeScreen.tsx:163` |
| Card border | `#DED2BF` | `src/utils/design.ts:116`, `src/screens/HomeScreen.tsx:164` |
| Primary text | `#2B2622` | `src/utils/design.ts:111`, `src/screens/HomeScreen.tsx:177` |
| Secondary text | `#62584D` | `src/utils/design.ts:111`, `src/screens/HomeScreen.tsx:178` |
| Tertiary / muted text | `#847565` | `src/utils/design.ts:111`, `src/screens/HomeScreen.tsx:179` |
| Brand mark color | `#847565` | `src/screens/HomeScreen.tsx:180` |
| Icon primary | `#1F1B18` | `src/utils/design.ts:114`, `src/screens/HomeScreen.tsx:176` |
| Emergency background | `#B35A4B` | `src/utils/design.ts:120`, `src/screens/HomeScreen.tsx:186` |
| Emergency hover | `#9E4A3D` | `src/utils/design.ts:120`, `src/screens/HomeScreen.tsx:187` |
| Emergency text | `#FBF7F1` | `src/utils/design.ts:111`, `src/screens/HomeScreen.tsx:188` |
| Emergency soft/tint | `#E4C0B5` | `src/utils/design.ts:120`, `src/screens/HomeScreen.tsx:189` |
| Quick Phrases pill bg | `#F7F2EA` | `src/screens/HomeScreen.tsx:182` |
| Quick Phrases pill border | `#DED2BF` | `src/screens/HomeScreen.tsx:183` |
| Quick Phrases pill text | `#2B2622` | `src/screens/HomeScreen.tsx:184` |
| Divider/separator | `rgba(203, 188, 166, 0.42)` gradient | `src/screens/HomeScreen.tsx:192` |
| Placeholder bg | `#EFE7DA` | `src/utils/design.ts:107`, `src/screens/HomeScreen.tsx:190` |
| Placeholder border | `#DED2BF` | `src/screens/HomeScreen.tsx:191` |
| Connected indicator | success `#6E8C5C` over `rgba(107,142,90,0.08)` in light CSS | `src/lightmode.css:661-665`, `src/App.tsx:399-403` |
| Gaze ON/OFF toggle border | `#CBBCA6` for nav off/on; standalone ON hard-coded `#34C759` | `src/utils/design.ts:139-140`, `src/components/core/GazeControlToggle.tsx:377` |
| Shadow color(s) | `rgba(139,121,104,0.10/0.08/0.12)` | `src/screens/HomeScreen.tsx:165`, `src/lightmode.css:59-62` |
| Per-tile surface overrides | all tiles `#F7F2EA` | `src/screens/HomeScreen.tsx:166-175` |

### 2.3 Current Home Palette: Mix Mode

| Role | Current value | Source |
|---|---:|---|
| Root background | `#0E1620` | `src/utils/design.ts:165`, `src/screens/HomeScreen.tsx:194` |
| Card background | default `#3A4A52` | `src/screens/HomeScreen.tsx:195` |
| Card border | `rgba(245,234,211,0.08)` | `src/utils/design.ts:170`, `src/screens/HomeScreen.tsx:196` |
| Primary text | `#F5EAD3` | `src/utils/design.ts:166`, `src/screens/HomeScreen.tsx:200` |
| Secondary text | `#D7C7AF` | `src/utils/design.ts:167`, `src/screens/HomeScreen.tsx:201` |
| Tertiary / muted text | `#B9A992` | `src/utils/design.ts:168`, `src/screens/HomeScreen.tsx:202` |
| Brand mark color | `rgba(223,209,187,0.72)` | `src/utils/design.ts:169`, `src/screens/HomeScreen.tsx:203` |
| Icon primary | `#F5EAD3` | `src/screens/HomeScreen.tsx:199` |
| Emergency background | `#8A4A3D` for default high priority; alternates listed below | `src/utils/design.ts:177`, `src/screens/HomeScreen.tsx:403-406` |
| Emergency hover | `#9A5A4D` | `src/utils/design.ts:178`, `src/screens/HomeScreen.tsx:210` |
| Emergency text | `#F5EAD3` | `src/screens/HomeScreen.tsx:211`, `src/screens/HomeScreen.tsx:564` |
| Emergency soft/tint | `#C0927F` | `src/utils/design.ts:179`, `src/screens/HomeScreen.tsx:212` |
| Quick Phrases pill bg | `#1E1C1A` | `src/utils/design.ts:173`, `src/screens/HomeScreen.tsx:205` |
| Quick Phrases pill border | `rgba(245,234,211,0.14)` | `src/utils/design.ts:174`, `src/screens/HomeScreen.tsx:206` |
| Quick Phrases pill text | `#F5EAD3` | `src/utils/design.ts:175`, `src/screens/HomeScreen.tsx:207` |
| Divider/separator | `rgba(245,234,211,0.08)` gradient | `src/utils/design.ts:182`, `src/screens/HomeScreen.tsx:215` |
| Placeholder bg | `rgba(245,234,211,0.03)` | `src/utils/design.ts:180`, `src/screens/HomeScreen.tsx:213` |
| Placeholder border | `rgba(245,234,211,0.10)` | `src/utils/design.ts:181`, `src/screens/HomeScreen.tsx:214` |
| Connected indicator | Uses dark `success` because Mix sets `isDarkMode: true` | `src/components/settings/panels/AppSettingsPanel.tsx:481`, `src/App.tsx:224-227,399-403` |
| Gaze ON/OFF toggle border | Uses dark navigation colors because Mix sets `isDarkMode: true` | `src/components/settings/panels/AppSettingsPanel.tsx:481`, `src/utils/design.ts:65-66` |
| Shadow color(s) | `0 6px 14px rgba(0,0,0,0.18)` | `src/utils/design.ts:171`, `src/screens/HomeScreen.tsx:197` |
| Per-tile surface overrides | `kb #3A4A52`, `ph #3D4D3A`, `ac #5C4A2E`, `pp #5C3D42`, `med #3D4052`, `st #3A3530`, `web #4A3745`, `fp #6A562B` | `src/utils/design.ts:183-191` |

Mix emergency priority maps:

| Priority/color key | Background | Shadow | Source |
|---|---:|---:|---|
| high `red` | `#8A4A3D` | `#9A5A4D` | `src/screens/HomeScreen.tsx:403` |
| high `crimson` | `#7A4650` | `#A27783` | `src/screens/HomeScreen.tsx:404` |
| high `muted_red` | `#7F4A43` | `#A97E72` | `src/screens/HomeScreen.tsx:405` |
| high `muted_crimson` | `#6E444E` | `#96717A` | `src/screens/HomeScreen.tsx:406` |
| medium `blue` | `#43505B` | `#748493` | `src/screens/HomeScreen.tsx:421` |
| medium `golden` | `#5C4A2E` | `#9F8152` | `src/screens/HomeScreen.tsx:422` |
| medium `teal` | `#425449` | `#6E9384` | `src/screens/HomeScreen.tsx:423` |

### 2.4 Current Home Palette: Dark Mode

| Role | Current value | Source |
|---|---:|---|
| Root background | `#0E1620` | `src/utils/design.ts:318`, `src/screens/HomeScreen.tsx:217` |
| Card background | `#2A221D` home override; old token `#223247` still exists | `src/screens/HomeScreen.tsx:218`, `src/utils/design.ts:321` |
| Card border | `rgba(245,234,211,0.05)` | `src/screens/HomeScreen.tsx:219` |
| Primary text | `#F0EDE8` | `src/utils/design.ts:325`, `src/screens/HomeScreen.tsx:232` |
| Secondary text | `#B9AA9A` | `src/screens/HomeScreen.tsx:233` |
| Tertiary / muted text | `rgba(168,181,196,0.55)` | `src/screens/HomeScreen.tsx:234` |
| Brand mark color | `rgba(168,181,196,0.72)` | `src/utils/design.ts:328`, `src/screens/HomeScreen.tsx:235` |
| Icon primary | `#F0EDE8`; dark home actually uses colored badge fills with icon `#241D18` | `src/screens/HomeScreen.tsx:231`, `src/screens/HomeScreen.tsx:67-76`, `src/screens/HomeScreen.tsx:648` |
| Emergency background | high-priority default `#60373A`; theme token `#D4544C` still exists | `src/screens/HomeScreen.tsx:408`, `src/screens/HomeScreen.tsx:241` |
| Emergency hover | `#A66C69` | `src/screens/HomeScreen.tsx:408`, `src/screens/HomeScreen.tsx:242` |
| Emergency text | `#FFFFFF` | `src/screens/HomeScreen.tsx:243`, `src/screens/HomeScreen.tsx:564` |
| Emergency soft/tint | `rgba(255,210,140,0.95)` | `src/screens/HomeScreen.tsx:244` |
| Quick Phrases pill bg | `#192434` | `src/utils/design.ts:330`, `src/screens/HomeScreen.tsx:237` |
| Quick Phrases pill border | `rgba(42,61,82,0.94)` | `src/utils/design.ts:331`, `src/screens/HomeScreen.tsx:238` |
| Quick Phrases pill text | `#D8E3EF` | `src/utils/design.ts:332`, `src/screens/HomeScreen.tsx:239` |
| Divider/separator | `rgba(168,181,196,0.12)` gradient | `src/screens/HomeScreen.tsx:78-81`, `src/screens/HomeScreen.tsx:247-249` |
| Placeholder bg | `rgba(19,30,46,0.42)` | `src/screens/HomeScreen.tsx:245` |
| Placeholder border | `rgba(168,181,196,0.14)` | `src/screens/HomeScreen.tsx:246` |
| Connected indicator | success `#34D399` on `rgba(52,211,153,0.14)` | `src/utils/design.ts:33-35`, `src/App.tsx:399-403` |
| Gaze ON/OFF toggle border | `rgba(96,165,250,0.72)` on, `rgba(42,61,82,0.9)` off | `src/utils/design.ts:65-66` |
| Shadow color(s) | `0 4px 12px rgba(0,0,0,0.16)` | `src/screens/HomeScreen.tsx:220` |
| Per-tile surface overrides | all tiles `#2A221D`; colored icon badges are the only category color | `src/screens/HomeScreen.tsx:221-229`, `src/screens/HomeScreen.tsx:67-76` |

Dark home badge fills:

| Category | Current badge fill | Icon color | Contrast |
|---|---:|---:|---:|
| Keyboard | `#57B6E0` | `#241D18` | 7.26 |
| Phrases & Chat | `#88D688` | `#241D18` | 9.51 |
| Activities | `#D6A447` | `#241D18` | 7.33 |
| People | `#D98DA6` | `#241D18` | 6.58 |
| Assistance | `#9CA7F0` | `#241D18` | 7.28 |
| Settings | `#C6BCAF` | `#241D18` | 8.87 |
| Web Browsing | `#B58CE6` | `#241D18` | 6.22 |
| Design Home | `#DFC25D` | `#241D18` | 9.50 |

### 2.5 What Triggers Mix Mode

Mix mode is manual. `ThemeContext` defines `Theme = 'dark' | 'light' | 'mix'`, restores `gc-theme` from local storage, and only accepts saved `light` or `mix`; otherwise it defaults to `dark` (`src/contexts/ThemeContext.tsx:23,55-60`). The Settings panel exposes a three-way "Dark / Mix / Light" theme toggle (`src/components/settings/panels/AppSettingsPanel.tsx:425-525`). Selecting Mix calls `setTheme('mix')` and also updates `settings.isDarkMode` to `true` (`src/components/settings/panels/AppSettingsPanel.tsx:481`).

That means Mix is intended as a dark-family display, not a light-family display. The code does not document a clinical user or environmental use case. Based on the palette, it is trying to be a warmer, lower-blue, dim-room version of dark mode with per-tile color surfaces. The implementation is incomplete because global surfaces still use `darkColors` whenever they only receive `isDarkMode`.

### 2.6 Current Contrast Ratios

WCAG reference: normal text needs at least 4.5:1 for AA and 7:1 for AAA. For a 12-hour/day ALS eye-gaze interface, AAA should be the body-text target where practical.

| Mode | Pair | Ratio | Status |
|---|---|---:|---|
| Light | Primary text on root | 11.96 | Pass AAA |
| Light | Primary text on card | 13.43 | Pass AAA |
| Light | Secondary text on card | 6.23 | Concern: below AAA |
| Light | Icon on card | 15.34 | Pass AAA |
| Light | Emergency text on emergency bg | 4.39 | Critical: below AA |
| Light | Quick Phrases text on bg | 13.43 | Pass AAA |
| Mix | Primary text on root | 15.24 | Pass AAA |
| Mix | Primary text on card | 7.71 | Pass AAA |
| Mix | Secondary text on card | 5.56 | Concern: below AAA |
| Mix | Icon on card | 7.71 | Pass AAA |
| Mix | Emergency text on emergency bg | 5.62 | Concern: below AAA |
| Mix | Quick Phrases text on bg | 14.23 | Pass AAA |
| Dark | Primary text on root | 15.58 | Pass AAA |
| Dark | Primary text on card | 13.37 | Pass AAA |
| Dark | Secondary text on card | 6.90 | Concern: just below AAA |
| Dark | Icon on card | 13.37 | Pass AAA |
| Dark | Emergency text on emergency bg token `#D4544C` | 4.06 | Critical if token is used as card bg |
| Dark | Emergency text on actual high card `#60373A` | 9.98 | Pass AAA |
| Dark | Quick Phrases text on bg | 12.03 | Pass AAA |
| Dark | top nav emergency text approx on blended bg | 5.01 | Pass AA, below AAA; perceived weak due low saturation/dark-on-dark red |
| Dark | muted text blended on card | 3.27 | Critical when used as readable text |

Mix per-tile primary text ratios:

| Tile | Bg | Text | Ratio | Status |
|---|---:|---:|---:|---|
| Keyboard | `#3A4A52` | `#F5EAD3` | 7.71 | Pass AAA |
| Phrases | `#3D4D3A` | `#F5EAD3` | 7.58 | Pass AAA |
| Activities | `#5C4A2E` | `#F5EAD3` | 7.11 | Pass AAA |
| People | `#5C3D42` | `#F5EAD3` | 7.99 | Pass AAA |
| Assistance | `#3D4052` | `#F5EAD3` | 8.57 | Pass AAA |
| Settings | `#3A3530` | `#F5EAD3` | 10.16 | Pass AAA |
| Web | `#4A3745` | `#F5EAD3` | 9.15 | Pass AAA |
| Design Home | `#6A562B` | `#F5EAD3` | 5.91 | Concern: below AAA |

### 2.7 Confirmed Current Issues

Light mode:

- Emergency card text fails AA by a small margin: `#FBF7F1` on `#B35A4B` is 4.39:1.
- Secondary text on cards is readable but below AAA: `#62584D` on `#F7F2EA` is 6.23:1.
- Light mode is otherwise cohesive: warm root, warm cards, warm borders, and terracotta emergency.

Mix mode:

- Mix is manually selected, but its intended clinical/environmental purpose is not documented.
- Mix uses per-tile full-surface color fills; this is colorful but heavier than the industry pattern of neutral cells plus category accents.
- The Design Home tile is only 5.91:1 for primary text, below the AAA target.
- Mix behaves as dark mode outside explicit `isMix` branches, because Settings stores `isDarkMode: true`.

Dark mode:

- The code still carries cool blue-slate root/nav/quick-phrases tokens while HomeScreen cards are warm cocoa. This causes temperature inconsistency.
- The top emergency nav pill uses muted red text and a translucent dark red background (`GlobalNavBar.tsx:131-134`), which makes it perceptually weaker than the emergency function should be.
- Emergency cards are not the strongest warm pre-attentive element when compared with bright category badges such as Design Home `#DFC25D` and Phrases `#88D688`.
- `screenThemes.home.red #D4544C` with white text is only 4.06:1, so reusing the token directly would be unsafe.
- Muted text on dark card can fail when the rgba is blended: `rgba(168,181,196,0.55)` on `#2A221D` blends to about `#6F7379`, only 3.27:1.

## 3. Industry Research

### 3.1 Platform Comparisons

| Platform | Color approach | What matters for GazeConnect |
|---|---|---|
| Tobii Dynavox TD Snap Core First | TD Snap Core First offers a high-contrast page set for low-vision users with a dark background, high-contrast PCS symbols, and reduced visual complexity. Source: [Tobii Dynavox Core First](https://us.tobiidynavox.com/pages/snap-corefirst?menuLevel=149). | Dark mode should not be neon or decorative; it should be high-contrast and visually quiet. |
| Tobii Dynavox Communicator 5 | Communicator is highly customizable: caregivers can change background colors, button appearance, border width, and highlighting; it is designed for eye gaze access and includes brightness settings. Source: [Communicator 5 Getting Started Guide](https://download.mytobiidynavox.com/Communicator/documents/TobiiDynavox_Communicator5_GettingStartedGuide_v1-6-1_en-US_WEB.pdf). | Support user-adjustable modes and avoid hard-coding one color experience everywhere. |
| Smartbox Grid / Super Core / WordPower | Super Core uses Modified Fitzgerald key color coding: people/pronouns yellow, actions green, naming words orange, describing words blue, little words grey, questions purple. Source: [Smartbox color coding](https://www.hub.thinksmartbox.com/knowledgebase/colour-coding/). WordPower uses Fitzgerald arrangement and color coding for people/places and verbs. Source: [Smartbox WordPower design](https://hub.thinksmartbox.com/knowledgebase/the-design-of-wordpower/). | Color coding is used as an organizational cue, not as decoration. GazeConnect nav categories can use color, but text/icon/layout must also carry meaning. |
| Smartbox Grid 3 built-in themes: Color, Blue, High Visibility, Soft | I found public Smartbox documentation confirming color coding and high-contrast/visibility concepts, but I did not find an official public page documenting the exact four theme palettes named Color, Blue, High Visibility, and Soft. Treat exact palette claims for those four themes as unverified until tested in-app or sourced from Smartbox support files. | Do not base GazeConnect on unverified exact Grid theme colors. Use the verified pattern: neutral/high-contrast UI plus color-coded categories. |
| Proloquo2Go | Defaults to Modified Fitzgerald Key for most vocabularies; core/template buttons use color-coded borders, fringe buttons can use bleached fills; users can set all fills, adjust intensity, or change the page background. AssistiveWare notes black backgrounds work well for many users. Source: [AssistiveWare color code and background](https://www.assistiveware.com/support/proloquo2go/appearance/color-code-page-background). | The best pattern for GazeConnect is neutral surfaces with color-coded border/icon accents and adjustable contrast, not saturated full-card fills everywhere. |
| TouchChat with WordPower | WordPower uses Fitzgerald arrangement, places question/pronoun words on the left, verbs in the middle, descriptors to the right, and color-codes people/pronouns yellow and verbs green; words are categorized and alphabetized for efficiency. Source: [TouchChat WordPower Manual](https://touchchatapp.com/assets/uploads/WordPower_Manual_for_TC-NC-CF_5-23-2023.pdf). | Stable position + category color is more important than expressive palette styling. |
| LAMP Words for Life | LAMP prioritizes consistent motor patterns. Visual impairment documentation says verbs, adjectives, category nouns, and pronouns are color-coded: green, blue, orange, yellow. Source: [LAMP WFL Visual Impairment Vocabulary](https://documentation.prc-saltillo.com/docs/lamp-words-for-life-visual-impairment-vocabulary). | For eye-gaze AAC, color must support motor memory, not compete with it. |

### 3.2 Clinical And Display Research

AAC color coding and visual search:

- Modified Fitzgerald Key and Goossens, Crain, and Elder color coding are established AAC practices, but not all implementations use the same mapping. PrAACtical AAC summarizes both systems and explicitly notes color coding by grammatical category as a well-established practice. Source: [PrAACtical AAC color considerations](https://praacticalaac.org/strategy/communication-boards-colorful-considerations/).
- Smartbox Super Core documents Modified Fitzgerald color coding and emphasizes consistency/repetition: repeated words should appear in the same place. Source: [Smartbox color coding](https://www.hub.thinksmartbox.com/knowledgebase/colour-coding/).
- Wilkinson, Carlin, and Thistle (2008) studied how symbol color distribution affected target location speed and accuracy in children with and without Down syndrome. Source: [PubMed PMID 18448605](https://pubmed.ncbi.nlm.nih.gov/18448605/).
- Wilkinson and Madel (2019) used eye-tracking and found AAC display design changes affect visual search in individuals with Down syndrome or autism. Source: [PubMed PMID 31398294](https://pubmed.ncbi.nlm.nih.gov/31398294/).
- Wilkinson, Gilmore, and Qian (2022) found that close-set symbols and background color cues are not automatically optimal; display arrangement can optimize visual attention. Source: [PMC9132148](https://pmc.ncbi.nlm.nih.gov/articles/PMC9132148/).
- Thistle and Wilkinson (2015) found that many SLP display-design choices are common practice but need more evidence, including background color and motor planning supports. Source: [AAC PSU summary](https://aac.psu.edu/2015/05/21/building-ebp-in-aac-display-design-for-young-children-publication/).

Dark mode, halation, and fatigue:

- WCAG AA contrast is 4.5:1 for normal text; AAA is 7:1. Source: [W3C WCAG 1.4.3](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum) and [W3C WCAG 1.4.6](https://w3c.github.io/wcag21/understanding/contrast-enhanced.html).
- Piepenbrock et al. (2013) found a positive polarity advantage: dark text on light background performed better for visual acuity/proofreading in both younger and older adults. Source: [PubMed PMID 23654206](https://pubmed.ncbi.nlm.nih.gov/23654206/).
- Mathot and Ivanov (2019) discuss the link between pupil size, peripheral brightness, and visual performance; bright backgrounds constrict pupils and can improve acuity. Source: [PMC6925951](https://pmc.ncbi.nlm.nih.gov/articles/PMC6925951/).
- Sengsoon and Intaruk (2025) compared tablet light and dark mode. Both modes increased visual fatigue and dry eye symptoms after use; dark mode may reduce eye-fatigue risk, but the findings are not a universal endorsement of dark mode. Source: [PMC12027292](https://pmc.ncbi.nlm.nih.gov/articles/PMC12027292/).
- Perkins School for the Blind emphasizes that dark mode and high-contrast mode are not interchangeable, and that individual low-vision preferences vary. Source: [Perkins light vs dark mode for low vision](https://www.perkins.org/resource/dark-mode-for-low-vision/).

ALS and eye-gaze context:

- Guo et al. (2022) found eye movement abnormalities in ALS, especially square-wave jerks and abnormal smooth pursuit, more frequently in patients with bulbar involvement. Source: [PMC9026966](https://pmc.ncbi.nlm.nih.gov/articles/PMC9026966/).
- The implication for GazeConnect is conservative: reduce visual noise, preserve strong target boundaries, avoid low-contrast secondary text, and do not rely on subtle color-only distinctions.

### 3.3 Industry Pattern

Major AAC platforms converge on stable motor layouts, high contrast, reduced visual complexity for low-vision users, and category color coding as a cue. The strongest products do not treat color as a brand mood alone. They use color to support word/category location, while keeping text, symbols, position, and spacing reliable. The most relevant pattern for GazeConnect is not "make the whole UI colorful"; it is "make the surfaces neutral and calm, then use consistent color-coded accents where they help recognition."

## 4. Proposed Color System

### 4.1 Final Verdict On Warm + Olive Dark Cards

The warm cocoa + pale olive direction is the best dark-mode foundation. It fixes the current "cool slate versus terracotta" split and feels more like a high-end assistive device than a generic dashboard. Use:

- warm black root: `#131412`
- olive-cocoa card: `#20221E`
- cream text: `#ECEDE3`
- pale olive border: `rgba(213, 216, 188, 0.12)` or solid `#3D4034`

Do not make every card obviously olive. The olive should read as a quiet undertone and boundary system. Category color should live in icon badges and a thin accent bar. Emergency remains terracotta/red-orange and must be the warmest, most saturated family.

### 4.2 Shared Category Signaling Colors

These colors are softened but still distinct. They are not used alone; each category also has icon shape, label text, and position.

| Category | Proposed color | Use |
|---|---:|---|
| Emergency | `#A64E3F` dark/light; `#D16F54` mix | Full emergency card fill, strongest warm signal |
| Keyboard | `#6FB7B1` | Icon badge only |
| Phrases & Chat | `#8FAE72` | Icon badge only |
| Activities | `#C69A45` | Icon badge only |
| People | `#C7838F` | Icon badge only |
| Assistance / Daily Care | `#9C98C6` | Icon badge only |
| Settings | `#BBAE9D` | Icon badge only |
| Web Browsing | `#A77AC1` | Icon badge only |
| Design Home | `#C9A852` | Icon badge only |

For dark icon badges, use icon glyph `#201A15`; all proposed category badges exceed 5:1 against that glyph, and most exceed 6.5:1. Emergency uses cream text, not dark glyph-only treatment.

### 4.3 Accent Technique

Use colored circular icon badges only. Card borders and outlines should remain neutral in every mode.

Reasoning:

- Current dark home already uses colored icon badges successfully; badge glyph contrast is strong.
- Proloquo2Go's default border-color approach supports grammatical/category cues without filling every cell.
- TD Snap High Contrast favors reduced visual complexity.
- Removing colored card borders/left bars reduces edge noise during gaze scanning and keeps boundaries stable.
- Full filled category cards should be avoided outside emergency because they increase visual noise and create competing luminance targets.
- Color vision deficiency support must come from icon shape, text label, layout position, and emergency placement rather than colored borders.

### 4.4 Proposed Light Mode

Identity: Warm clinical daylight. This mode is for daytime use, bright rooms, caregiver editing, and cases where positive-polarity reading is easier. It keeps the recent cream/terracotta redesign and only corrects contrast.

| Role | Proposed value | Contrast | Reason |
|---|---:|---:|---|
| Root background | `#ECE5D9` | primary/root 11.96 | Keep successful warm cream root. |
| Card background | `#F7F2EA` | primary/card 13.43 | Keep high readability and calm warmth. |
| Card border | `#DED2BF` | UI boundary | Keep current soft border. |
| Primary text | `#2B2622` | 13.43 on card | Keep current strong warm text. |
| Secondary text | `#574E45` | 7.30 on card | Darkened from current `#62584D` to reach AAA. |
| Tertiary / muted text | `#6F6255` | 5.30 on card | Muted remains non-body text only. |
| Brand mark color | `#6F6255` | 5.30 on card | Quiet but readable. |
| Icon primary | `#1F1B18` | 15.34 on card | Keep current. |
| Emergency background | `#A64E42` | text/bg 5.22 | Slightly darker than current to pass AA with cream text. |
| Emergency hover | `#8F3F35` | text/bg 6.48 | Darker active state preserves contrast. |
| Emergency text | `#FFF7ED` | 5.22 on emergency | Warm off-white, avoids pure white. |
| Emergency soft/tint | `#E4C0B5` | decorative | Keep current tint for dividers/secondary emergency details. |
| Quick Phrases pill bg | `#F7F2EA` | 13.43 | Keep. |
| Quick Phrases pill border | `#DED2BF` | UI boundary | Keep. |
| Quick Phrases pill text | `#2B2622` | 13.43 | Keep. |
| Divider/separator | `rgba(203,188,166,0.42)` | decorative | Keep current. |
| Placeholder bg | `#EFE7DA` | primary/bg 12.37 | Keep. |
| Placeholder border | `#DED2BF` | UI boundary | Keep. |
| Connected indicator | bg `rgba(110,140,92,0.12)`, text/border `#617B51` | 5.09 on light bg | Darker sage for status text. |
| Gaze ON/OFF toggle border | `#AE9C84` off, `#6E8C5C` on | >= 3:1 UI | Keeps warm/sage system. |
| Shadow color(s) | `rgba(139,121,104,0.08-0.12)` | decorative | Keep current low fatigue shadow. |
| Per-tile surface overrides | all `#F7F2EA`; category icon badges only | text/card 13.43 | Avoid full colored category cards and colored borders in light mode. |

### 4.5 Proposed Dark Mode

Identity: Warm high-tech AAC at night. This is the primary 12-hour low-glare mode: cohesive, dark, non-blue, with high-contrast cream text and category cues that do not fight emergency. It should feel like a medical-grade device: precise, calm, and serious.

| Role | Proposed value | Contrast | Reason |
|---|---:|---:|---|
| Root background | `#131412` | primary/root 15.65 | Warm near-black; no pure black, less halation. |
| Card background | `#20221E` | primary/card 13.59 | Warm cocoa/olive card from attached direction. |
| Card border | `rgba(213,216,188,0.12)` / fallback `#3D4034` | UI boundary | Pale olive boundary unifies warm dark mode. |
| Primary text | `#ECEDE3` | 13.59 on card | Soft cream, not pure white. |
| Secondary text | `#C8C5B8` | 9.27 on card | AAA body text. |
| Tertiary / muted text | `#A9A392` | 6.37 on card | Only for noncritical metadata. |
| Brand mark color | `#B4AB96` | 7.08 on root | Quiet readable brand. |
| Icon primary | badge fill by category; glyph `#201A15` | 5.08-9.50 on badges | Strong glyph contrast without cyan glow. |
| Emergency background | `#A64E3F` | text/bg 5.01 | Warmer, stronger than current muted dark red. |
| Emergency hover | `#BE5C49` | text/bg 4.54 | Hover still AA with cream text. |
| Emergency text | `#FFF1E3` | 5.01 on emergency | Warm off-white, no pure white. |
| Emergency soft/tint | `#D79A83` | 4.40 on dark card | Use for secondary emergency accents only. |
| Quick Phrases pill bg | `#1B1C18` | text/bg 14.51 | Warm dark, no blue-slate pill. |
| Quick Phrases pill border | `#3D4034` | UI boundary | Olive boundary. |
| Quick Phrases pill text | `#ECEDE3` | 14.51 | AAA. |
| Divider/separator | `rgba(213,216,188,0.10)` gradient | decorative | Replaces cool blue divider. |
| Placeholder bg | `rgba(236,237,227,0.035)` | decorative | Empty slots stay quiet. |
| Placeholder border | `rgba(213,216,188,0.14)` | UI boundary | Visible but not attention-grabbing. |
| Connected indicator | bg `#182219`, text/border `#9CBC7C` | 7.72 | Warm olive success, not neon green. |
| Gaze ON/OFF toggle border | off `#4A4D3D`, on `#D6C98E` | on/card 9.63 | Warm focus indicator, no blue-cyan. |
| Shadow color(s) | `0 8px 20px rgba(0,0,0,0.28)` | decorative | Slightly deeper than current for dark surfaces. |
| Per-tile surface overrides | all `#20221E`; category icon badges only | primary/card 13.59 | Neutral cells with no colored card borders. |

### 4.6 Proposed Mix Mode

Identity: Dim-room spotlight. Mix should be for hospital rooms/evening environments where full light mode is too bright but pure dark mode reduces card salience. It uses a dark warm root with sand cards and dark text. This is distinct from Light because the room/root is dark; distinct from Dark because the active cards are positive-polarity.

| Role | Proposed value | Contrast | Reason |
|---|---:|---:|---|
| Root background | `#17130F` | light root text/root 15.37 | Warm dim root, no blue-slate. |
| Card background | `#E2D3B2` | primary/card 11.76 | Sand cards create a readable spotlight. |
| Card border | `#6A4D34` at 20% or solid `#C6B48F` | UI boundary | Umber boundary seen in attached mix image. |
| Primary text | `#23180C` | 11.76 on card | Strong positive-polarity text. |
| Secondary text | `#493B2E` | 7.29 on card | AAA secondary body text. |
| Tertiary / muted text | `#5B4C3A` | 5.59 on card | Muted metadata only. |
| Brand mark color | `#B49362` | 6.30 on root | Warm brand signal. |
| Icon primary | dark glyph `#23180C`; category badge fills shared | 5.08+ on badges | Same category language as dark. |
| Emergency background | `#D16F54` | dark text/bg 5.06 | Brightest/warmest pre-attentive card with dark text. |
| Emergency hover | `#BD5E46` | cream text/bg 4.54 or dark text/bg 4.38 | Use normal state for dwell; hover can darken only if text flips to cream. |
| Emergency text | `#23180C` | 5.06 on emergency | Dark text preserves readable bright emergency. |
| Emergency soft/tint | `#F1B59D` | decorative | Warm secondary emergency accent. |
| Quick Phrases pill bg | `#2A241C` | light text/bg 12.78 | Root-family dark pill, not sand card. |
| Quick Phrases pill border | `#6A4D34` | UI boundary | Umber border. |
| Quick Phrases pill text | `#F7E9CB` | 12.78 | AAA. |
| Divider/separator | `rgba(198,180,143,0.24)` gradient | decorative | Visible in dark root. |
| Placeholder bg | `rgba(226,211,178,0.08)` | decorative | Empty slot visible but quiet. |
| Placeholder border | `rgba(226,211,178,0.22)` | UI boundary | Clear placeholder boundary. |
| Connected indicator | bg `#22301F`, text/border `#A6C482` | 7.65 | Warm success. |
| Gaze ON/OFF toggle border | off `#6A4D34`, on `#D6C98E` | 7+ on root | Consistent with dark mode. |
| Shadow color(s) | `0 8px 22px rgba(0,0,0,0.30)` | decorative | Cards need elevation from dark root. |
| Per-tile surface overrides | all `#E2D3B2`; category icon badges only | primary/card 11.76 | Avoid muddy full-color per-tile surfaces and colored borders. |

### 4.7 Explicit Risk Controls

- Emergency cards remain the brightest/warmest signal: dark uses saturated terracotta on dark neutral cards; mix uses bright terracotta with dark text; light uses terracotta but darker than current for contrast.
- Icon contrast: category badges use dark glyph `#201A15`/`#23180C`, each tested at 5.08:1 or higher against proposed badge fills.
- Text contrast: body text targets AAA in all modes; emergency text is at least AA and typically close to or above 5:1 because saturated red/orange limits how high white-on-red contrast can go.
- Halation: no pure `#000` root and no pure `#FFF` text in dark mode; use warm off-whites and dark grays.
- Temperature consistency: dark removes blue-slate cards/nav and uses warm cocoa/olive throughout.
- Mix distinction: mix is not halfway between light and dark; it is dark environment + positive-polarity sand cards.
- Color vision deficiency: category color is never the only signal. Icons, labels, layout, and emergency placement remain. Red/green confusion is mitigated because emergency has unique placement, full fill, and wording.

## 5. Migration Impact Analysis

| File | Complexity | Why it would change after approval |
|---|---|---|
| `src/utils/design.ts` | Significant | Central token updates for `lightColors`, `mixColors`, `screenThemes.home`, navigation, status, gaze colors, category colors. |
| `src/screens/HomeScreen.tsx` | Significant | Replace hard-coded dark/mix palette assembly, priority maps, tile surfaces, emergency maps, and dark badge fills with approved tokens. |
| `src/components/GlobalNavBar.tsx` | Moderate | Add true theme awareness or pass theme-derived nav colors; fix emergency nav pill and gaze toggle colors for Mix. |
| `src/App.tsx` | Moderate | Connection indicator and persistent emergency button currently use `settings.isDarkMode`, so Mix receives dark tokens. |
| `src/lightmode.css` | Moderate | Keep most variables but update emergency/secondary text values and add any shared category accent CSS if needed. |
| `src/index.css` | Trivial | Global body and scrollbar defaults may need warm dark defaults instead of blue-slate. |
| `src/components/settings/panels/AppSettingsPanel.tsx` | Moderate | Theme toggle pill has hard-coded colors and stores Mix as dark; likely needs clearer theme token use. |
| `src/components/core/GazeControlToggle.tsx` | Moderate | Standalone gaze toggle has hard-coded green and dark/light-only branching. |
| `src/components/shared/QuickWordsGrid.tsx` | Moderate | Uses dark/light palettes and hard-coded category colors; may need token alignment. |
| `src/components/LiveClock.tsx` | Trivial | Dark clock currently uses white/cyan rgba; should use warm cream/olive in dark/mix. |
| `src/components/QuickWordsOverlay.tsx` | Moderate | Overlay surfaces branch on `isDarkMode`, not full theme. |
| `src/screens/KeyboardScreen.tsx`, `PhrasesScreen.tsx`, `MedicalScreen.tsx`, `ActivitiesScreen.tsx`, `PeopleScreen.tsx`, `QuickWordsScreen.tsx`, `SpatialKeyboardScreen.tsx`, `WebBrowsingScreen.tsx` | Moderate to significant | These screens still use `isDarkMode ? darkColors : lightColors`; if the approved palette should apply beyond Home, Mix needs explicit treatment. |
| `src/screens/FloorPlanSurveyScreen.tsx`, `CompassMapScreen.tsx`, `AdvancedMapScreen.tsx`, `CalibrationScreen.tsx` | Moderate | Several design/home screens hard-code dark blues and only partially use light mode. |

Minimal refactor suggestion for Phase 5: keep `isLight`/`isMix` structure, but add a `getEffectivePalette(theme)` helper for home/nav/status roles so `HomeScreen`, `GlobalNavBar`, and `App` stop rebuilding incompatible palettes independently. Do not restructure the full theming architecture unless later screens are included.

## 6. Open Questions For Review

1. Should Mix mode be defined as "dim-room spotlight" as proposed, or is it intended to be another dark-card color experiment? The code suggests manual dark-family use, but the patient use case is not documented.
2. Do you want the proposed category colors applied only to Home navigation cards, or also to vocabulary/category screens like Phrases, Medical, Activities, People, and Quick Words?
3. Should emergency medium-priority cards continue to support blue/golden/teal user choices, or should all home emergency cards use one consistent emergency family for pre-attentive safety?
4. Should the top nav emergency pill match the home emergency cards exactly, or stay smaller/subtler because it is globally persistent?
5. Are the attached warm/olive mockups prototypes you want treated as a target visual, or should Phase 5 strictly implement the hex system above?
