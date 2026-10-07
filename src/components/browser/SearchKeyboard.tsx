/**
 * Search keyboard for the web screens (6 Oct 2026, maintainer request): type the
 * name of a song, singer, video or anything else, then search YouTube or Google
 * and return to the page. It uses the main keyboard's own keys, layouts,
 * colours and typing time (KeyboardKeys.tsx). The top row shows what is typed
 * and, beside it on the right, three search suggestions (7 Oct 2026,
 * searchSuggestions.ts): a search is short, so the right of that row is free,
 * and the suggestions sit where the eyes check the typing (8 Oct 2026,
 * maintainer request). The last row is two large buttons, Back and Search.
 * Choosing a suggestion searches it at once; every search is remembered for
 * later suggestions unless that is switched off (Settings > Web Search).
 *
 * The web page is a native layer above the whole interface, so the screen that
 * shows this keyboard takes the page off the window first (useGazeBrowser
 * setPageVisible) and puts it back on Back or Search.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import GazeButton from '../core/GazeButton';
import { useGazeControl } from '../core/GazeControlToggle';
import { useRealGaze } from '../../contexts/RealGazeContext';
import { useCustomization } from '../../contexts/CustomizationContext';
import { DWELL_GROUPS, normalizeKeyboardFeel } from '../../config/dwellTimeConfig';
import { KeyBtn, QWERTY_ROWS, SYMBOL_ROWS, type KeyConfig } from '../keyboard/KeyboardKeys';
import { SEARCH_QUERY_MAX, applySearchKey } from './searchText';
import { suggestSearches, suggestionParts, type SearchSuggestion, type SuggestionSlots } from './searchSuggestions';
import { HistoryIcon, SparkleIcon, StarIcon } from '../icons/WebIcons';
import '../../styles/keyboard-layout.css';
import '../../styles/search-keyboard.css';

export type SearchTarget = 'youtube' | 'google';
export { SEARCH_QUERY_MAX, applySearchKey } from './searchText';

// The main keyboard's command row without Speak (nothing is spoken here).
const SEARCH_ACTION_ROW: KeyConfig[] = [
  { key: 'deleteWord', display: '⌫ WORD', action: 'deleteWord', flex: 1.6 },
  { key: 'space', display: 'SPACE', action: 'space', flex: 5 },
  { key: '123', display: '123', action: 'toggleNumbers', flex: 1.8 },
];

type SearchKeyboardProps = {
  target: SearchTarget;
  isDarkMode: boolean;
  initialText?: string;
  /** Defaults to "Back to YouTube" / "Back to Google". */
  backLabel?: string;
  onSearch: (query: string) => void;
  onBack: () => void;
};

const BackIcon = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);
const SearchIcon = ({ size = 34 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

const SOURCE_ICON: Record<SearchSuggestion['source'], React.ReactNode> = {
  personal: <StarIcon size={26} strokeWidth={2.2} />,
  history: <HistoryIcon size={26} strokeWidth={2.2} />,
  popular: <SparkleIcon size={26} strokeWidth={2} />,
};
const SOURCE_NAME: Record<SearchSuggestion['source'], string> = {
  personal: 'from your list', history: 'searched before', popular: 'popular',
};

const SearchKeyboard: React.FC<SearchKeyboardProps> = ({ target, isDarkMode, initialText = '', backLabel, onSearch, onBack }) => {
  const [text, setText] = useState(() => initialText.slice(0, SEARCH_QUERY_MAX));
  const [isShift, setIsShift] = useState(false);
  const [numbers, setNumbers] = useState(false);
  const { isGazeEnabled, lastEnabledTimestamp, enableGaze } = useGazeControl();
  const { hasRealGaze } = useRealGaze();
  const { data: { settings, webSearch }, recordWebSearch } = useCustomization();
  const familiarFeel = normalizeKeyboardFeel(settings.keyboardFeel) === 'familiar';
  const siteName = target === 'youtube' ? 'YouTube' : 'Google';

  // Opening the keyboard is a deliberate choice: typing needs gaze on.
  useEffect(() => {
    if (!isGazeEnabled) enableGaze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKey = useCallback((key: string, action?: string) => {
    if (action === 'shift') { setIsShift((value) => !value); return; }
    if (action === 'toggleNumbers') { setNumbers((value) => !value); return; }
    setText((current) => applySearchKey(current, key, action, isShift));
    if (isShift && (!action || action === 'letter')) setIsShift(false);
  }, [isShift]);

  const query = text.trim();
  const rows = numbers ? [...SYMBOL_ROWS, SEARCH_ACTION_ROW] : [...QWERTY_ROWS.slice(0, 3), SEARCH_ACTION_ROW];

  // Three places beside what is typed; a suggestion still offered after the next key
  // keeps its place (suggestSearches), so nothing moves under the eyes.
  const shownSlots = useRef<SuggestionSlots>([]);
  const slots = useMemo(() => suggestSearches(text, target, webSearch, shownSlots.current), [text, target, webSearch]);
  useEffect(() => { shownSlots.current = slots; }, [slots]);

  const search = useCallback((words: string) => {
    const chosen = words.trim();
    if (!chosen) return;
    recordWebSearch(target, chosen);
    onSearch(chosen);
  }, [onSearch, recordWebSearch, target]);

  // What is typed keeps its end in sight, where the next letter goes; the start of a long
  // search slides out on the left, faded, whatever the width of the screen.
  const textRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    const over = el.scrollWidth > el.clientWidth + 1;
    setOverflowing((previous) => (previous === over ? previous : over));
  }, [text]);

  return (
    <div className="search-keyboard keyboard-screen" data-keyboard-feel={familiarFeel ? 'familiar' : 'standard'}
      data-search-target={target} role="dialog" aria-label={`Search ${siteName}`}>
      <div className="search-keyboard-top">
        <div className="search-keyboard-display" aria-live="polite">
          <div className="search-keyboard-label">
            <SearchIcon size={26} />
            <span>Search {siteName}</span>
          </div>
          <div ref={textRef} className={`search-keyboard-text${overflowing ? ' is-overflowing' : ''}`}>
            {text ? <span className="search-keyboard-typed">{text}</span> : (
              <span className="search-keyboard-placeholder">
                {target === 'youtube' ? 'Type a song, singer or video name' : 'Type what you want to find'}
              </span>
            )}
            <span className="search-keyboard-caret" aria-hidden="true" />
          </div>
        </div>
        <div className="search-keyboard-suggestions" role="group" aria-label="Suggested searches">
          {slots.map((suggestion, index) => (suggestion ? (
            <GazeButton key={`suggestion-${index}`} id={`search-kb-suggestion-${index}`}
              className={`search-keyboard-command search-keyboard-suggestion source-${suggestion.source}`}
              onClick={() => search(suggestion.text)} ariaLabel={`Search ${siteName} for ${suggestion.text}, ${SOURCE_NAME[suggestion.source]}`}
              gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
              dwellCategory="navigationButton" style={{ width: '100%', height: '100%' }}>
              <span className="search-keyboard-suggestion-icon">{SOURCE_ICON[suggestion.source]}</span>
              <span className="search-keyboard-suggestion-text">
                {suggestionParts(suggestion.text, text).map((part, i) => (part.strong
                  ? <strong key={i}>{part.text}</strong> : <React.Fragment key={i}>{part.text}</React.Fragment>))}
              </span>
            </GazeButton>
          ) : <div key={`suggestion-${index}`} className="search-keyboard-suggestion-empty" aria-hidden="true" />))}
        </div>
      </div>
      <div className="search-keyboard-keys">
        {rows.map((row, rowIndex) => (
          <div key={`row-${numbers ? 'n' : 'a'}-${rowIndex}`}
            className={`search-keyboard-row${rowIndex === rows.length - 1 ? ' search-keyboard-action-row' : ''}`}>
            {row.map((config) => (
              <KeyBtn key={config.key} config={config} onPress={handleKey}
                isShift={isShift} isDarkMode={isDarkMode}
                dwellMs={config.action === 'deleteWord' ? DWELL_GROUPS.deliberate.ms : DWELL_GROUPS.typing.ms}
                gazeEnabled={isGazeEnabled} lastEnabledTs={lastEnabledTimestamp}
                hasRealGaze={hasRealGaze} familiarFeel={familiarFeel} />
            ))}
          </div>
        ))}
      </div>
      <div className="search-keyboard-commands">
        <GazeButton id="search-kb-back" onClick={onBack} className="search-keyboard-command"
          gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
          dwellCategory="backSkipButton" style={{ width: '100%', height: '100%' }}>
          <BackIcon />
          <span>{backLabel || `Back to ${siteName}`}</span>
        </GazeButton>
        <GazeButton id="search-kb-go" onClick={() => search(query)} disabled={!query}
          className="search-keyboard-command search-keyboard-go"
          gazeEnabled={isGazeEnabled} gazeEnabledTimestamp={lastEnabledTimestamp} isDarkMode
          dwellCategory="navigationButton" style={{ width: '100%', height: '100%' }}>
          <SearchIcon />
          <span>Search {siteName}</span>
        </GazeButton>
      </div>
    </div>
  );
};

export default SearchKeyboard;
