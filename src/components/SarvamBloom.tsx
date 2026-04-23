/**
 * SarvamBloom — Subtle decorative SVG for light mode
 * ====================================================
 * A gentle lotus/mandala-inspired bloom that appears as a
 * watermark in the bottom-right corner when light mode is active.
 * Purely decorative — no interactive behavior, pointer-events: none.
 */

import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

const SarvamBloom: React.FC = () => {
  const { isLight } = useTheme();

  // Only show in light mode
  if (!isLight) return null;

  return (
    <div
      className="sarvam-bloom"
      style={{
        position: 'fixed',
        bottom: -40,
        right: -40,
        width: 220,
        height: 220,
        pointerEvents: 'none',
        zIndex: 0,
        opacity: 0.06,
      }}
    >
      <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Concentric lotus petals */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <ellipse
            key={angle}
            cx="100"
            cy="100"
            rx="18"
            ry="55"
            fill="#F97316"
            transform={`rotate(${angle} 100 100)`}
          />
        ))}
        {/* Inner ring */}
        <circle cx="100" cy="100" r="22" fill="#F59E0B" />
        {/* Center dot */}
        <circle cx="100" cy="100" r="8" fill="#FAF8F5" />
      </svg>
    </div>
  );
};

export default React.memo(SarvamBloom);
