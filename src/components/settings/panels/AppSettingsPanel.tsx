import React from 'react';
import { GAZE_FILTER_MODES, normalizeFilterPreset } from '../../../config/gazeFilterConfig';
import { darkColors, lightColors, typography, spacing } from '../../../utils/design';
import ToggleSetting from '../shared/ToggleSetting';
import SliderSetting from '../shared/SliderSetting';
import SelectSetting from '../shared/SelectSetting';
import { useCustomization } from '../../../contexts/CustomizationContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { DWELL_GROUPS } from '../../../config/dwellTimeConfig';

// Five fixed groups; no independent per-screen tuning or hidden multipliers.
const DwellTimeSection: React.FC = () => (
  <div className="settings-section dwell-guide">
    <h3>Dwell Timings</h3>
    <p>Five fixed selection times, automatically matched to each action.</p>
    <div className="dwell-guide-grid">
      {Object.entries(DWELL_GROUPS).map(([key, group]) => (
        <div key={key} className="dwell-guide-card">
          <strong>{group.ms}<span> ms</span></strong>
          <h4>{group.label}</h4>
          <p>{group.description}</p>
        </div>
      ))}
    </div>
  </div>
);

// Preserve saved smoothing profiles, including legacy choices. No raw filter
// coefficients or duplicate stage controls in the everyday settings panel.
const GazeFilterTuningSection: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const { settings, updateSetting } = useCustomization();
  return <SelectSetting label="Gaze Smoothing" description="Balance cursor steadiness and movement speed"
    value={normalizeFilterPreset(settings.filterPreset)}
    options={[...GAZE_FILTER_MODES]}
    onChange={value => updateSetting('filterPreset', value)}
    isDarkMode={isDarkMode} />;
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
                {theme === 'warm'
                  ? 'Warm mode'
                  : 'Dark mode'}
              </div>
            </div>

            <div className="theme-toggle-pill" role="group" aria-label="Theme">
              {(['warm', 'dark'] as const).map(appearance => (
                <button key={appearance} aria-pressed={theme === appearance}
                  onClick={() => setTheme(appearance)}>
                  <span className={`theme-swatch theme-swatch-${appearance}`} aria-hidden="true" />
                  {appearance === 'warm' ? 'Warm' : 'Dark'}
                </button>
              ))}
            </div>
          </div>


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
          <DwellTimeSection />
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
            GazeConnect Pro
          </h4>
          <p style={{ color: colors.text.secondary, marginBottom: spacing[2] }}>
            Eye-gaze communication and everyday activities for Windows.
          </p>
          <p style={{ color: colors.text.tertiary, fontSize: typography.fontSize.sm }}>
            Choose a comfortable gaze response and use the five fixed selection times.
          </p>
        </div>
      </section>
    </div>
  );
};

export default AppSettingsPanel;
