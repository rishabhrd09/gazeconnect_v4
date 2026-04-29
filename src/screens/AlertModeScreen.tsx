/**
 * AlertModeScreen
 *
 * Quiet, high-contrast alert board with maroon reserved for SOS and
 * restrained tinted cues for the remaining care actions.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import GazeButton from '../components/core/GazeButton';
import { useCustomization } from '../contexts/CustomizationContext';
import { useGazeControl } from '../components/core/GazeControlToggle';

interface AlertModeScreenProps {
  onSpeak: (text: string) => void;
  onHome: () => void;
  isDarkMode?: boolean;
}

const UI_FONT = "'Atkinson Hyperlegible Next', 'Segoe UI', system-ui, -apple-system, sans-serif";

const CARD_TONES: Array<{
  accent: string;
  label: string;
  background: string;
  border: string;
  text: string;
}> = [
  { accent: '#8A3B38', label: '#F6E2DD', background: '#64272B', border: 'transparent', text: '#FFF1E8' },
  { accent: '#8A3B38', label: '#E0BCB4', background: '#5D252B', border: 'transparent', text: '#FFF2EB' },
  { accent: '#6E7A53', label: '#CDD4BE', background: '#46503A', border: 'transparent', text: '#F2EEE5' },
  { accent: '#8F7750', label: '#DDC7A4', background: '#5B4B33', border: 'transparent', text: '#F6EEE0' },
  { accent: '#7A6254', label: '#DDCEC5', background: '#5A463E', border: 'transparent', text: '#F5EDE4' },
  { accent: '#5E6A63', label: '#CFD6D1', background: '#3E4843', border: 'transparent', text: '#EEF1EC' },
];

const ConfirmOverlay: React.FC<{
  label: string;
  tone: typeof CARD_TONES[number];
  onDone: () => void;
}> = ({ label, tone, onDone }) => {
  const [opacity, setOpacity] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpacity(1));
    timerRef.current = setTimeout(() => {
      setOpacity(0);
      setTimeout(onDone, 250);
    }, 2600);

    return () => {
      cancelAnimationFrame(frame);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onDone]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 10001,
      pointerEvents: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.72)',
      opacity,
      transition: 'opacity 240ms ease',
    }}>
      <div style={{
        width: 'min(72vw, 860px)',
        background: tone.background,
        border: 'none',
        borderRadius: 24,
        overflow: 'hidden',
        boxShadow: '0 18px 40px rgba(0,0,0,0.46)',
      }}>
        <div style={{
          padding: 'clamp(36px, 5vh, 60px) clamp(44px, 6vw, 84px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'clamp(10px, 1.8vh, 18px)',
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: 'clamp(12px, 1.4vh, 15px)',
            color: tone.label,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontFamily: UI_FONT,
          }}>
            Action Selected
          </div>
          <div style={{
            fontSize: 'clamp(34px, 5.2vh, 62px)',
            lineHeight: 1.12,
            fontWeight: 700,
            color: tone.text,
            fontFamily: UI_FONT,
          }}>
            {label}
          </div>
        </div>
      </div>
    </div>
  );
};

const HomeIcon: React.FC<{ size?: number; color?: string }> = ({ size = 34, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 10.4 12 4l8 6.4" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6.5 9.6V20h11V9.6" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 20v-5.5h4V20" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const AlertModeScreen: React.FC<AlertModeScreenProps> = ({ onSpeak, onHome }) => {
  const { data } = useCustomization();
  const { isGazeEnabled, lastEnabledTimestamp } = useGazeControl();
  const [confirming, setConfirming] = useState<{ label: string; idx: number } | null>(null);

  const handlePress = useCallback((label: string, idx: number) => {
    const spokenLabel = idx === 0 ? 'Emergency please come immediately' : label;
    const displayLabel = idx === 0 ? 'SOS Emergency' : label;
    onSpeak(spokenLabel);
    setConfirming({ label: displayLabel, idx });
  }, [onSpeak]);

  const handleDone = useCallback(() => setConfirming(null), []);

  const customCards = (data.alertModeCards ?? []).filter((card) => card.enabled).slice(0, 5);
  const cards: Array<{ label: string; isSos: boolean }> = [
    { label: 'SOS Emergency', isSos: true },
    ...customCards.map((card) => ({ label: card.label, isSos: false })),
  ];

  while (cards.length < 6) cards.push({ label: '', isSos: false });

  return (
    <>
      <div style={{
        position: 'fixed',
        inset: 0,
        background: '#0F1210',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        userSelect: 'none',
        fontFamily: UI_FONT,
      }}>
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 36,
          background: 'rgba(138,59,56,0.08)',
          borderBottom: '1px solid rgba(138,59,56,0.16)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8A3B38', opacity: 0.85 }} />
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#B89188',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            fontFamily: UI_FONT,
          }}>
            Alert Mode Active
          </span>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6E7A53', opacity: 0.85 }} />
        </div>

        <GazeButton
          id="alert-mode-home"
          onClick={onHome}
          isDarkMode
          gazeEnabled={isGazeEnabled}
          gazeEnabledTimestamp={lastEnabledTimestamp}
          dwellCategory="homeScreenTile"
          style={{
            position: 'absolute',
            left: 'clamp(28px, 3vw, 62px)',
            top: '50%',
            transform: 'translateY(-50%)',
            width: 'clamp(156px, 12vw, 214px)',
            height: 'clamp(156px, 19vh, 214px)',
            borderRadius: 28,
            background: '#171A18',
            border: 'none',
            color: '#D9CEC1',
            boxShadow: '0 10px 24px rgba(0,0,0,0.22)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            cursor: 'pointer',
            fontFamily: UI_FONT,
          }}
        >
          <HomeIcon size={50} color="#D9CEC1" />
          <span style={{
            fontSize: 'clamp(19px, 2.1vh, 24px)',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            Home
          </span>
        </GazeButton>

        <div style={{ marginBottom: 'clamp(18px, 2.6vh, 34px)', textAlign: 'center' }}>
          <div style={{
            fontSize: 'clamp(22px, 3.1vh, 38px)',
            fontWeight: 700,
            color: '#CEC4B8',
            lineHeight: 1.12,
          }}>
            Select a care action
          </div>
          <div style={{
            marginTop: 8,
            fontSize: 'clamp(12px, 1.3vh, 15px)',
            color: 'rgba(206,196,184,0.52)',
            fontWeight: 500,
          }}>
            Dwell on a card to activate
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(2, 1fr)',
          gap: 'clamp(18px, 2.8vw, 34px)',
          width: '78vw',
          height: '62vh',
          minHeight: 360,
          maxWidth: 1160,
        }}>
          {cards.map((card, idx) => {
            if (!card.label) return <div key={`empty-${idx}`} />;
            const tone = CARD_TONES[idx] ?? CARD_TONES[5];

            return (
              <GazeButton
                key={`${card.label}-${idx}`}
                id={`alert-card-${idx}`}
                onClick={() => handlePress(card.label, idx)}
                isDarkMode
                gazeEnabled={isGazeEnabled}
                gazeEnabledTimestamp={lastEnabledTimestamp}
                dwellCategory={card.isSos ? 'medicalUrgent' : 'quickWord'}
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: 160,
                  borderRadius: 22,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 'clamp(20px, 2.8vh, 34px) clamp(18px, 2.2vw, 28px)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  background: tone.background,
                  border: 'none',
                  boxShadow: '0 10px 24px rgba(0,0,0,0.24)',
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                }}>
                  <span style={{
                    fontSize: card.isSos ? 'clamp(28px, 3.8vh, 42px)' : 'clamp(26px, 3.5vh, 38px)',
                    fontWeight: 800,
                    color: tone.text,
                    lineHeight: 1.12,
                    letterSpacing: '0',
                    textTransform: 'none',
                    fontFamily: UI_FONT,
                  }}>
                    {card.label}
                  </span>
                </div>
              </GazeButton>
            );
          })}
        </div>

        <div style={{
          position: 'absolute',
          bottom: 10,
          fontSize: 11,
          color: 'rgba(150,130,110,0.28)',
          letterSpacing: '0.02em',
        }}>
          Right-click to disable Alert Mode
        </div>
      </div>

      {confirming && (
        <ConfirmOverlay
          label={confirming.label}
          tone={CARD_TONES[confirming.idx] ?? CARD_TONES[5]}
          onDone={handleDone}
        />
      )}
    </>
  );
};

export default AlertModeScreen;
