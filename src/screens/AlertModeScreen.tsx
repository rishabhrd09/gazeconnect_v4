/**
 * AlertModeScreen — Flat solid warm-muted cards, no icons, no gradients
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import GazeButton from '../components/core/GazeButton';
import { useCustomization } from '../contexts/CustomizationContext';
import { useGazeControl } from '../components/core/GazeControlToggle';

interface AlertModeScreenProps {
    onSpeak: (text: string) => void;
    isDarkMode?: boolean;
}

// Warm, muted, flat solid colours — no gradients
const CARD_COLORS: Array<{ bg: string; text: string; border: string }> = [
    { bg: '#5C3030', text: '#F2C4C4', border: '#7A4040' }, // SOS — warm muted red
    { bg: '#3D4E3A', text: '#B8D4B0', border: '#4E6448' }, // muted sage green
    { bg: '#3C4A56', text: '#B4C8D8', border: '#4C5E6E' }, // muted slate blue
    { bg: '#534230', text: '#D8BC8C', border: '#6A543C' }, // muted warm amber
    { bg: '#4A3848', text: '#CCA8C8', border: '#5E4860' }, // muted mauve
    { bg: '#2E4C44', text: '#98C8B8', border: '#3C6058' }, // muted warm teal
];

// ── Confirmation Overlay ──────────────────────────────────────────

const ConfirmOverlay: React.FC<{
    label: string;
    colors: typeof CARD_COLORS[0];
    onDone: () => void;
}> = ({ label, colors, onDone }) => {
    const [opacity, setOpacity] = useState(0);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const raf = requestAnimationFrame(() => setOpacity(1));
        timerRef.current = setTimeout(() => {
            setOpacity(0);
            setTimeout(onDone, 350);
        }, 3000);
        return () => { cancelAnimationFrame(raf); if (timerRef.current) clearTimeout(timerRef.current); };
    }, [onDone]);

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 10001, pointerEvents: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.75)', opacity, transition: 'opacity 300ms ease',
        }}>
            <div style={{
                background: colors.bg,
                border: `2px solid ${colors.border}`,
                borderRadius: 28,
                padding: 'clamp(40px, 6vh, 80px) clamp(56px, 9vw, 112px)',
                textAlign: 'center',
                boxShadow: '0 24px 56px rgba(0,0,0,0.6)',
                maxWidth: '66vw',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 'clamp(12px, 2vh, 24px)',
            }}>
                <div style={{
                    fontSize: 'clamp(11px, 1.4vh, 15px)',
                    color: colors.text, opacity: 0.6,
                    fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase',
                    fontFamily: "'Outfit','Inter',system-ui,sans-serif",
                }}>
                    Action Selected
                </div>
                <div style={{
                    fontSize: 'clamp(34px, 5.5vh, 66px)',
                    fontWeight: 900, color: colors.text, lineHeight: 1.15,
                    fontFamily: "'Outfit','Inter',system-ui,sans-serif",
                    letterSpacing: '-0.3px',
                }}>
                    {label}
                </div>
                {/* 3-second drain bar */}
                <div style={{
                    width: 'clamp(160px, 28vw, 320px)', height: 3, borderRadius: 2,
                    background: 'rgba(255,255,255,0.12)', overflow: 'hidden', marginTop: 4,
                }}>
                    <div style={{
                        height: '100%', borderRadius: 2, background: colors.text, opacity: 0.7,
                        animation: 'drainBar 3s linear forwards',
                    }} />
                </div>
            </div>
        </div>
    );
};

// ── Main Screen ───────────────────────────────────────────────────

const AlertModeScreen: React.FC<AlertModeScreenProps> = ({ onSpeak }) => {
    const { data } = useCustomization();
    const { isGazeEnabled, lastEnabledTimestamp } = useGazeControl();
    const [confirming, setConfirming] = useState<{ label: string; idx: number } | null>(null);

    const handlePress = useCallback((label: string, idx: number) => {
        onSpeak(idx === 0 ? 'Emergency — please come immediately' : label);
        setConfirming({ label: idx === 0 ? 'SOS EMERGENCY' : label, idx });
    }, [onSpeak]);

    const handleDone = useCallback(() => setConfirming(null), []);

    const customCards = (data.alertModeCards ?? []).filter(c => c.enabled).slice(0, 5);
    const cards: Array<{ label: string; isSos: boolean }> = [
        { label: 'SOS EMERGENCY', isSos: true },
        ...customCards.map(c => ({ label: c.label, isSos: false })),
    ];
    while (cards.length < 6) cards.push({ label: '', isSos: false });

    return (
        <>
            <div style={{
                position: 'fixed', inset: 0,
                background: '#0F1210',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                zIndex: 9999, userSelect: 'none',
                fontFamily: "'Outfit','Inter',system-ui,sans-serif",
            }}>

                {/* Status bar */}
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 36,
                    background: 'rgba(150,60,60,0.08)',
                    borderBottom: '1px solid rgba(150,60,60,0.14)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                    <div style={{
                        width: 6, height: 6, borderRadius: '50%', background: '#A86060',
                        animation: 'alertDot 2s ease-in-out infinite',
                    }} />
                    <span style={{
                        fontSize: 11, fontWeight: 800, color: '#9C7878',
                        letterSpacing: '3.5px', textTransform: 'uppercase',
                    }}>
                        ALERT MODE ACTIVE
                    </span>
                    <div style={{
                        width: 6, height: 6, borderRadius: '50%', background: '#A86060',
                        animation: 'alertDot 2s ease-in-out infinite 1s',
                    }} />
                </div>

                {/* Title */}
                <div style={{ marginBottom: 'clamp(18px, 2.6vh, 36px)', textAlign: 'center' }}>
                    <div style={{
                        fontSize: 'clamp(22px, 3.2vh, 40px)', fontWeight: 800,
                        color: '#CEC4B8', letterSpacing: '-0.2px',
                    }}>
                        Select a care action
                    </div>
                    <div style={{
                        marginTop: 6, fontSize: 'clamp(12px, 1.3vh, 15px)',
                        color: 'rgba(180,160,140,0.42)', fontWeight: 500,
                    }}>
                        Dwell on a card to activate
                    </div>
                </div>

                {/* 2×3 grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gridTemplateRows: 'repeat(2, 1fr)',
                    gap: 'clamp(18px, 2.8vw, 36px)',
                    width: '78vw', height: '62vh', minHeight: 360, maxWidth: 1160,
                }}>
                    {cards.map((card, idx) => {
                        if (!card.label) return <div key={idx} />;
                        const cs = CARD_COLORS[idx] ?? CARD_COLORS[5];

                        return (
                            <GazeButton
                                key={idx}
                                id={`alert-card-${idx}`}
                                onClick={() => handlePress(card.label, idx)}
                                isDarkMode={true}
                                gazeEnabled={isGazeEnabled}
                                gazeEnabledTimestamp={lastEnabledTimestamp}
                                dwellCategory={card.isSos ? 'medicalUrgent' : 'quickWord'}
                                style={{
                                    width: '100%', height: '100%', minHeight: 160,
                                    borderRadius: 20,
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center',
                                    padding: 'clamp(18px, 2.6vh, 34px) clamp(14px, 2vw, 26px)',
                                    cursor: 'pointer', textAlign: 'center',
                                    // Flat solid fill — no gradient
                                    background: cs.bg,
                                    border: `1.5px solid ${cs.border}`,
                                    boxShadow: '0 6px 20px rgba(0,0,0,0.38)',
                                    transition: 'transform 0.13s ease, box-shadow 0.13s ease',
                                }}
                            >
                                <span style={{
                                    fontSize: card.isSos
                                        ? 'clamp(24px, 3.4vh, 40px)'
                                        : 'clamp(20px, 3vh, 36px)',
                                    fontWeight: 900,
                                    color: cs.text,
                                    lineHeight: 1.2,
                                    letterSpacing: card.isSos ? '0.04em' : '0.01em',
                                    textTransform: card.isSos ? 'uppercase' : 'none',
                                    textShadow: '0 1px 4px rgba(0,0,0,0.35)',
                                }}>
                                    {card.label}
                                </span>
                            </GazeButton>
                        );
                    })}
                </div>

                {/* Footer */}
                <div style={{
                    position: 'absolute', bottom: 10,
                    fontSize: 11, color: 'rgba(150,130,110,0.28)', letterSpacing: '0.3px',
                }}>
                    Right-click to disable Alert Mode
                </div>

                <style>{`
          @keyframes alertDot { 0%,100%{opacity:.2} 50%{opacity:.85} }
          @keyframes drainBar { from{width:100%} to{width:0%} }
        `}</style>
            </div>

            {confirming && (
                <ConfirmOverlay
                    label={confirming.label}
                    colors={CARD_COLORS[confirming.idx] ?? CARD_COLORS[5]}
                    onDone={handleDone}
                />
            )}
        </>
    );
};

export default AlertModeScreen;
