/**
 * AlertModePanel - Settings panel for Alert Mode cards
 * =====================================================
 * Allows caregivers to configure the 5 customizable cards
 * shown on the Alert Mode lock screen.
 * Card 0 (SOS Emergency) is fixed and shown as read-only.
 * Mouse-only (no gaze buttons in this panel).
 */

import React, { useState, useCallback } from 'react';
import { darkColors, lightColors, typography, spacing } from '../../../utils/design';
import { useCustomization } from '../../../contexts/CustomizationContext';
import { DEFAULT_CUSTOMIZATION } from '../../../services/defaultCustomization';
import type { AlertModeCard } from '../../../types/customization';

interface AlertModePanelProps {
    isDarkMode: boolean;
}

const MAX_CARDS = 5;

const AlertModePanel: React.FC<AlertModePanelProps> = ({ isDarkMode }) => {
    const colors = isDarkMode ? darkColors : lightColors;
    const { data, updateAlertModeCards } = useCustomization();

    const savedCards = data.alertModeCards ?? DEFAULT_CUSTOMIZATION.alertModeCards;

    // Local draft state padded to exactly 5 slots
    const [cards, setCards] = useState<AlertModeCard[]>(() => {
        const base = [...savedCards];
        while (base.length < MAX_CARDS) base.push({ label: '', enabled: false });
        return base.slice(0, MAX_CARDS);
    });

    const [saved, setSaved] = useState(false);

    const handleLabelChange = useCallback((idx: number, val: string) => {
        setCards(prev => prev.map((c, i) => i === idx ? { ...c, label: val } : c));
        setSaved(false);
    }, []);

    const handleToggle = useCallback((idx: number) => {
        setCards(prev => prev.map((c, i) => i === idx ? { ...c, enabled: !c.enabled } : c));
        setSaved(false);
    }, []);

    const handleSave = useCallback(() => {
        updateAlertModeCards(cards.filter(c => c.label.trim() !== '' || c.enabled));
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    }, [cards, updateAlertModeCards]);

    const handleReset = useCallback(() => {
        const defaults = DEFAULT_CUSTOMIZATION.alertModeCards;
        const base = [...defaults];
        while (base.length < MAX_CARDS) base.push({ label: '', enabled: false });
        setCards(base.slice(0, MAX_CARDS));
        setSaved(false);
    }, []);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[4] }}>
            {/* Header */}
            <div>
                <div style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.text.primary }}>
                    Alert Mode Cards
                </div>
                <div style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary, marginTop: 4 }}>
                    Configure the 5 care-action cards shown on the Alert Mode lock screen. The SOS Emergency card is always present.
                </div>
            </div>

            {/* Info banner */}
            <div style={{
                padding: '10px 14px', borderRadius: 8,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                fontSize: 13, color: colors.text.secondary, lineHeight: 1.5,
            }}>
                <strong style={{ color: '#EF4444' }}>Alert Mode</strong> is activated via right-click menu on the home screen.
                When active, the app shows a full-screen lock screen with the SOS card and your configured cards below.
            </div>

            {/* SOS card: fixed, read-only */}
            <div style={{
                padding: '14px 18px', borderRadius: 12,
                background: 'rgba(127,29,29,0.25)', border: '2px solid rgba(239,68,68,0.45)',
                display: 'flex', alignItems: 'center', gap: 14,
            }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#FCA5A5' }}>SOS</span>
                <div>
                    <div style={{ fontWeight: 700, color: '#FCA5A5', fontSize: 15 }}>Card 1 - SOS EMERGENCY</div>
                    <div style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 2 }}>
                        Always present, cannot be removed or renamed. Speaks: "Emergency - please come immediately"
                    </div>
                </div>
                <span style={{
                    marginLeft: 'auto', padding: '3px 10px', borderRadius: 6,
                    background: 'rgba(239,68,68,0.2)', color: '#EF4444', fontSize: 12, fontWeight: 700,
                }}>
                    FIXED
                </span>
            </div>

            {/* 5 Customizable Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {cards.map((card, idx) => (
                    <div key={idx} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 16px', borderRadius: 10,
                        background: colors.background.secondary,
                        border: `1px solid ${colors.border.main}`,
                    }}>
                        {/* Card number badge */}
                        <div style={{
                            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                            background: card.enabled ? 'rgba(56,130,184,0.25)' : colors.background.tertiary,
                            border: `1.5px solid ${card.enabled ? 'rgba(56,130,184,0.6)' : colors.border.main}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, fontWeight: 700,
                            color: card.enabled ? '#7DD3FC' : colors.text.tertiary,
                        }}>
                            {idx + 2}
                        </div>

                        {/* Label input */}
                        <input
                            value={card.label}
                            onChange={e => handleLabelChange(idx, e.target.value)}
                            placeholder={`Card ${idx + 2} label (e.g. Oral Suction)`}
                            style={{
                                flex: 1,
                                padding: '8px 12px',
                                background: colors.background.tertiary,
                                border: `1px solid ${colors.border.main}`,
                                borderRadius: 8, color: colors.text.primary,
                                fontSize: 14, fontFamily: 'inherit', outline: 'none',
                                boxSizing: 'border-box',
                            }}
                        />

                        {/* Enable toggle */}
                        <button
                            onClick={() => handleToggle(idx)}
                            title={card.enabled ? 'Disable card' : 'Enable card'}
                            style={{
                                width: 44, height: 24, borderRadius: 12, border: 'none',
                                cursor: 'pointer', position: 'relative', transition: 'background 150ms',
                                flexShrink: 0,
                                background: card.enabled ? '#3882B8' : colors.border.main,
                            }}
                        >
                            <span style={{
                                position: 'absolute', top: 3, left: 3,
                                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                                transition: 'transform 150ms',
                                transform: card.enabled ? 'translateX(20px)' : 'translateX(0)',
                            }} />
                        </button>

                        <span style={{ fontSize: 12, color: colors.text.tertiary, width: 52, textAlign: 'center' }}>
                            {card.enabled ? 'ON' : 'OFF'}
                        </span>
                    </div>
                ))}
            </div>

            {/* Footer actions */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                    onClick={handleSave}
                    style={{
                        padding: '10px 28px', borderRadius: 8, border: 'none',
                        background: saved ? '#497775' : '#3882B8',
                        color: '#fff', fontWeight: 700, fontSize: 14,
                        cursor: 'pointer', transition: 'background 200ms', fontFamily: 'inherit',
                    }}
                >
                    {saved ? 'Saved' : 'Save Changes'}
                </button>
                <button
                    onClick={handleReset}
                    style={{
                        padding: '10px 18px', borderRadius: 8,
                        border: `1px solid ${colors.border.main}`,
                        background: 'transparent', color: colors.text.secondary,
                        fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                >
                    Reset to Defaults
                </button>
                <span style={{ fontSize: 12, color: colors.text.tertiary, marginLeft: 8 }}>
                    Changes take effect immediately on next Alert Mode activation
                </span>
            </div>
        </div>
    );
};

export default AlertModePanel;
