import React, { useState, useCallback } from 'react';
import { darkColors, lightColors, typography, spacing } from '../../../utils/design';
import ToggleSetting from '../shared/ToggleSetting';
import SliderSetting from '../shared/SliderSetting';
import SelectSetting from '../shared/SelectSetting';
import { useCustomization } from '../../../contexts/CustomizationContext';
import { useDwellTime } from '../../../contexts/DwellTimeContext';
import { useWS } from '../../../hooks/useWebSocket';
import { useTheme } from '../../../contexts/ThemeContext';
import { DWELL_CATEGORIES, DWELL_PRESETS, DEFAULT_DWELL_TIMES, ALS_STAGE_PRESETS } from '../../../config/dwellTimeConfig';
import type { DwellTimeSettings } from '../../../config/dwellTimeConfig';
import type { ALSStageKey } from '../../../contexts/DwellTimeContext';

// ─── Dwell Time Settings Section ─────────────────────────────
const DwellTimeSection: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const { settings: dwellSettings, updateSettings, restoreDefaults, applyPreset, applyALSStage, currentStage, isDefault } = useDwellTime();
  const { setFilterPreset } = useWS();

  const groupLabels: Record<string, string> = {
    core: 'CORE TIMINGS',
    screen: 'SCREEN-SPECIFIC',
    advanced: 'ADVANCED',
  };

  const sectionStyle: React.CSSProperties = {
    background: 'rgba(15, 23, 42, 0.6)',
    borderRadius: '12px',
    border: '1px solid rgba(100, 116, 139, 0.15)',
    padding: '16px',
  };

  const dividerStyle: React.CSSProperties = {
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    color: '#5A6577',
    borderBottom: '1px solid rgba(100, 116, 139, 0.1)',
    paddingBottom: '6px',
    marginTop: '12px',
    marginBottom: '8px',
  };

  return (
    <div style={sectionStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '16px', fontWeight: 700, color: colors.text.primary }}>
          Dwell Timings
        </span>
        <button
          onClick={restoreDefaults}
          disabled={isDefault}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            border: `1px solid ${isDefault ? '#4A5568' : '#64B5F6'}`,
            borderRadius: '6px',
            background: 'transparent',
            color: isDefault ? '#4A5568' : '#64B5F6',
            cursor: isDefault ? 'default' : 'pointer',
            opacity: isDefault ? 0.6 : 1,
          }}
        >
          {isDefault ? 'Using Defaults' : 'Restore Defaults'}
        </button>
      </div>

      {/* ALS Stage Profile */}
      <div style={{ marginBottom: '14px', background: 'rgba(45, 212, 191, 0.04)', border: '1px solid rgba(45, 212, 191, 0.15)', borderRadius: '10px', padding: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#2DD4BF', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
          ALS STAGE PROFILE
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(Object.keys(ALS_STAGE_PRESETS) as ALSStageKey[]).map(key => {
            const preset = ALS_STAGE_PRESETS[key];
            const isActive = currentStage === key;
            return (
              <button
                key={key}
                onClick={() => {
                  applyALSStage(key);
                  // v15: Also apply the corresponding backend gaze filter preset
                  setFilterPreset(preset.filterPreset);
                }}
                title={preset.description}
                style={{
                  flex: 1,
                  minWidth: '80px',
                  padding: '10px 6px',
                  fontSize: '12px',
                  fontWeight: isActive ? 800 : 600,
                  border: isActive ? '2px solid #2DD4BF' : '1px solid rgba(100, 116, 139, 0.2)',
                  borderRadius: '8px',
                  background: isActive ? 'rgba(45, 212, 191, 0.15)' : 'rgba(100, 116, 139, 0.06)',
                  color: isActive ? '#2DD4BF' : colors.text.secondary,
                  cursor: 'pointer',
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        {currentStage && (
          <div style={{ marginTop: '6px', fontSize: '11px', color: '#94A3B8' }}>
            Active: {ALS_STAGE_PRESETS[currentStage].description}
          </div>
        )}
      </div>

      {/* Fine-tuning Presets */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {(Object.keys(DWELL_PRESETS) as (keyof typeof DWELL_PRESETS)[]).map(key => (
          <button
            key={key}
            onClick={() => applyPreset(key)}
            style={{
              flex: 1,
              minWidth: '70px',
              padding: '8px 6px',
              fontSize: '13px',
              fontWeight: 600,
              border: '1px solid rgba(100, 116, 139, 0.2)',
              borderRadius: '8px',
              background: 'rgba(100, 116, 139, 0.06)',
              color: colors.text.secondary,
              cursor: 'pointer',
            }}
          >
            {DWELL_PRESETS[key].label}
          </button>
        ))}
      </div>

      {/* Category sliders grouped */}
      {(['core', 'screen', 'advanced'] as const).map(group => {
        const items = DWELL_CATEGORIES.filter(c => c.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group}>
            <div style={dividerStyle}>{groupLabels[group]}</div>
            {items.map(cat => (
              <DwellSliderRow
                key={cat.key}
                label={cat.label}
                description={cat.description}
                value={(dwellSettings as any)[cat.key] as number}
                defaultValue={(DEFAULT_DWELL_TIMES as any)[cat.key] as number}
                min={cat.min}
                max={cat.max}
                step={cat.step}
                onChange={v => updateSettings({ [cat.key]: v } as Partial<DwellTimeSettings>)}
                isDarkMode={isDarkMode}
              />
            ))}
          </div>
        );
      })}

      {/* Sync checkbox */}
      <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="checkbox"
          checked={dwellSettings.ringAnimationSync}
          onChange={e => updateSettings({ ringAnimationSync: e.target.checked })}
          style={{ accentColor: '#64B5F6' }}
        />
        <span style={{ fontSize: '13px', color: colors.text.secondary }}>
          Sync ring animation with dwell time
        </span>
      </div>
    </div>
  );
};

// ─── Single Dwell Slider Row ─────────────────────────────────
const DwellSliderRow: React.FC<{
  label: string;
  description: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  isDarkMode: boolean;
}> = ({ label, description, value, defaultValue, min, max, step, onChange, isDarkMode }) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const isModified = value !== defaultValue;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '42px', padding: '4px 0' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', color: isModified ? '#64B5F6' : '#8896AB', fontWeight: isModified ? 600 : 400 }}>
          {label}
        </div>
        <div style={{ fontSize: '11px', color: '#5A6577', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {description}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        style={{ flex: 1, accentColor: '#64B5F6', cursor: 'pointer' }}
      />
      <div style={{ width: '60px', textAlign: 'right', fontFamily: 'monospace', fontSize: '14px', color: '#E8EDF5' }}>
        {value}<span style={{ fontSize: '11px', color: '#5A6577' }}>ms</span>
      </div>
    </div>
  );
};

// ─── Gaze Filter Tuning Section ─────────────────────────────
const FILTER_PRESETS = [
  { key: 'stable', label: 'Stable', desc: 'Max stability (new users, tremor)' },
  { key: 'balanced', label: 'Balanced', desc: 'Default for most users' },
  { key: 'responsive', label: 'Responsive', desc: 'Fast response (experienced)' },
  { key: 'als_early', label: 'ALS Early', desc: 'Early stage ALS' },
  { key: 'als_late', label: 'ALS Late', desc: 'Late stage, max stability' },
] as const;

const GazeFilterTuningSection: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const ws = useWS();
  const { settings, updateSetting } = useCustomization();

  const [minCutoff, setMinCutoff] = useState(0.7);
  const [beta, setBeta] = useState(12);
  const [activePreset, setActivePreset] = useState(settings.filterPreset || 'balanced');

  const sectionStyle: React.CSSProperties = {
    background: 'rgba(15, 23, 42, 0.6)',
    borderRadius: '12px',
    border: '1px solid rgba(100, 116, 139, 0.15)',
    padding: '16px',
  };

  const handlePreset = useCallback((key: string) => {
    setActivePreset(key);
    updateSetting('filterPreset', key);
    ws.sendFilterParams({ preset: key });
  }, [ws, updateSetting]);

  const handleCustomParam = useCallback((param: string, value: number) => {
    if (param === 'min_cutoff') {
      setMinCutoff(value);
      ws.sendFilterParams({ min_cutoff: value });
    } else if (param === 'beta') {
      setBeta(value);
      ws.sendFilterParams({ beta: value });
    }
    setActivePreset('custom');
  }, [ws]);

  const handleReset = useCallback(() => {
    setMinCutoff(0.7);
    setBeta(12);
    handlePreset('balanced');
  }, [handlePreset]);

  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '16px', fontWeight: 700, color: colors.text.primary }}>
          Gaze Filter Tuning
        </span>
        <button
          onClick={handleReset}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            border: '1px solid #64B5F6',
            borderRadius: '6px',
            background: 'transparent',
            color: '#64B5F6',
            cursor: 'pointer',
          }}
        >
          Reset to Defaults
        </button>
      </div>

      {/* Presets */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {FILTER_PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => handlePreset(p.key)}
            title={p.desc}
            style={{
              flex: 1,
              minWidth: '60px',
              padding: '8px 6px',
              fontSize: '12px',
              fontWeight: activePreset === p.key ? 700 : 500,
              border: `1px solid ${activePreset === p.key ? '#2DD4BF' : 'rgba(100, 116, 139, 0.2)'}`,
              borderRadius: '8px',
              background: activePreset === p.key ? 'rgba(45, 212, 191, 0.1)' : 'rgba(100, 116, 139, 0.06)',
              color: activePreset === p.key ? '#2DD4BF' : colors.text.secondary,
              cursor: 'pointer',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom sliders */}
      <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#5A6577', borderBottom: '1px solid rgba(100, 116, 139, 0.1)', paddingBottom: '6px', marginBottom: '8px' }}>
        CUSTOM PARAMETERS
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '42px', padding: '4px 0' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', color: '#8896AB' }}>Smoothing (min_cutoff)</div>
          <div style={{ fontSize: '11px', color: '#5A6577' }}>Lower = smoother, higher = responsive</div>
        </div>
        <input
          type="range" min="0.2" max="2.0" step="0.1" value={minCutoff}
          onChange={e => handleCustomParam('min_cutoff', parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: '#64B5F6', cursor: 'pointer' }}
        />
        <div style={{ width: '50px', textAlign: 'right', fontFamily: 'monospace', fontSize: '14px', color: '#E8EDF5' }}>
          {minCutoff.toFixed(1)}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '42px', padding: '4px 0' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', color: '#8896AB' }}>Speed Response (beta)</div>
          <div style={{ fontSize: '11px', color: '#5A6577' }}>Higher = faster saccade response</div>
        </div>
        <input
          type="range" min="2" max="30" step="1" value={beta}
          onChange={e => handleCustomParam('beta', parseInt(e.target.value))}
          style={{ flex: 1, accentColor: '#64B5F6', cursor: 'pointer' }}
        />
        <div style={{ width: '50px', textAlign: 'right', fontFamily: 'monospace', fontSize: '14px', color: '#E8EDF5' }}>
          {beta}
        </div>
      </div>
    </div>
  );
};

interface AppSettingsPanelProps {
  isDarkMode: boolean;
}

const AppSettingsPanel: React.FC<AppSettingsPanelProps> = ({ isDarkMode }) => {
  const colors = isDarkMode ? darkColors : lightColors;
  const { settings, updateSetting } = useCustomization();
  const { theme, setTheme } = useTheme();

  const sectionHeading: React.CSSProperties = {
    fontSize: typography.fontSize.lg,
    color: colors.text.secondary,
    marginBottom: spacing[3],
    fontWeight: typography.fontWeight.semibold,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[5] }}>
      <div style={{
        fontSize: typography.fontSize.xl,
        color: colors.text.primary,
        fontWeight: typography.fontWeight.bold,
      }}>
        App Settings
      </div>

      {/* User Profile */}
      <section>
        <h3 style={sectionHeading}>User Profile</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[3] }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: '12px',
            border: `1px solid ${colors.border.main}`,
          }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: colors.text.primary }}>
                Display Name
              </div>
              <div style={{ fontSize: '12px', color: colors.text.secondary, marginTop: '2px' }}>
                Shown on the welcome screen when app starts
              </div>
            </div>
            <input
              type="text"
              value={settings.userName ?? ''}
              onChange={e => updateSetting('userName', e.target.value)}
              placeholder="Papa"
              style={{
                width: '180px',
                padding: '10px 14px',
                fontSize: '15px',
                fontWeight: 600,
                borderRadius: '8px',
                border: `1px solid ${colors.border.main}`,
                background: 'rgba(255,255,255,0.06)',
                color: colors.text.primary,
                outline: 'none',
                textAlign: 'center',
              }}
            />
          </div>
        </div>
      </section>

      {/* Appearance */}
      <section>
        <h3 style={sectionHeading}>Appearance</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[3] }}>

          {/* Theme toggle */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: '12px',
            border: `1px solid ${colors.border.main}`,
          }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: colors.text.primary }}>
                Theme
              </div>
              <div style={{ fontSize: '12px', color: colors.text.secondary, marginTop: '2px' }}>
                {theme === 'light'
                  ? `Light mode${settings.showHindi ? ' \u00B7 \u0932\u093E\u0907\u091F \u092E\u094B\u0921' : ''}`
                  : theme === 'mix'
                    ? `Mix mode${settings.showHindi ? ' \u00B7 \u092E\u093F\u0915\u094D\u0938 \u092E\u094B\u0921' : ''}`
                    : theme === 'warm'
                      ? `Warm mode${settings.showHindi ? ' \u00B7 \u0917\u0930\u094D\u092E \u092E\u094B\u0921' : ''}`
                      : `Dark mode${settings.showHindi ? ' \u00B7 \u0921\u093E\u0930\u094D\u0915 \u092E\u094B\u0921' : ''}`}
              </div>
            </div>

            {(() => {
              // Theme-aware pill colors. In warm + light modes the pill sits on cream
              // paper, so the unselected button text must be a dark warm color (not white).
              const isPaper = theme === 'warm' || theme === 'light';
              const pillTrackBg = isPaper ? 'rgba(122, 99, 71, 0.07)' : 'rgba(255,255,255,0.06)';
              const idleText = isPaper ? 'rgba(47, 42, 38, 0.55)' : 'rgba(255,255,255,0.40)';
              return (
            <div className="theme-toggle-pill" style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              background: pillTrackBg,
              borderRadius: 100,
              padding: '6px',
              border: `1px solid ${colors.border.main}`,
            }}>
              <button
                onClick={() => { setTheme('dark'); updateSetting('isDarkMode', true); }}
                style={{
                  borderRadius: 100,
                  padding: '10px 20px',
                  minWidth: 86,
                  minHeight: 44,
                  background: theme === 'dark'
                    ? 'rgba(255,255,255,0.18)'
                    : 'transparent',
                  border: 'none',
                  color: theme === 'dark' ? '#fff' : idleText,
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8,
                  transition: 'background 200ms, color 200ms',
                }}
              >
                Dark
              </button>

              <button
                onClick={() => { setTheme('mix'); updateSetting('isDarkMode', true); }}
                style={{
                  borderRadius: 100,
                  padding: '10px 20px',
                  minWidth: 86,
                  minHeight: 44,
                  background: theme === 'mix'
                    ? 'rgba(138, 74, 61, 0.38)'
                    : 'transparent',
                  border: 'none',
                  color: theme === 'mix' ? '#F5EAD3' : idleText,
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8,
                  transition: 'background 200ms, color 200ms',
                }}
              >
                Mix
              </button>

              <button
                onClick={() => { setTheme('warm'); updateSetting('isDarkMode', false); }}
                style={{
                  borderRadius: 100,
                  padding: '10px 20px',
                  minWidth: 86,
                  minHeight: 44,
                  background: theme === 'warm'
                    ? 'linear-gradient(135deg, #C9A96B, #D39C5C)'
                    : 'transparent',
                  border: 'none',
                  color: theme === 'warm' ? '#2F2A26' : idleText,
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8,
                  transition: 'background 200ms, color 200ms',
                }}
              >
                Warm
              </button>

              <button
                onClick={() => { setTheme('light'); updateSetting('isDarkMode', false); }}
                style={{
                  borderRadius: 100,
                  padding: '10px 20px',
                  minWidth: 86,
                  minHeight: 44,
                  background: theme === 'light'
                    ? 'linear-gradient(135deg, #C19A4D, #3F6864)'  // gold→teal — matches new identity
                    : 'transparent',
                  border: 'none',
                  color: theme === 'light' ? '#fff' : idleText,
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8,
                  transition: 'background 200ms, color 200ms',
                }}
              >
                Light
              </button>
            </div>
              );
            })()}
          </div>

          <ToggleSetting
            label="Show Hindi"
            description="Display Hindi translations"
            value={settings.showHindi}
            onChange={v => updateSetting('showHindi', v)}
            isDarkMode={isDarkMode}
          />
        </div>
      </section>

      {/* Gaze Control */}
      <section>
        <h3 style={sectionHeading}>Gaze Control</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[3] }}>
          <SelectSetting
            label="Gaze on Screen Change"
            description="What happens to eye-gaze when you navigate to a new screen"
            value={settings.gazeOnNavigate || 'smart-pause'}
            options={[
              { value: 'smart-pause', label: 'Smart Pause (recommended)' },
              { value: 'full-pause', label: 'Full Pause' },
              { value: 'always-active', label: 'Always Active' },
            ]}
            onChange={v => updateSetting('gazeOnNavigate', v as 'smart-pause' | 'full-pause' | 'always-active')}
            isDarkMode={isDarkMode}
          />
          <DwellTimeSection isDarkMode={isDarkMode} />
          <SelectSetting
            label="Gaze Cursor Size"
            description="Size of the eye-tracking cursor"
            value={settings.gazeCursorSize}
            options={[
              { value: 'small', label: 'Small' },
              { value: 'medium', label: 'Medium' },
              { value: 'large', label: 'Large' },
            ]}
            onChange={v => updateSetting('gazeCursorSize', v)}
            isDarkMode={isDarkMode}
          />
          <GazeFilterTuningSection isDarkMode={isDarkMode} />
          <SliderSetting
            label="Gaze Offset X"
            description="Manual horizontal correction for systematic drift (negative = move cursor left)"
            value={settings.gazeOffsetX ?? 0}
            min={-100}
            max={100}
            step={5}
            unit=" px"
            onChange={v => updateSetting('gazeOffsetX', v)}
            isDarkMode={isDarkMode}
          />
          <SliderSetting
            label="Gaze Offset Y"
            description="Manual vertical correction for systematic drift (negative = move cursor up)"
            value={settings.gazeOffsetY ?? 0}
            min={-100}
            max={100}
            step={5}
            unit=" px"
            onChange={v => updateSetting('gazeOffsetY', v)}
            isDarkMode={isDarkMode}
          />
        </div>
      </section>

      {/* Voice */}
      <section>
        <h3 style={sectionHeading}>Voice Settings</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[3] }}>
          <SelectSetting
            label="Language for TTS"
            description="Language used for text-to-speech output"
            value={settings.ttsLanguage}
            options={[
              { value: 'english', label: 'English' },
              { value: 'hindi', label: 'Hindi' },
              { value: 'auto', label: 'Auto-detect' },
            ]}
            onChange={v => updateSetting('ttsLanguage', v)}
            isDarkMode={isDarkMode}
          />
          <SliderSetting
            label="Speech Rate"
            description="How fast the voice speaks"
            value={settings.ttsRate}
            min={80}
            max={250}
            step={10}
            unit=" WPM"
            onChange={v => updateSetting('ttsRate', v)}
            isDarkMode={isDarkMode}
          />
          <SliderSetting
            label="Volume"
            description="Voice volume level (0 = muted)"
            value={Math.round(settings.ttsVolume * 100)}
            min={0}
            max={100}
            step={5}
            unit="%"
            onChange={v => updateSetting('ttsVolume', v / 100)}
            isDarkMode={isDarkMode}
          />
          <ToggleSetting
            label="Sound Effects"
            description="Enable/disable button click sounds"
            value={settings.soundEffects}
            onChange={v => updateSetting('soundEffects', v)}
            isDarkMode={isDarkMode}
          />
        </div>
      </section>

      {/* Wellness */}
      <section>
        <h3 style={sectionHeading}>Wellness</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[3] }}>
          <SliderSetting
            label="Break Reminder Interval"
            description="How often to remind you to rest your eyes"
            value={settings.breakReminderInterval}
            min={10}
            max={60}
            step={5}
            unit=" min"
            onChange={v => updateSetting('breakReminderInterval', v)}
            isDarkMode={isDarkMode}
          />
        </div>
      </section>

      {/* About */}
      <section>
        <h3 style={sectionHeading}>About</h3>
        <div style={{
          padding: spacing[4],
          backgroundColor: colors.background.secondary,
          borderRadius: '12px',
          border: `1px solid ${colors.border.main}`,
        }}>
          <h4 style={{
            fontSize: typography.fontSize.lg,
            color: colors.text.primary,
            marginBottom: spacing[2],
          }}>
            GazeConnect Pro v2.0
          </h4>
          <p style={{ color: colors.text.secondary, marginBottom: spacing[2] }}>
            Medical-grade eye-gaze AAC application for ALS patients.
          </p>
          <p style={{ color: colors.text.tertiary, fontSize: typography.fontSize.sm }}>
            Built with research-backed algorithms for optimal comfort and communication speed.
          </p>
        </div>
      </section>
    </div>
  );
};

export default AppSettingsPanel;
