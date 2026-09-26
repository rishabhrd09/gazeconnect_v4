import React from 'react';
import { GAZE_FILTER_MODES, normalizeFilterPreset } from '../../../config/gazeFilterConfig';
import { darkColors, lightColors, typography, spacing } from '../../../utils/design';
import ToggleSetting from '../shared/ToggleSetting';
import SliderSetting from '../shared/SliderSetting';
import SelectSetting from '../shared/SelectSetting';
import { useCustomization } from '../../../contexts/CustomizationContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { DWELL_TIMING_SETS, normalizeDwellTimingSet, normalizeKeyboardFeel, type DwellTimingSet } from '../../../config/dwellTimeConfig';
import { useDwellTime } from '../../../contexts/DwellTimeContext';

// Four complete timing sets; the displayed advice avoids promising an exact
// total selection time because gaze acquisition and onset precede the ring.
const DwellTimeSection: React.FC = () => {
  const { timingSet } = useDwellTime();
  const { settings } = useCustomization();
  const familiar = normalizeKeyboardFeel(settings.keyboardFeel) === 'familiar';
  return (
    <div className="settings-section dwell-guide">
      <h3>{DWELL_TIMING_SETS[timingSet].label.replace(' (default)', '')}</h3>
      <p>{DWELL_TIMING_SETS[timingSet].description}. {familiar
        ? 'Familiar keyboard sets its own pace for keys and suggestions; this speed still controls other choices.'
        : 'A short settling phase comes before the dwell ring fills, and a pause follows each selection.'}</p>
    </div>
  );
};

// Preserve saved smoothing profiles, including legacy choices. No raw filter
// coefficients or duplicate stage controls in the everyday settings panel.
const GazeFilterTuningSection: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const { settings, updateSetting } = useCustomization();
  return <SelectSetting label="Gaze Smoothing"
    description="Balanced and Responsive follow the eyes at once. Steady and Gentle wait a moment first, so a stray glance never moves the cursor."
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
          <SelectSetting
            label="Selection Speed"
            description="Choose a comfortable pace for general choices. Standard keyboard follows this speed; Familiar keyboard has its own key and suggestion pace."
            value={normalizeDwellTimingSet(settings.dwellTimingSet)}
            options={(Object.keys(DWELL_TIMING_SETS) as DwellTimingSet[]).map(key => ({
              value: key, label: DWELL_TIMING_SETS[key].label,
            }))}
            onChange={v => updateSetting('dwellTimingSet', normalizeDwellTimingSet(v))}
            isDarkMode={isDarkMode}
          />
          <SelectSetting
            label="Keyboard Feel"
            description="Standard follows Selection Speed. Familiar is inspired by the supplied eye-typing setup: a longer key settling phase and steady fill, with no change to gaze smoothing or other screens."
            value={normalizeKeyboardFeel(settings.keyboardFeel)}
            options={[
              { value: 'standard', label: 'Standard' },
              { value: 'familiar', label: 'Familiar keyboard' },
            ]}
            onChange={value => updateSetting('keyboardFeel', normalizeKeyboardFeel(value))}
            isDarkMode={isDarkMode}
          />
          <DwellTimeSection />
          <ToggleSetting
            label="Show Gaze Cursor"
            description="A ring at the centre of the key or card your eyes are on; it moves from item to item. When off, the highlight and dwell ring still show on the item being selected."
            value={settings.showGazeCursor !== false}
            onChange={v => updateSetting('showGazeCursor', v)}
            isDarkMode={isDarkMode}
          />
          <SelectSetting
            label="Gaze Cursor Size"
            description="Size of the gaze ring"
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
            Choose a comfortable gaze response and selection speed.
          </p>
        </div>
      </section>
    </div>
  );
};

export default AppSettingsPanel;
