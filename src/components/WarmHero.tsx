/**
 * WarmHero — Hero illustration slot for warm-mode screens.
 *
 * Renders an editorial-style hero card with optional artwork. When a real
 * illustration exists at /assets/warm/illustrations/{variant}.png, it is used.
 * Otherwise renders a beautiful abstract SVG gradient that fits the warm palette.
 *
 * Used on:
 *   - WebBrowsingScreen (variant="mind-wellbeing")
 *   - ActivitiesScreen (variant="activities-landscape")
 *   - MedicalScreen Daily Care landing (variant="daily-care-paper")
 *
 * NOT used on:
 *   - HomeScreen (no room — already 8 tiles + dock)
 *   - Phrases / Medical sub-screens (functional grids, no hero space)
 */
import React, { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';

export type HeroVariant =
  | 'mind-wellbeing'
  | 'activities-landscape'
  | 'daily-care-paper'
  | 'design-home-blueprint';

interface WarmHeroProps {
  variant: HeroVariant;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onCta?: () => void;
  className?: string;
  style?: React.CSSProperties;
  /** Aspect ratio of the illustration area (default 16/9). */
  aspectRatio?: string;
}

// Per-variant abstract gradient palettes that match the warm theme.
// Each variant has its own gradient mood. When real artwork ships, this
// fallback is hidden behind the <img>.
const VARIANT_GRADIENTS: Record<HeroVariant, {
  stops: string[];
  decoration: 'sun' | 'leaf' | 'curve' | 'grid';
}> = {
  'mind-wellbeing':       { stops: ['#FBE9C9', '#E5D2A8', '#B3A07A', '#7B8A78'], decoration: 'sun' },
  'activities-landscape': { stops: ['#FCEBC8', '#E0D2B0', '#A89B7E', '#5F7068'], decoration: 'curve' },
  'daily-care-paper':     { stops: ['#FFF5DD', '#F0E2BE', '#C9A96B', '#8B7C5A'], decoration: 'leaf' },
  'design-home-blueprint':{ stops: ['#F4F1E9', '#E5DFCB', '#9DA890', '#5C6E62'], decoration: 'grid' },
};

const AbstractGradient: React.FC<{ variant: HeroVariant }> = ({ variant }) => {
  const { stops, decoration } = VARIANT_GRADIENTS[variant];
  const id = `wmhero-${variant}`;
  return (
    <svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice"
         style={{ width: '100%', height: '100%', display: 'block' }}
         aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor={stops[0]} />
          <stop offset="40%"  stopColor={stops[1]} />
          <stop offset="75%"  stopColor={stops[2]} />
          <stop offset="100%" stopColor={stops[3]} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="30%" r="50%">
          <stop offset="0%"   stopColor="rgba(255, 253, 248, 0.85)" />
          <stop offset="100%" stopColor="rgba(255, 253, 248, 0)" />
        </radialGradient>
        <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>
      {/* Base gradient */}
      <rect width="800" height="450" fill={`url(#${id}-bg)`} />
      {/* Soft glow / sun */}
      {decoration === 'sun' && (
        <>
          <circle cx="640" cy="155" r="58" fill={stops[0]} opacity="0.85" filter={`url(#${id}-soft)`} />
          <circle cx="640" cy="155" r="38" fill={stops[0]} opacity="0.95" />
        </>
      )}
      {/* Layered horizon curves */}
      {(decoration === 'curve' || decoration === 'sun') && (
        <>
          <path d="M0 320 Q 200 280 400 305 T 800 295 L 800 450 L 0 450 Z"
                fill={stops[2]} opacity="0.55" />
          <path d="M0 360 Q 250 330 500 350 T 800 345 L 800 450 L 0 450 Z"
                fill={stops[3]} opacity="0.78" />
        </>
      )}
      {/* Glow overlay */}
      <rect width="800" height="450" fill={`url(#${id}-glow)`} />
      {/* Decorative leaf for daily-care */}
      {decoration === 'leaf' && (
        <g opacity="0.32" transform="translate(540, 120) rotate(15)">
          <path d="M 0 0 Q 80 -60 160 0 Q 80 60 0 0 Z" fill={stops[3]} />
          <path d="M 0 0 L 160 0" stroke={stops[3]} strokeWidth="1.5" />
        </g>
      )}
      {/* Decorative grid for design-home */}
      {decoration === 'grid' && (
        <g opacity="0.20" stroke={stops[3]} strokeWidth="1" fill="none">
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={`gv-${i}`} x1={80 * i + 40} y1="80" x2={80 * i + 40} y2="380" />
          ))}
          {Array.from({ length: 5 }).map((_, i) => (
            <line key={`gh-${i}`} x1="40" y1={60 * i + 100} x2="760" y2={60 * i + 100} />
          ))}
        </g>
      )}
    </svg>
  );
};

const WarmHero: React.FC<WarmHeroProps> = ({
  variant, title, subtitle, ctaLabel, onCta, className, style, aspectRatio = '16 / 7',
}) => {
  const { isWarm } = useTheme();
  const [imgError, setImgError] = useState(false);

  // Only render hero treatment in warm mode. In other themes, render a
  // plain card-style heading block (parent controls outer card chrome).
  if (!isWarm) {
    return (
      <div className={className} style={style}>
        <h2 style={{ fontSize: 'clamp(28px, 3.4vh, 40px)', fontWeight: 800, margin: 0 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 'clamp(15px, 1.8vh, 20px)', opacity: 0.7, marginTop: 6 }}>{subtitle}</p>}
      </div>
    );
  }

  const artworkSrc = `/assets/warm/illustrations/${variant}.png`;

  return (
    <div className={`warm-hero warm-hero-${variant} ${className ?? ''}`} style={{
      position: 'relative',
      width: '100%',
      borderRadius: 'clamp(16px, 1.8vh, 22px)',
      overflow: 'hidden',
      background: 'var(--wm-surface-grad, #FFFDF8)',
      boxShadow: 'var(--wm-shadow-float, 0 12px 28px rgba(82,65,48,0.10), 0 30px 60px rgba(82,65,48,0.08)), var(--wm-shadow-inner-halo, inset 0 1px 0 rgba(255,253,248,0.95))',
      border: '1px solid var(--wm-border, rgba(122,99,71,0.16))',
      ...style,
    }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio, overflow: 'hidden' }}>
        {!imgError ? (
          <img
            src={artworkSrc}
            alt=""
            aria-hidden="true"
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <AbstractGradient variant={variant} />
        )}
        {/* Bottom-left text block layered over artwork */}
        <div style={{
          position: 'absolute',
          left: 'clamp(20px, 3vw, 44px)',
          bottom: 'clamp(20px, 3vh, 36px)',
          right: 'clamp(20px, 3vw, 44px)',
          maxWidth: '60%',
          color: 'var(--wm-text, #2F2A26)',
        }}>
          <h2 style={{
            margin: 0,
            fontSize: 'clamp(28px, 3.6vh, 44px)',
            fontWeight: 820,
            lineHeight: 1.06,
            letterSpacing: '-0.012em',
            color: 'var(--wm-text, #2F2A26)',
            textShadow: '0 1px 2px rgba(255, 253, 248, 0.55)',
          }}>
            {title}
          </h2>
          {subtitle && (
            <p style={{
              margin: '6px 0 0',
              fontSize: 'clamp(14px, 1.7vh, 19px)',
              fontWeight: 500,
              lineHeight: 1.45,
              color: 'var(--wm-text-2, #6A625B)',
              letterSpacing: '0.005em',
            }}>
              {subtitle}
            </p>
          )}
          {ctaLabel && onCta && (
            <button
              onClick={onCta}
              style={{
                marginTop: 'clamp(12px, 1.6vh, 18px)',
                padding: 'clamp(10px, 1.2vh, 14px) clamp(20px, 2.4vw, 30px)',
                background: 'var(--wm-teal, #497775)',
                color: 'var(--wm-text-on-teal, #FFFDF8)',
                border: 'none',
                borderRadius: '100px',
                fontWeight: 700,
                fontSize: 'clamp(14px, 1.6vh, 18px)',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(73, 119, 117, 0.32), 0 1px 2px rgba(73, 119, 117, 0.20)',
                transition: 'transform 200ms ease-out, box-shadow 200ms ease-out',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 18px rgba(73, 119, 117, 0.40), 0 2px 4px rgba(73, 119, 117, 0.24)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(73, 119, 117, 0.32), 0 1px 2px rgba(73, 119, 117, 0.20)';
              }}
            >
              {ctaLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(WarmHero);
