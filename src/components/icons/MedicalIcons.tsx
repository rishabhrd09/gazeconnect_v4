/**
 * GazeConnect Pro — MedicalIcons.tsx (v3.0 — Medical-Grade Shadow Diagrams)
 *
 * Design language:
 *   • viewBox="0 0 80 80"  — large canvas, anatomical room
 *   • 3-layer depth:  base gradient fill  →  mid-tone detail  →  crisp stroke
 *   • CSS filter: drop-shadow() applied on the <svg> tag — follows the
 *     non-rectangular silhouette of each device, creating physical presence
 *     on the dark card surface (coloured glow + dark depth shadow)
 *   • linearGradient / radialGradient inside <defs> for every primary shape
 *   • Recognisable from 2 metres without reading the text label
 *
 * Fallback:
 *   GenericEmergencyIcon — hexagonal ISO-7010 hazard badge.
 *   Rendered automatically for any customised emergency button whose label
 *   is not in EMERGENCY_ICON_MAP — enables fully customisable buttons
 *   without ever returning a blank card.
 */

import React from 'react';

export interface IconProps {
  size?: number | string;
  color?: string;
  style?: React.CSSProperties;
}

// Helper: coerce size to the value SVG width/height expects
const SZ = (s?: number | string): number | string => s ?? 64;

// Shared drop-shadow factory:
//   layer 1 → coloured glow  (matches card accent)
//   layer 2 → dark depth shadow (physical presence on dark bg)
const ds = (color: string): string =>
  `drop-shadow(0 4px 10px ${color}60) drop-shadow(0 1px 4px rgba(0,0,0,0.75))`;

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC EMERGENCY — ISO-7010 hexagonal hazard badge (fallback icon)
// ─────────────────────────────────────────────────────────────────────────────
export const GenericEmergencyIcon: React.FC<IconProps> = ({
  size, color = '#E06C6C', style,
}) => (
  <svg width={SZ(size)} height={SZ(size)} viewBox="0 0 80 80" fill="none"
    style={{ filter: ds(color), ...style }} aria-label="Emergency alert">
    <defs>
      <linearGradient id="gen_g" x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.40" />
        <stop offset="100%" stopColor={color} stopOpacity="0.08" />
      </linearGradient>
    </defs>
    {/* Outer hex */}
    <path d="M40 5 L70 22 L70 58 L40 75 L10 58 L10 22 Z"
      fill="url(#gen_g)" stroke={color} strokeWidth="2.6" strokeLinejoin="round" />
    {/* Inner hex ring */}
    <path d="M40 13 L64 26 L64 54 L40 67 L16 54 L16 26 Z"
      fill="none" stroke={color} strokeWidth="1.0" strokeOpacity="0.30" strokeLinejoin="round" />
    {/* ! stem */}
    <rect x="36" y="22" width="8" height="25" rx="4" fill={color} fillOpacity="0.92" />
    {/* ! dot */}
    <circle cx="40" cy="57" r="5.5" fill={color} fillOpacity="0.92" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// TT SUCTION — Tracheostomy tube
//
// Anchor features (in order of recognisability):
//   1. Wide flat NECK FLANGE PLATE — the horizontal rectangular collar
//      that sits flush against the patient's neck. No other device has this shape.
//   2. VERTICAL TUBE body descending from flange (goes into trachea)
//   3. PILOT BALLOON — small teardrop at end of inflation line
// ─────────────────────────────────────────────────────────────────────────────
export const TTSuctionIcon: React.FC<IconProps> = ({
  size, color = '#C27070', style,
}) => (
  <svg width={SZ(size)} height={SZ(size)} viewBox="0 0 80 80" fill="none"
    style={{ filter: ds(color), ...style }} aria-label="TT Suction">
    <defs>
      <linearGradient id="tt_flange" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.55" />
        <stop offset="100%" stopColor={color} stopOpacity="0.15" />
      </linearGradient>
      <linearGradient id="tt_tube" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.60" />
        <stop offset="100%" stopColor={color} stopOpacity="0.18" />
      </linearGradient>
      <linearGradient id="tt_pilot" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={color} stopOpacity="0.45" />
        <stop offset="100%" stopColor={color} stopOpacity="0.20" />
      </linearGradient>
    </defs>

    {/* ══ NECK FLANGE PLATE ══ — wide flat collar, the defining silhouette */}
    <rect x="5" y="28" width="46" height="14" rx="5"
      fill="url(#tt_flange)" stroke={color} strokeWidth="2.5" />
    {/* Highlight bevel on top edge */}
    <rect x="5" y="28" width="46" height="4" rx="5"
      fill={color} fillOpacity="0.18" />
    {/* Tie holes (fabric strap secures trach) */}
    <circle cx="11"  cy="35" r="3.2" fill="none" stroke={color} strokeWidth="1.8" strokeOpacity="0.72" />
    <circle cx="45" cy="35" r="3.2" fill="none" stroke={color} strokeWidth="1.8" strokeOpacity="0.72" />
    {/* Size indicator cross on flange */}
    <line x1="23" y1="31.5" x2="33" y2="31.5" stroke={color} strokeWidth="1.2" strokeOpacity="0.48" strokeLinecap="round" />
    <line x1="28" y1="29"   x2="28" y2="41"   stroke={color} strokeWidth="1.2" strokeOpacity="0.48" strokeLinecap="round" />

    {/* ══ VERTICAL TUBE BODY ══ — cylindrical shaft into trachea */}
    <rect x="18" y="42" width="16" height="30" rx="8"
      fill="url(#tt_tube)" stroke={color} strokeWidth="2.2" />
    {/* Tube highlight bevel */}
    <rect x="18" y="42" width="6" height="30" rx="3"
      fill={color} fillOpacity="0.12" />
    {/* Inner lumen */}
    <line x1="26" y1="45" x2="26" y2="68" stroke={color} strokeWidth="1.5" strokeOpacity="0.40" />
    {/* Murphy eye at distal tip */}
    <ellipse cx="26" cy="71" rx="5" ry="3.2"
      fill={color} fillOpacity="0.55" stroke={color} strokeWidth="1.7" />

    {/* ══ PILOT INFLATION LINE ══ — exits right side of flange */}
    <rect x="51" y="31.5" width="20" height="8" rx="4"
      fill="url(#tt_pilot)" stroke={color} strokeWidth="1.9" />
    {/* Pilot balloon — inflatable teardrop */}
    <ellipse cx="74.5" cy="35.5" rx="5.5" ry="7"
      fill={color} fillOpacity="0.45" stroke={color} strokeWidth="2.0" />
    {/* Balloon highlight */}
    <ellipse cx="72.5" cy="32.5" rx="2" ry="2.5"
      fill={color} fillOpacity="0.35" />
    {/* Valve check dot */}
    <circle cx="74.5" cy="30.5" r="1.5" fill={color} fillOpacity="0.88" />

    {/* ══ SUCTION CATHETER ══ — enters from machine above flange */}
    <path d="M 5 18 Q 11 18 17 24 Q 20 28 26 29.5"
      stroke={color} strokeWidth="3.5" strokeLinecap="round" fill="none" strokeOpacity="0.74" />
    {/* Machine Y-connector */}
    <rect x="1" y="12" width="12" height="9" rx="4.5"
      fill={color} fillOpacity="0.38" stroke={color} strokeWidth="1.9" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// AMBU BAG — Bag-Valve-Mask (BVM) resuscitator
//
// Anchor features:
//   1. LARGE OVAL SQUEEZE BAG — the defining silicone body, ribbed texture
//   2. ONE-WAY PATIENT VALVE — rectangular non-return safety valve
//   3. TRIANGULAR FACE MASK — wide at face edge, narrow at valve connector
// ─────────────────────────────────────────────────────────────────────────────
export const AmbuBagIcon: React.FC<IconProps> = ({
  size, color = '#BC7878', style,
}) => (
  <svg width={SZ(size)} height={SZ(size)} viewBox="0 0 80 80" fill="none"
    style={{ filter: ds(color), ...style }} aria-label="Ambu Bag">
    <defs>
      <radialGradient id="ab_bag" cx="0.38" cy="0.38" r="0.65">
        <stop offset="0%" stopColor={color} stopOpacity="0.55" />
        <stop offset="100%" stopColor={color} stopOpacity="0.10" />
      </radialGradient>
      <linearGradient id="ab_valve" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.55" />
        <stop offset="100%" stopColor={color} stopOpacity="0.20" />
      </linearGradient>
      <linearGradient id="ab_mask" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.52" />
        <stop offset="100%" stopColor={color} stopOpacity="0.12" />
      </linearGradient>
    </defs>

    {/* ══ SQUEEZE BAG ══ — large oval silicone body */}
    <ellipse cx="20" cy="40" rx="18" ry="25"
      fill="url(#ab_bag)" stroke={color} strokeWidth="2.5" />
    {/* Bag highlight — top-left specular */}
    <ellipse cx="15" cy="30" rx="7" ry="9"
      fill={color} fillOpacity="0.16" />
    {/* Squeeze texture ridges */}
    <path d="M 6  26 Q 20 23.5 34 26"  stroke={color} strokeWidth="1.5" strokeOpacity="0.42" fill="none" strokeLinecap="round" />
    <path d="M 5  40 Q 20 37.5 35 40"  stroke={color} strokeWidth="1.5" strokeOpacity="0.42" fill="none" strokeLinecap="round" />
    <path d="M 6  54 Q 20 56.5 34 54"  stroke={color} strokeWidth="1.5" strokeOpacity="0.42" fill="none" strokeLinecap="round" />
    {/* Brand circle */}
    <circle cx="20" cy="40" r="8" fill="none" stroke={color} strokeWidth="1.2" strokeOpacity="0.26" />

    {/* ══ ONE-WAY PATIENT VALVE ══ — the non-return safety valve */}
    <rect x="38" y="32" width="14" height="16" rx="3.5"
      fill="url(#ab_valve)" stroke={color} strokeWidth="2.2" />
    {/* Valve bevel highlight */}
    <rect x="38" y="32" width="14" height="5" rx="3.5"
      fill={color} fillOpacity="0.18" />
    {/* Duck-bill flap cross */}
    <line x1="40" y1="40" x2="50" y2="40" stroke={color} strokeWidth="2.0" strokeLinecap="round" />
    <line x1="44" y1="35" x2="44" y2="45" stroke={color} strokeWidth="2.0" strokeLinecap="round" />
    {/* Bag stub connector */}
    <rect x="36" y="38.5" width="3" height="5" rx="1.5" fill={color} fillOpacity="0.60" />
    {/* Pop-off pressure relief valve on top */}
    <circle cx="44" cy="29"  r="4"
      fill={color} fillOpacity="0.42" stroke={color} strokeWidth="1.7" />
    <circle cx="44" cy="27.5" r="1.5" fill={color} fillOpacity="0.80" />

    {/* ══ FACE MASK ══ — triangular, wide at patient face, narrow at valve */}
    <path d="M 52 28 L 76 13 L 76 67 L 52 52 Z"
      fill="url(#ab_mask)" stroke={color} strokeWidth="2.3" strokeLinejoin="round" />
    {/* Mask highlight bevel */}
    <path d="M 52 28 L 64 20.5 L 76 13"
      stroke={color} strokeWidth="1.0" strokeOpacity="0.28" fill="none" />
    {/* Inflatable cuff rim — the rounded seal at the face edge */}
    <path d="M 76 13 Q 82 40 76 67"
      stroke={color} strokeWidth="4.0" strokeLinecap="round" fill="none" strokeOpacity="0.58" />
    {/* 22mm ISO connector elbow */}
    <rect x="51" y="36" width="3.5" height="10" rx="1.75"
      fill={color} fillOpacity="0.70" />

    {/* ══ O2 RESERVOIR TAIL ══ */}
    <path d="M 20 65 Q 20 73 17 76"
      stroke={color} strokeWidth="3.2" strokeLinecap="round" fill="none" strokeOpacity="0.50" />
    <circle cx="16" cy="77.5" r="3.5" fill={color} fillOpacity="0.42" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// ORAL SUCTION — Yankauer suction catheter
//
// Anchor features:
//   1. THICK RIGID ANGLED SHAFT — no other suction device has this hard-plastic
//      wand shape at ~50° angle
//   2. BULBOUS FENESTRATED TIP — the rounded end with suction holes is unique
//   3. THUMB CONTROL PORT — the hole at the handle that controls suction
// ─────────────────────────────────────────────────────────────────────────────
export const OralSuctionIcon: React.FC<IconProps> = ({
  size, color = '#C08A80', style,
}) => (
  <svg width={SZ(size)} height={SZ(size)} viewBox="0 0 80 80" fill="none"
    style={{ filter: ds(color), ...style }} aria-label="Oral Suction">
    <defs>
      <linearGradient id="os_shaft" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.65" />
        <stop offset="100%" stopColor={color} stopOpacity="0.22" />
      </linearGradient>
      <radialGradient id="os_bulb" cx="0.32" cy="0.32" r="0.72">
        <stop offset="0%" stopColor={color} stopOpacity="0.72" />
        <stop offset="100%" stopColor={color} stopOpacity="0.20" />
      </radialGradient>
    </defs>

    {/* ══ FLEXIBLE TUBING ══ — top-left, connects to wall suction */}
    <path d="M 3 8 Q 9 8 13 14 Q 16 18 18 22"
      stroke={color} strokeWidth="6" strokeLinecap="round" fill="none" strokeOpacity="0.55" />
    {/* Tube inner highlight */}
    <path d="M 3 8 Q 9 8 13 14 Q 16 18 18 22"
      stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" strokeOpacity="0.22" />

    {/* ══ THUMB CONTROL PORT ══ — proximal collar with hole */}
    <circle cx="21" cy="26" r="8"
      fill={color} fillOpacity="0.32" stroke={color} strokeWidth="2.3" />
    {/* Port highlight */}
    <circle cx="18.5" cy="23.5" r="3" fill={color} fillOpacity="0.22" />
    {/* Control hole */}
    <circle cx="21" cy="26" r="3.5" fill={color} fillOpacity="0.78" />

    {/* ══ RIGID ANGLED SHAFT ══ — thick hard-plastic wand, ~50° angle */}
    <path d="M 25 30 Q 38 42 48 54 Q 54 61 59 67"
      stroke="url(#os_shaft)" strokeWidth="11" strokeLinecap="round" fill="none" />
    {/* Shaft outer edge highlight */}
    <path d="M 25 30 Q 38 42 48 54 Q 54 61 59 67"
      stroke={color} strokeWidth="2.8" strokeLinecap="round" fill="none" strokeOpacity="0.55" />
    {/* Shaft inner lumen line */}
    <path d="M 25 30 Q 38 42 48 54 Q 54 61 59 67"
      stroke={color} strokeWidth="1.4" strokeLinecap="round" fill="none" strokeOpacity="0.22" />

    {/* ══ BULBOUS FENESTRATED TIP ══ — the iconic rounded Yankauer end */}
    <ellipse cx="65" cy="72" rx="12" ry="10" transform="rotate(-25 65 72)"
      fill="url(#os_bulb)" stroke={color} strokeWidth="2.5" />
    {/* Bulb highlight */}
    <ellipse cx="60.5" cy="68" rx="4.5" ry="3.5" transform="rotate(-25 60.5 68)"
      fill={color} fillOpacity="0.28" />
    {/* Fenestration suction holes — 4 ports */}
    <circle cx="61" cy="68" r="2.2" fill={color} fillOpacity="0.88" />
    <circle cx="68" cy="70" r="2.0" fill={color} fillOpacity="0.78" />
    <circle cx="63" cy="74" r="2.0" fill={color} fillOpacity="0.74" />
    <circle cx="69" cy="76" r="1.5" fill={color} fillOpacity="0.62" />

    {/* ══ SECRETION DROPLETS ══ */}
    <circle cx="77" cy="66" r="2.8" fill={color} fillOpacity="0.58" />
    <circle cx="79" cy="73" r="2.0" fill={color} fillOpacity="0.44" />
    <circle cx="74" cy="78" r="1.5" fill={color} fillOpacity="0.34" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// BREATHING DISCOMFORT — Anatomical lung diagram
//
// Anchor features:
//   1. BILATERAL LOBED LUNG SILHOUETTES — left + right lung shapes are the
//      universal respiratory medical illustration
//   2. BRONCHIAL TREE — branching airways visible inside each lobe
//   3. LABOURED WAVEFORM — jagged line = abnormal breathing, instant distress signal
// ─────────────────────────────────────────────────────────────────────────────
export const BreathingDiscomfortIcon: React.FC<IconProps> = ({
  size, color = '#C09878', style,
}) => (
  <svg width={SZ(size)} height={SZ(size)} viewBox="0 0 80 80" fill="none"
    style={{ filter: ds(color), ...style }} aria-label="Breathing Discomfort">
    <defs>
      <radialGradient id="bd_lung" cx="0.45" cy="0.35" r="0.62">
        <stop offset="0%" stopColor={color} stopOpacity="0.48" />
        <stop offset="100%" stopColor={color} stopOpacity="0.08" />
      </radialGradient>
    </defs>

    {/* ══ TRACHEA ══ */}
    <rect x="34" y="2" width="12" height="18" rx="6"
      fill={color} fillOpacity="0.35" stroke={color} strokeWidth="2.3" />
    {/* Tracheal rings */}
    <line x1="34" y1="9"  x2="46" y2="9"  stroke={color} strokeWidth="1.3" strokeOpacity="0.50" />
    <line x1="34" y1="14" x2="46" y2="14" stroke={color} strokeWidth="1.3" strokeOpacity="0.50" />
    {/* Trachea highlight */}
    <rect x="34" y="2" width="5" height="18" rx="3"
      fill={color} fillOpacity="0.14" />

    {/* ══ MAIN BRONCHI ══ — Y-split at carina */}
    <path d="M 34 20 Q 25 24 15 28" stroke={color} strokeWidth="3.2" strokeLinecap="round" fill="none" />
    <path d="M 46 20 Q 55 24 65 28" stroke={color} strokeWidth="3.2" strokeLinecap="round" fill="none" />

    {/* ══ LEFT LUNG ══ */}
    <path d="M 6 28 Q 1 37 2 50 Q 3 64 15 68 Q 27 72 31 59 Q 35 47 29 36 Q 23 26 14 24 Z"
      fill="url(#bd_lung)" stroke={color} strokeWidth="2.3" strokeLinejoin="round" />
    {/* Lung highlight — top-left lobe specular */}
    <path d="M 8 30 Q 5 38 6 46 Q 7 36 12 30 Z"
      fill={color} fillOpacity="0.16" />
    {/* Left bronchial tree */}
    <path d="M 15 28 Q 12 38 11 50" stroke={color} strokeWidth="2.0" strokeLinecap="round" fill="none" strokeOpacity="0.65" />
    <path d="M 15 28 Q 22 36 24 48" stroke={color} strokeWidth="2.0" strokeLinecap="round" fill="none" strokeOpacity="0.65" />
    <path d="M 11 50 Q 10 57 11 64"  stroke={color} strokeWidth="1.3" strokeLinecap="round" fill="none" strokeOpacity="0.46" />
    <path d="M 24 48 Q 22 56 22 63"  stroke={color} strokeWidth="1.3" strokeLinecap="round" fill="none" strokeOpacity="0.46" />
    <path d="M 15 28 Q 11 35 9 40"   stroke={color} strokeWidth="1.1" strokeLinecap="round" fill="none" strokeOpacity="0.36" />

    {/* ══ RIGHT LUNG ══ */}
    <path d="M 74 28 Q 79 37 78 50 Q 77 64 65 68 Q 53 72 49 59 Q 45 47 51 36 Q 57 26 66 24 Z"
      fill="url(#bd_lung)" stroke={color} strokeWidth="2.3" strokeLinejoin="round" />
    {/* Right lung highlight */}
    <path d="M 72 30 Q 75 38 74 46 Q 73 36 68 30 Z"
      fill={color} fillOpacity="0.16" />
    {/* Right bronchial tree */}
    <path d="M 65 28 Q 68 38 69 50" stroke={color} strokeWidth="2.0" strokeLinecap="round" fill="none" strokeOpacity="0.65" />
    <path d="M 65 28 Q 58 36 56 48" stroke={color} strokeWidth="2.0" strokeLinecap="round" fill="none" strokeOpacity="0.65" />
    <path d="M 69 50 Q 70 57 69 64"  stroke={color} strokeWidth="1.3" strokeLinecap="round" fill="none" strokeOpacity="0.46" />
    <path d="M 56 48 Q 58 56 58 63"  stroke={color} strokeWidth="1.3" strokeLinecap="round" fill="none" strokeOpacity="0.46" />
    <path d="M 65 28 Q 69 35 71 40"  stroke={color} strokeWidth="1.1" strokeLinecap="round" fill="none" strokeOpacity="0.36" />

    {/* ══ LABOURED BREATHING WAVEFORM ══ — jagged spikes signal distress */}
    <path d="M 2 14 L 8 6 L 14 17 L 20 4 L 27 14 L 33 10"
      stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      fill="none" strokeOpacity="0.94" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// CHECK O2 — Clip-on pulse oximeter on finger
//
// Anchor features:
//   1. SPRING-CLIP PROBE — two rectangular jaws clamped on fingertip
//   2. CURVED SPRING HINGE — the arched metal bridge connecting both jaws
//   3. SpO2 PLETH WAVEFORM — the characteristic cardiac waveform on the display
// ─────────────────────────────────────────────────────────────────────────────
export const CheckO2Icon: React.FC<IconProps> = ({
  size, color = '#88AADC', style,
}) => (
  <svg width={SZ(size)} height={SZ(size)} viewBox="0 0 80 80" fill="none"
    style={{ filter: ds(color), ...style }} aria-label="Check O2">
    <defs>
      <linearGradient id="co_finger" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.30" />
        <stop offset="100%" stopColor={color} stopOpacity="0.07" />
      </linearGradient>
      <linearGradient id="co_probe" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.62" />
        <stop offset="100%" stopColor={color} stopOpacity="0.24" />
      </linearGradient>
      <linearGradient id="co_screen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.28" />
        <stop offset="100%" stopColor={color} stopOpacity="0.06" />
      </linearGradient>
    </defs>

    {/* ══ FINGER ══ */}
    <rect x="24" y="8" width="28" height="48" rx="14"
      fill="url(#co_finger)" stroke={color} strokeWidth="2.2" />
    {/* Fingernail plate */}
    <rect x="28" y="10" width="20" height="17" rx="9"
      fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.6" strokeOpacity="0.52" />
    {/* Nail highlight */}
    <ellipse cx="35" cy="14" rx="5" ry="4" fill={color} fillOpacity="0.14" />
    {/* Knuckle fold lines */}
    <path d="M 25 40 Q 38 44 51 40" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.38" fill="none" />
    <path d="M 25 50 Q 38 54 51 50" stroke={color} strokeWidth="0.9" strokeLinecap="round" strokeOpacity="0.26" fill="none" />

    {/* ══ PROBE UPPER JAW ══ — contains LED emitter (red + IR) */}
    <rect x="11" y="30" width="17" height="13" rx="4"
      fill="url(#co_probe)" stroke={color} strokeWidth="2.3" />
    {/* Jaw bevel */}
    <rect x="11" y="30" width="17" height="4.5" rx="4"
      fill={color} fillOpacity="0.20" />
    {/* LED window */}
    <rect x="14" y="33" width="11" height="7" rx="2.5"
      fill={color} fillOpacity="0.88" />
    {/* LED glow halo */}
    <circle cx="19.5" cy="36.5" r="5" fill="none" stroke={color} strokeWidth="1.2" strokeOpacity="0.45" />

    {/* ══ PROBE LOWER JAW ══ — photodetector side */}
    <rect x="11" y="43" width="17" height="13" rx="4"
      fill="url(#co_probe)" stroke={color} strokeWidth="2.3" />
    {/* Photodetector grid */}
    <line x1="14" y1="47.5" x2="25" y2="47.5" stroke={color} strokeWidth="1.4" strokeOpacity="0.72" />
    <line x1="14" y1="51.5" x2="25" y2="51.5" stroke={color} strokeWidth="1.4" strokeOpacity="0.72" />

    {/* ══ SPRING HINGE ══ — arched metal clip connecting jaws */}
    <path d="M 11 37 Q 4 40 11 49"
      stroke={color} strokeWidth="3.5" strokeLinecap="round" fill="none" />
    <path d="M 11 37 Q 4 40 11 49"
      stroke={color} strokeWidth="1.2" strokeLinecap="round" fill="none" strokeOpacity="0.25" />

    {/* ══ CABLE ══ */}
    <path d="M 28 57 Q 37 63 46 65 Q 56 67 64 66"
      stroke={color} strokeWidth="3.0" strokeLinecap="round" fill="none" strokeOpacity="0.60" />

    {/* ══ SpO2 DISPLAY ══ */}
    <rect x="62" y="58" width="16" height="16" rx="3.5"
      fill="url(#co_screen)" stroke={color} strokeWidth="1.9" />
    {/* Screen bevel */}
    <rect x="62" y="58" width="16" height="4" rx="3.5"
      fill={color} fillOpacity="0.16" />
    {/* Plethysmography cardiac waveform */}
    <path d="M 64 66 L 66 66 L 67.5 61 L 70 73 L 72.5 66 L 75 66 L 76 66"
      stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      fill="none" strokeOpacity="0.90" />
    {/* % readout dots */}
    <circle cx="65"  cy="72" r="1.3" fill={color} fillOpacity="0.75" />
    <circle cx="69"  cy="72" r="1.3" fill={color} fillOpacity="0.75" />
    <circle cx="73"  cy="72" r="1.3" fill={color} fillOpacity="0.75" />

    {/* ══ O₂ LABEL BADGE ══ */}
    <circle cx="60" cy="55" r="6.5"
      fill={color} fillOpacity="0.22" stroke={color} strokeWidth="1.7" />
    {/* Badge highlight */}
    <circle cx="57.5" cy="52.5" r="2.5" fill={color} fillOpacity="0.18" />
    <text x="60" y="57.5" textAnchor="middle" fontSize="7" fill={color} fillOpacity="0.96"
      fontFamily="system-ui, sans-serif" fontWeight="800" letterSpacing="-0.3">O₂</text>
  </svg>
);
