/**
 * GazeConnect Pro - QuickFires Component
 * Full-width, large buttons that spread across the entire row.
 * Clean design with larger fonts for easy gaze selection.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { darkColors, lightColors, dwellTiming } from '../utils/design';

interface QuickFireItem {
  id: string; label: string; labelHindi?: string; speak?: string;
}

interface QuickFiresProps {
  onSpeak: (text: string) => void;
  isDarkMode?: boolean; showHindi?: boolean;
  compact?: boolean; variant?: 'standard' | 'medical';
}

const STANDARD_QUICKFIRES: QuickFireItem[] = [
  { id: 'yes', label: 'Yes', labelHindi: 'हाँ', speak: 'Yes' },
  { id: 'no', label: 'No', labelHindi: 'नहीं', speak: 'No' },
  { id: 'wait', label: 'Wait', labelHindi: 'रुको', speak: 'Please wait' },
  { id: 'help', label: 'Help', labelHindi: 'मदद', speak: 'I need help' },
  { id: 'more', label: 'More', labelHindi: 'और', speak: 'Tell me more' },
  { id: 'done', label: 'Done', labelHindi: 'हो गया', speak: 'I am done' },
  { id: 'thanks', label: 'Thanks', labelHindi: 'धन्यवाद', speak: 'Thank you' },
  { id: 'ok', label: 'OK', labelHindi: 'ठीक', speak: 'OK' },
  { id: 'repeat', label: 'Repeat', labelHindi: 'दोहराओ', speak: 'Repeat that' },
  { id: 'stop', label: 'Stop', labelHindi: 'रोको', speak: 'Stop' },
  { id: 'pain', label: 'Pain', labelHindi: 'दर्द', speak: 'I have pain' },
  { id: 'water', label: 'Water', labelHindi: 'पानी', speak: 'I want water' },
];

const MEDICAL_QUICKFIRES: QuickFireItem[] = [
  { id: 'pain', label: 'Pain', labelHindi: 'दर्द', speak: 'I have pain' },
  { id: 'suction', label: 'Suction', labelHindi: 'सक्शन', speak: 'I need suction' },
  { id: 'position', label: 'Position', labelHindi: 'करवट', speak: 'Change my position' },
  { id: 'water', label: 'Water', labelHindi: 'पानी', speak: 'I want water' },
  { id: 'toilet', label: 'Toilet', labelHindi: 'शौचालय', speak: 'I need to use the toilet' },
  { id: 'medicine', label: 'Medicine', labelHindi: 'दवाई', speak: 'I need my medicine' },
  { id: 'cold', label: 'Cold', labelHindi: 'ठंड', speak: 'I am feeling cold' },
  { id: 'hot', label: 'Hot', labelHindi: 'गर्मी', speak: 'I am feeling hot' },
  { id: 'breathing', label: 'Breathing', labelHindi: 'सांस', speak: 'Breathing problem' },
  { id: 'help', label: 'Help', labelHindi: 'मदद', speak: 'I need help' },
];

const QuickFireButton: React.FC<{
  item: QuickFireItem; onActivate: () => void;
  isDarkMode: boolean; showHindi: boolean; compact: boolean;
  textOnly?: boolean; // New prop for prediction-style aesthetic
}> = ({ item, onActivate, isDarkMode, showHindi, compact, textOnly }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isActivated, setIsActivated] = useState(false);
  const colors = isDarkMode ? darkColors : lightColors;
  const dwellTime = dwellTiming.contexts.quickfire;
  const dwellTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const clearTimers = useCallback(() => {
    if (dwellTimerRef.current) { clearTimeout(dwellTimerRef.current); dwellTimerRef.current = null; }
    if (progressTimerRef.current) { cancelAnimationFrame(progressTimerRef.current); progressTimerRef.current = null; }
  }, []);

  const updateProgress = useCallback(() => {
    const prog = Math.min(1, (Date.now() - startTimeRef.current) / dwellTime);
    setProgress(prog);
    if (prog < 1) progressTimerRef.current = requestAnimationFrame(updateProgress);
  }, [dwellTime]);

  const handleEnter = () => {
    setIsHovered(true); startTimeRef.current = Date.now();
    progressTimerRef.current = requestAnimationFrame(updateProgress);
    dwellTimerRef.current = setTimeout(() => {
      setIsActivated(true); setProgress(0); onActivate();
      setTimeout(() => setIsActivated(false), 150);
    }, dwellTime);
  };
  const handleLeave = () => { setIsHovered(false); setProgress(0); clearTimers(); };
  useEffect(() => () => clearTimers(), [clearTimers]);

  // Dynamic Styles based on textOnly prop
  const buttonStyle: React.CSSProperties = textOnly ? {
    // Prediction Word Style
    flex: 1,
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 12px',
    minWidth: '60px',
    color: isHovered ? colors.accent.main : '#FFFFFF', // White text by default
    fontSize: 'clamp(24px, 2.4vw, 32px)', // Much larger font
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    letterSpacing: '0.5px',
    cursor: 'pointer',
    transition: 'all 150ms ease',
    transform: isActivated ? 'scale(0.95)' : isHovered ? 'scale(1.1)' : 'scale(1)',
    backgroundColor: 'transparent',
    border: 'none', // No border
    textShadow: isHovered ? '0 0 12px rgba(255,255,255,0.4)' : 'none',
  } : {
    // Standard Pill Style (Default)
    flex: 1,
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: compact ? '10px 8px' : '12px 10px',
    minWidth: '60px',
    color: colors.text.primary,
    fontSize: compact ? 'clamp(16px, 1.5vw, 20px)' : 'clamp(20px, 2.0vw, 26px)',
    fontWeight: 600,
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    letterSpacing: '0.3px',
    cursor: 'pointer',
    transition: 'all 100ms',
    transform: isActivated ? 'scale(0.92)' : isHovered ? 'scale(1.08)' : 'scale(1)',
    borderRadius: '30px',
    boxShadow: isHovered ? '0 4px 12px rgba(0,0,0,0.2)' : '0 2px 5px rgba(0,0,0,0.1)',
    whiteSpace: 'nowrap',
    backgroundColor: isHovered
      ? 'rgba(80, 140, 200, 0.25)'
      : 'rgba(50, 60, 75, 0.6)',
    border: `1px solid ${isHovered ? colors.accent.main : 'rgba(100, 115, 130, 0.3)'}`,
  };

  return (
    <button
      style={buttonStyle}
      onMouseEnter={handleEnter} onMouseLeave={handleLeave} onClick={onActivate}
    >
      {isHovered && !textOnly && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, height: 3,
          width: `${progress * 100}%`, backgroundColor: colors.accent.main,
          borderRadius: '2px',
        }} />
      )}
      {/* For textOnly, maybe a subtle underscore or glow for progress? Or just the text scale/color change is enough. */}
      {isHovered && textOnly && (
        <div style={{
          position: 'absolute', bottom: -4, left: '10%', right: '10%', height: 3,
          width: `${progress * 80}%`, margin: '0 auto', backgroundColor: colors.accent.main,
          borderRadius: '2px', opacity: 0.8
        }} />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1 }}>
        <span>{item.label}</span>
        {showHindi && item.labelHindi && (
          <span style={{
            fontSize: compact ? 'clamp(11px, 1vh, 14px)' : 'clamp(14px, 1.5vh, 18px)',
            fontWeight: 700,
            color: isHovered ? colors.accent.main : colors.text.secondary,
            marginTop: '2px',
            fontFamily: "'Noto Sans Devanagari', 'Mangal', sans-serif"
          }}>
            {item.labelHindi}
          </span>
        )}
      </div>
    </button>
  );
};

const QuickFires: React.FC<QuickFiresProps & { textOnly?: boolean }> = ({
  onSpeak, isDarkMode = true, showHindi = false, compact = false, variant = 'standard', textOnly = false,
}) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const items = variant === 'medical' ? MEDICAL_QUICKFIRES : STANDARD_QUICKFIRES;

  const handleActivate = useCallback((item: QuickFireItem) => {
    onSpeak(item.speak || item.label);
  }, [onSpeak]);

  return (
    <div style={{
      display: 'flex',
      width: '100%',
      padding: compact ? '6px 4px' : '12px 8px',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: 'transparent',
      borderRadius: '0',
      gap: textOnly ? '32px' : '24px', // Even wider gap for text-only
      flexWrap: 'nowrap',
    }}>
      {items.map(item => (
        <QuickFireButton key={item.id} item={item}
          onActivate={() => handleActivate(item)}
          isDarkMode={isDarkMode} showHindi={showHindi} compact={compact} textOnly={textOnly} />
      ))}
    </div>
  );
};

export default QuickFires;
export { STANDARD_QUICKFIRES, MEDICAL_QUICKFIRES };
