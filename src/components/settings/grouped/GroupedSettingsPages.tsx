/**
 * Pages of the grouped Settings that are drawn here rather than by an existing panel: Eye Gaze,
 * Voice, Display, Backup & Restore, Reset, About & Help. Each change saves at once.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useCustomization } from '../../../contexts/CustomizationContext';
import { useTheme, type Theme } from '../../../contexts/ThemeContext';
import type { AppSettings } from '../../../types/customization';
import {
  DEFAULT_DWELL_TIMING_SET, DWELL_TIMING_SETS, FAMILIAR_KEYBOARD_TIMING, KEYBOARD_CADENCE_BY_STAGE,
  normalizeDwellTimingSet, normalizeKeyboardFeel, type DwellTimingSet, type KeyboardFeel,
} from '../../../config/dwellTimeConfig';
import { GAZE_FILTER_MODES, normalizeFilterPreset } from '../../../config/gazeFilterConfig';
import { useDwellTime } from '../../../contexts/DwellTimeContext';
import { gazeFlags } from '../../../utils/gazeFlags';
import { POST_NAVIGATION_COOLDOWN_MS } from '../../core/GazeControlToggle';
import { ICON } from './settingsPages';

// ============================================
// SHARED PIECES
// ============================================

export const LineIcon: React.FC<{ d: string; className?: string }> = ({ d, className }) => (
  <svg className={`gss-icon${className ? ` ${className}` : ''}`} viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
);

const Card: React.FC<{ title: string; note?: React.ReactNode; tag?: string; aside?: React.ReactNode; children?: React.ReactNode }> = ({
  title, note, tag, aside, children,
}) => (
  <section className="gss-card">
    <div className="gss-card-head">
      <div className="gss-card-titles">
        <h2>{title}{tag && <span className="gss-tag gss-tag-later">{tag}</span>}</h2>
        {note && <p>{note}</p>}
      </div>
      {aside}
    </div>
    {children}
  </section>
);

interface Option<T extends string> { value: T; label: string; sub?: string; tag?: string }

function RadioCards<T extends string>({ label, options, value, onChange }: {
  label: string; options: Option<T>[]; value: T; onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="gss-options">
      {options.map(option => {
        const checked = option.value === value;
        return (
          <button key={option.value} type="button" role="radio" aria-checked={checked} className="gss-option"
            onClick={() => { if (!checked) onChange(option.value); }}>
            <span className="gss-option-text">
              <span className="gss-option-label">{option.label}</span>
              {option.sub && <span className="gss-option-sub">{option.sub}</span>}
            </span>
            {option.tag && <span className="gss-tag">{option.tag}</span>}
            {checked && <LineIcon d={ICON.check} className="gss-option-check" />}
          </button>
        );
      })}
    </div>
  );
}

function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string; options: Option<T>[]; value: T; onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="gss-segmented">
      {options.map(option => (
        <button key={option.value} type="button" role="radio" aria-checked={option.value === value} className="gss-segment"
          onClick={() => { if (option.value !== value) onChange(option.value); }}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

const Switch: React.FC<{ label: string; on: boolean; onChange: (on: boolean) => void }> = ({ label, on, onChange }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} className="gss-switch" onClick={() => onChange(!on)}>
    <span className="gss-switch-track"><span className="gss-switch-knob" /></span>
    <span className="gss-switch-text">{on ? 'On' : 'Off'}</span>
  </button>
);

const RangeStepper: React.FC<{
  label: string; value: number; min: number; max: number; step: number;
  lessLabel: string; moreLabel: string; scale: string[]; onChange: (value: number) => void;
}> = ({ label, value, min, max, step, lessLabel, moreLabel, scale, onChange }) => {
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v / step) * step));
  const fill = `${((value - min) / (max - min)) * 100}%`;
  return (
    <div className="gss-range-block">
      <div className="gss-range">
        <button type="button" className="gss-step" aria-label={lessLabel} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>
          <LineIcon d={ICON.minus} />
        </button>
        <input type="range" aria-label={label} min={min} max={max} step={step} value={value}
          style={{ '--gss-fill': fill } as React.CSSProperties}
          onChange={event => { const next = clamp(Number(event.target.value)); if (next !== value) onChange(next); }} />
        <button type="button" className="gss-step" aria-label={moreLabel} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>
          <LineIcon d={ICON.plus} />
        </button>
      </div>
      <div className="gss-range-scale">{scale.map(mark => <span key={mark}>{mark}</span>)}</div>
    </div>
  );
};

/** Instant settings: every change is saved, then the page header says so. */
function useInstantSetting(onSaved: () => void) {
  const { settings, updateSetting } = useCustomization();
  const save = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => { updateSetting(key, value); onSaved(); };
  return { settings, save };
}

// ============================================
// EYE GAZE
// ============================================

const SPEED_OPTIONS: Option<DwellTimingSet>[] = (Object.keys(DWELL_TIMING_SETS) as DwellTimingSet[]).map(key => ({
  value: key,
  label: DWELL_TIMING_SETS[key].label.replace(' (default)', ''),
  sub: DWELL_TIMING_SETS[key].description,
  tag: key === DEFAULT_DWELL_TIMING_SET ? 'Default' : undefined,
}));
const KEYBOARD_FEEL_OPTIONS: Option<KeyboardFeel>[] = [
  { value: 'standard', label: 'Standard', sub: 'Keys and suggestions follow Selection speed.' },
  { value: 'familiar', label: 'Familiar keyboard', sub: 'A longer settling phase and steady fill, inspired by the supplied eye-typing setup.' },
];

const SCREEN_CHANGE_OPTIONS: Option<AppSettings['gazeOnNavigate']>[] = [
  {
    value: 'smart-pause', label: 'Smart pause', tag: 'Recommended',
    sub: `Gaze stays on; selections wait ${POST_NAVIGATION_COOLDOWN_MS / 1000} s, so a look at the old screen cannot choose on the new one.`,
  },
  { value: 'full-pause', label: 'Full pause', sub: 'Gaze turns off; Papa turns it back on with the gaze toggle.' },
  { value: 'always-active', label: 'Always active', sub: 'No pause at all.' },
];

const CURSOR_SIZES: Option<string>[] = [
  { value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' },
];

const SMOOTHING_OPTIONS: Option<string>[] = GAZE_FILTER_MODES.map(mode => ({ value: mode.value, label: mode.label.replace(' (default)', '') }));

/** Preview the active keyboard onset followed by its chosen Typing dwell. */
const TryTile: React.FC<{ ms: number; onsetMs: number }> = ({ ms, onsetMs }) => {
  const [state, setState] = useState<'idle' | 'settling' | 'looking' | 'selected'>('idle');
  const [progress, setProgress] = useState(0);
  const frame = useRef<number | null>(null);
  const stop = () => { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; };
  useEffect(() => stop, []);
  const enter = () => {
    stop();
    const start = performance.now();
    setState('settling');
    setProgress(0);
    const tick = (now: number) => {
      const elapsed = now - start;
      if (elapsed < onsetMs) {
        frame.current = requestAnimationFrame(tick);
        return;
      }
      setState('looking');
      const done = Math.min(1, (elapsed - onsetMs) / ms);
      setProgress(done);
      if (done >= 1) { setState('selected'); frame.current = null; return; }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };
  const leave = () => { stop(); setState('idle'); setProgress(0); };
  return (
    <div className={`gss-try gss-try-${state}`} onMouseEnter={enter} onMouseLeave={leave}>
      <span className="gss-try-label">{state === 'selected' ? 'Selected' : state === 'looking' ? 'Looking…' : state === 'settling' ? 'Settling…' : 'Look here'}</span>
      <span className="gss-try-track"><span className="gss-try-fill" style={{ width: `${Math.round(progress * 100)}%` }} /></span>
    </div>
  );
};

export const EyeGazePage: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
  const { settings, save } = useInstantSetting(onSaved);
  const { currentStage } = useDwellTime();
  const [moreOpen, setMoreOpen] = useState(false);
  const timingSet = normalizeDwellTimingSet(settings.dwellTimingSet);
  const keyboardFeel = normalizeKeyboardFeel(settings.keyboardFeel);
  // GazeCursor uses the stage-specific onset with keyboardCadence, or its
  // standard 250 ms onset if the rollback flag is off.
  const keyboardOnsetMs = keyboardFeel === 'familiar' ? FAMILIAR_KEYBOARD_TIMING.onset
    : gazeFlags.keyboardCadence ? KEYBOARD_CADENCE_BY_STAGE[currentStage].onset : 250;
  const keyboardFillMs = keyboardFeel === 'familiar' ? FAMILIAR_KEYBOARD_TIMING.key : DWELL_TIMING_SETS[timingSet].ms.typing;
  const cursorOn = settings.showGazeCursor !== false;

  return (
    <div className="gss-columns">
      <div className="gss-column">
        <Card title="Selection speed" note="Choose a pace for general choices. Standard keyboard follows this speed.">
          <RadioCards label="Selection speed" options={SPEED_OPTIONS} value={timingSet}
            onChange={value => save('dwellTimingSet', value)} />
        </Card>
        <Card title="Try this speed"
          note="Rest the pointer here as if it were a look. This previews the selected keyboard feel's settling and fill; tracking conditions can change the full selection time.">
          <TryTile ms={keyboardFillMs} onsetMs={keyboardOnsetMs} />
        </Card>
      </div>
      <div className="gss-column">
        <Card title="Keyboard feel" note="Familiar is based on the supplied eye-typing setup. It changes only keys and suggestions; gaze smoothing and other screens keep their settings.">
          <RadioCards label="Keyboard feel" options={KEYBOARD_FEEL_OPTIONS} value={keyboardFeel}
            onChange={value => save('keyboardFeel', value)} />
        </Card>
        <Card title="When a new screen opens" note="What gaze does right after a page changes.">
          <RadioCards label="When a new screen opens" options={SCREEN_CHANGE_OPTIONS} value={settings.gazeOnNavigate || 'smart-pause'}
            onChange={value => save('gazeOnNavigate', value)} />
        </Card>
        <Card title="Show gaze cursor"
          note="A ring at the centre of the key or card the eyes are on. When it is off, the highlight and the dwell ring still show."
          aside={<Switch label="Show gaze cursor" on={cursorOn} onChange={on => save('showGazeCursor', on)} />}>
          <div className="gss-row">
            <span className="gss-row-label">Cursor size</span>
            <Segmented label="Cursor size" options={CURSOR_SIZES} value={settings.gazeCursorSize || 'medium'}
              onChange={value => save('gazeCursorSize', value)} />
          </div>
        </Card>
        <section className="gss-card">
          <button type="button" className="gss-more" aria-expanded={moreOpen} onClick={() => setMoreOpen(open => !open)}>
            <LineIcon d={moreOpen ? ICON.chevronUp : ICON.chevronDown} />
            <span className="gss-more-title">More options</span>
            <span className="gss-more-sub">Gaze smoothing</span>
          </button>
          {moreOpen && (
            <div className="gss-more-body">
              <p>How much the cursor is steadied. Balanced and Responsive follow the eyes at once; Steady and Gentle wait a moment first, so a stray glance never moves the cursor. Change it only if the ring jitters or lags.</p>
              <Segmented label="Gaze smoothing" options={SMOOTHING_OPTIONS} value={normalizeFilterPreset(settings.filterPreset)}
                onChange={value => save('filterPreset', value)} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

// ============================================
// VOICE
// ============================================

export const VoicePage: React.FC<{ onSaved: () => void; onSpeak: (text: string) => void }> = ({ onSaved, onSpeak }) => {
  const { settings, save } = useInstantSetting(onSaved);
  const rate = Math.max(80, Math.min(250, Math.round(settings.ttsRate || 150)));
  const volume = Math.max(0, Math.min(100, Math.round((settings.ttsVolume ?? 1) * 100)));
  const rateNote = rate === 150 ? '150 is the normal pace.' : rate < 150 ? 'Slower than the normal 150.' : 'Faster than the normal 150.';
  const volumeNote = volume === 0 ? 'Muted: nothing is spoken, not even urgent messages.' : '0 mutes every spoken message, urgent ones too.';

  return (
    <div className="gss-columns">
      <Card title="Speech rate">
        <div className="gss-big-value"><span>{rate}</span><span className="gss-big-unit">words per minute</span></div>
        <p className="gss-note">{rateNote}</p>
        <RangeStepper label="Speech rate" value={rate} min={80} max={250} step={10} lessLabel="Slower" moreLabel="Faster"
          scale={['80 slow', '150 normal', '250 fast']} onChange={value => save('ttsRate', value)} />
        <button type="button" className="gss-button" onClick={() => onSpeak('This is how my messages will sound.')}>
          <LineIcon d={ICON.speaker} /><span>Test voice</span>
        </button>
      </Card>
      <Card title="Volume">
        <div className="gss-big-value"><span>{volume}</span><span className="gss-big-unit">percent</span></div>
        <p className="gss-note">{volumeNote}</p>
        <RangeStepper label="Volume" value={volume} min={0} max={100} step={5} lessLabel="Quieter" moreLabel="Louder"
          scale={['0 muted', '50', '100']} onChange={value => save('ttsVolume', value / 100)} />
      </Card>
    </div>
  );
};

// ============================================
// DISPLAY
// ============================================

const THEME_OPTIONS: Array<{ value: Theme; label: string; sub: string; swatches: string[] }> = [
  { value: 'warm', label: 'Warm', sub: 'Warm off-white surfaces, true black type, olive accents.', swatches: ['#fdf4ed', '#fcf2ea', '#5c6c3e', '#000000'] },
  { value: 'dark', label: 'Dark', sub: 'Deep green-grey surfaces, soft light type.', swatches: ['#171c19', '#212823', '#a5d0b9', '#f1f3ed'] },
];

export const DisplayPage: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
  const { theme, setTheme } = useTheme();
  return (
    <Card title="Theme" note="Only these two themes exist. Every screen follows this choice.">
      <div role="radiogroup" aria-label="Theme" className="gss-themes">
        {THEME_OPTIONS.map(option => {
          const checked = option.value === theme;
          return (
            <button key={option.value} type="button" role="radio" aria-checked={checked} className="gss-option gss-theme"
              onClick={() => { if (!checked) { setTheme(option.value); onSaved(); } }}>
              <span className="gss-swatches" aria-hidden="true">
                {option.swatches.map(colour => <span key={colour} style={{ background: colour }} />)}
              </span>
              <span className="gss-option-label">{option.label}</span>
              <span className="gss-option-sub">{option.sub}</span>
              {checked && <LineIcon d={ICON.check} className="gss-option-check" />}
            </button>
          );
        })}
      </div>
    </Card>
  );
};

// ============================================
// CARE & DATA
// ============================================

export const BackupPage: React.FC<{ onExport: () => void; onImport: () => void }> = ({ onExport, onImport }) => (
  <div className="gss-columns">
    <Card title="Export a backup" note="Saves every setting, phrase, card and person to one file.">
      <button type="button" className="gss-button gss-button-primary" onClick={onExport}>
        <LineIcon d={ICON.download} /><span>Export backup</span>
      </button>
    </Card>
    <Card title="Restore from a backup" note="Replaces everything here with the backup file. You are asked first.">
      <button type="button" className="gss-button" onClick={onImport}>
        <LineIcon d={ICON.upload} /><span>Import backup</span>
      </button>
    </Card>
  </div>
);

export const ResetPage: React.FC<{ onFactoryReset: () => void }> = ({ onFactoryReset }) => (
  <div className="gss-columns">
    <Card title="Reset one page"
      note="Pages have their own Reset this page button. It changes only that page, and asks first." />
    <Card title="Factory reset" note="Erases everything set up here and restores the factory defaults. Export a backup first.">
      <button type="button" className="gss-button gss-button-danger" onClick={onFactoryReset}>
        <LineIcon d={ICON.reset} /><span>Factory reset</span>
      </button>
    </Card>
  </div>
);

export const AboutPage: React.FC = () => {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const getVersion = (window as any).electronAPI?.app?.getVersion;
    if (typeof getVersion === 'function') {
      Promise.resolve(getVersion()).then((value: unknown) => { if (live && typeof value === 'string') setVersion(value); }).catch(() => {});
    }
    return () => { live = false; };
  }, []);
  const rows: Array<[string, string]> = [
    ['GazeConnect Pro', version ? `Version ${version}` : 'Eye-gaze communication and everyday activities for Windows.'],
    ['Eye tracker', 'Tobii Eye Tracker 5'],
    ['Who uses Settings', 'The caregiver, by mouse. The top bar keeps answering gaze, so Papa can always go Home or pause gaze.'],
    ['Saving', 'Eye Gaze, Voice and Display save each change at once. Pages with a Save button keep changes until it is pressed; opening another Settings page first asks what to do with them.'],
  ];
  return (
    <section className="gss-card gss-about">
      {rows.map(([key, value]) => (
        <div key={key} className="gss-about-row">
          <span className="gss-about-key">{key}</span>
          <span className="gss-about-value">{value}</span>
        </div>
      ))}
    </section>
  );
};
