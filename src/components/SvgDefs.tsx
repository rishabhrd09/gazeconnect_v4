/**
 * Global SVG filter definitions — rendered once at app root, referenced by ID.
 * Filters live here so they can be applied across screens without duplicating defs.
 */
import React from 'react';

const SvgDefs: React.FC = () => (
  <svg
    width="0"
    height="0"
    style={{ position: 'absolute', pointerEvents: 'none' }}
    aria-hidden="true"
  >
    <defs>
      {/* Soft drop shadow for icons that sit over warm-paper surfaces */}
      <filter id="warmSoftShadow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" />
        <feOffset dy="2" />
        <feColorMatrix type="matrix" values="
          0 0 0 0 0.32
          0 0 0 0 0.26
          0 0 0 0 0.20
          0 0 0 0.16 0
        " />
        <feMerge>
          <feMergeNode />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* Stronger shadow for hero-card decoration SVGs */}
      <filter id="warmHeroShadow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6" />
        <feOffset dy="4" />
        <feColorMatrix type="matrix" values="
          0 0 0 0 0.32
          0 0 0 0 0.26
          0 0 0 0 0.20
          0 0 0 0.22 0
        " />
        <feMerge>
          <feMergeNode />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* Vertical gradient for surfaces (paste-ready) */}
      <linearGradient id="warmSurfaceGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%"   stopColor="#FFFEFA" />
        <stop offset="65%"  stopColor="#FFFDF8" />
        <stop offset="100%" stopColor="#FAF5EB" />
      </linearGradient>
    </defs>
  </svg>
);

export default SvgDefs;
