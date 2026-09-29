/**
 * AlertModePanel - Settings panel for Alert Mode cards
 * =====================================================
 * Allows caregivers to configure the 5 customizable cards
 * shown on the Alert Mode lock screen.
 * Card 0 (SOS Emergency) is fixed and shown as read-only.
 * Mouse-only (no gaze buttons in this panel).
 */

import React, { useState, useCallback } from 'react';
import { useReportUnsavedChanges } from '../shared/unsavedChanges';
import { lightColors, typography, spacing } from '../../../utils/design';
import { useDarkPalette, useTheme } from '../../../contexts/ThemeContext';
import { MIDNIGHT_NAVY } from '../../../config/midnightNavy';
import { useCustomization } from '../../../contexts/CustomizationContext';
import { DEFAULT_CUSTOMIZATION } from '../../../services/defaultCustomization';
import type { AlertModeCard } from '../../../types/customization';

interface AlertModePanelProps {
    isDarkMode: boolean;
}

const MAX_CARDS = 5;

/** The editor always shows exactly five rows. */
const padCards = (list: AlertModeCard[]): AlertModeCard[] => {
    const base = [...list];
    while (base.length < MAX_CARDS) base.push({ label: '', enabled: false });
    return base.slice(0, MAX_CARDS);
};

const AlertModePanel: React.FC<AlertModePanelProps> = ({ isDarkMode }) => {
    const darkPalette = useDarkPalette();
    const colors = isDarkMode ? darkPalette : lightColors;
    // This panel's own reds and blues; Midnight Navy draws them from its palette instead.
    const sos = useTheme().isMidnightNavy
        ? {
            ink: MIDNIGHT_NAVY.stateDanger, text: MIDNIGHT_NAVY.stateDanger, note: 'rgba(208,140,130,0.08)', noteEdge: 'rgba(208,140,130,0.28)',
            card: 'rgba(208,140,130,0.12)', cardEdge: 'rgba(208,140,130,0.45)', tag: 'rgba(208,140,130,0.06)',
            onBg: MIDNIGHT_NAVY.cardLive, onEdge: MIDNIGHT_NAVY.accent, onInk: MIDNIGHT_NAVY.accent,
            switchOn: MIDNIGHT_NAVY.accent, knobOn: MIDNIGHT_NAVY.bgEdge, knobOff: MIDNIGHT_NAVY.textSecondary,
            save: MIDNIGHT_NAVY.action, saved: '#1A2E43', saveInk: MIDNIGHT_NAVY.actionInk, savedInk: MIDNIGHT_NAVY.stateOk,
        }
        : {
            ink: '#EF4444', text: '#FCA5A5', note: 'rgba(239,68,68,0.08)', noteEdge: 'rgba(239,68,68,0.25)',
            card: 'rgba(127,29,29,0.25)', cardEdge: 'rgba(239,68,68,0.45)', tag: 'rgba(239,68,68,0.2)',
            onBg: 'rgba(56,130,184,0.25)', onEdge: 'rgba(56,130,184,0.6)', onInk: '#7DD3FC',
            switchOn: '#3882B8', knobOn: '#fff', knobOff: '#fff',
            save: '#3882B8', saved: '#497775', saveInk: '#fff', savedInk: '#fff',
        };
    const { data, updateAlertModeCards } = useCustomization();

    const savedCards = data.alertModeCards ?? DEFAULT_CUSTOMIZATION.alertModeCards;

    // Local draft state padded to exactly 5 slots
    const [cards, setCards] = useState<AlertModeCard[]>(() => padCards(savedCards));
    const isDirty = JSON.stringify(cards) !== JSON.stringify(padCards(savedCards));
    useReportUnsavedChanges(isDirty);

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
        const kept = cards.filter(c => c.label.trim() !== '' || c.enabled);
        updateAlertModeCards(kept);
        setCards(padCards(kept));
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    }, [cards, updateAlertModeCards]);

    const handleReset = useCallback(() => {
        setCards(padCards(DEFAULT_CUSTOMIZATION.alertModeCards));
        setSaved(false);
    }, []);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[4] }}>
            {/* Header */}
            <div>
                <div className="settings-panel-title" style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.text.primary }}>
                    Urgent Needs Cards
                </div>
                <div style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary, marginTop: 4 }}>
                    Choose the 5 care-action cards shown on the Urgent Needs screen. The SOS Emergency card is always there.
                </div>
            </div>

            {/* Info banner */}
            <div style={{
                padding: '10px 14px', borderRadius: 8,
                background: sos.note, border: `1px solid ${sos.noteEdge}`,
                fontSize: 13, color: colors.text.secondary, lineHeight: 1.5,
            }}>
                <strong style={{ color: sos.ink }}>Urgent Needs</strong> opens from its card on the Home screen, or from the right-click menu.
                It fills the screen with the SOS card and your chosen cards, and can be locked from the right-click menu.
            </div>

            {/* SOS card: fixed, read-only */}
            <div style={{
                padding: '14px 18px', borderRadius: 12,
                background: sos.card, border: `2px solid ${sos.cardEdge}`,
                display: 'flex', alignItems: 'center', gap: 14,
            }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: sos.text }}>SOS</span>
                <div>
                    <div style={{ fontWeight: 700, color: sos.text, fontSize: 15 }}>Card 1 - SOS EMERGENCY</div>
                    <div style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 2 }}>
                        Always present, cannot be removed or renamed. Speaks: "Emergency - please come immediately"
                    </div>
                </div>
                <span style={{
                    marginLeft: 'auto', padding: '3px 10px', borderRadius: 6,
                    background: sos.tag, color: sos.ink, fontSize: 12, fontWeight: 700,
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
                            background: card.enabled ? sos.onBg : colors.background.tertiary,
                            border: `1.5px solid ${card.enabled ? sos.onEdge : colors.border.main}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, fontWeight: 700,
                            color: card.enabled ? sos.onInk : colors.text.tertiary,
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
                                background: card.enabled ? sos.switchOn : colors.border.main,
                            }}
                        >
                            <span style={{
                                position: 'absolute', top: 3, left: 3,
                                width: 18, height: 18, borderRadius: '50%', background: card.enabled ? sos.knobOn : sos.knobOff,
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
                        background: saved ? sos.saved : sos.save,
                        color: saved ? sos.savedInk : sos.saveInk, fontWeight: 700, fontSize: 14,
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
                    Reset this page
                </button>
                <span style={{ fontSize: 12, color: colors.text.tertiary, marginLeft: 8 }}>
                    Changes show the next time Urgent Needs opens
                </span>
            </div>
        </div>
    );
};

export default AlertModePanel;
