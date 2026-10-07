/**
 * WebSearchPanel - the search suggestions on the YouTube and Google search keyboards
 * (7 Oct 2026, maintainer request). Each site has its own list of up to 25 searches;
 * the popular searches can be added to it or left out of the suggestions; remembered
 * searches can be switched off or cleared. Every change is saved at once.
 * Standard HTML/CSS form elements (no GazeButton): Settings is for the caregiver.
 */

import React, { useState } from 'react';
import { darkColors, lightColors, typography, spacing } from '../../../utils/design';
import { useDarkPalette } from '../../../contexts/ThemeContext';
import { useCustomization } from '../../../contexts/CustomizationContext';
import ToggleSetting from '../shared/ToggleSetting';
import { MAX_PERSONAL_SEARCHES, POPULAR_SEARCHES, type WebSearchTarget } from '../../../config/searchSuggestions';
import {
  addPersonalSearch, clearSearchHistory, movePersonalSearch, removePersonalSearch, type AddSearchError,
} from '../../browser/searchSuggestions';
import { SEARCH_QUERY_MAX } from '../../browser/searchText';

interface WebSearchPanelProps {
  isDarkMode: boolean;
}

const SITES: Array<{ id: WebSearchTarget; name: string; example: string }> = [
  { id: 'youtube', name: 'YouTube', example: 'for example Mukesh songs' },
  { id: 'google', name: 'Google', example: 'for example Weather in Pune' },
];

const ADD_ERRORS: Record<AddSearchError, string> = {
  empty: 'Type a search first.',
  duplicate: 'That search is already in the list.',
  full: `The list is full (${MAX_PERSONAL_SEARCHES}). Remove one first.`,
};

const scopedCSS = (c: typeof darkColors) => `
  .ws-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
  .ws-tab {
    padding: 9px 18px; border-radius: 999px; border: 1px solid ${c.border.main};
    background: ${c.background.secondary}; color: ${c.text.primary}; font: inherit; font-size: 15px;
    font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 10px;
  }
  .ws-tab[aria-selected='true'] { border-color: ${c.accent.main}; background: ${c.accent.main}22; }
  .ws-count { font-size: 12px; font-weight: 700; color: ${c.text.tertiary}; }
  .ws-card {
    border: 1px solid ${c.border.main}; border-radius: 12px; padding: 14px 16px;
    background: ${c.background.secondary}; display: flex; flex-direction: column; gap: 10px;
  }
  .ws-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .ws-card-head h3 { margin: 0; font-size: 16px; color: ${c.text.primary}; }
  .ws-note { margin: 0; font-size: 13px; line-height: 1.5; color: ${c.text.secondary}; }
  .ws-list, .ws-popular { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .ws-row {
    display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 12px; border-radius: 8px;
    background: ${c.background.primary}; border: 1px solid ${c.border.main};
  }
  .ws-row-number { width: 22px; flex: 0 0 auto; font-size: 12px; font-weight: 700; color: ${c.text.tertiary}; }
  .ws-row-text { flex: 1 1 auto; min-width: 0; font-size: 14px; color: ${c.text.primary}; overflow-wrap: anywhere; }
  .ws-icon-btn {
    width: 32px; height: 32px; flex: 0 0 auto; border-radius: 6px; border: 1px solid transparent;
    background: transparent; color: ${c.text.secondary}; cursor: pointer; font: inherit; font-size: 16px;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .ws-icon-btn:hover:not(:disabled) { background: ${c.background.tertiary}; border-color: ${c.border.main}; }
  .ws-icon-btn:disabled { opacity: 0.3; cursor: default; }
  .ws-remove:hover:not(:disabled) { background: ${c.emergency.subtle}; color: ${c.emergency.main}; }
  .ws-add { display: flex; gap: 8px; }
  .ws-input {
    flex: 1 1 auto; min-width: 0; padding: 8px 12px; background: ${c.background.tertiary};
    border: 1px solid ${c.border.main}; border-radius: 8px; color: ${c.text.primary}; font: inherit; font-size: 14px; outline: none;
  }
  .ws-input:focus { border-color: ${c.accent.main}; box-shadow: 0 0 0 2px ${c.accent.main}33; }
  .ws-input::placeholder { color: ${c.text.tertiary}; }
  .ws-btn {
    padding: 7px 14px; border-radius: 8px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
    border: 1px solid ${c.border.main}; background: ${c.background.secondary}; color: ${c.text.primary}; white-space: nowrap;
  }
  .ws-btn:hover:not(:disabled) { background: ${c.background.tertiary}; }
  .ws-btn:disabled { opacity: 0.45; cursor: default; }
  .ws-btn-primary { background: ${c.accent.main}; border-color: ${c.accent.main}; color: #fff; }
  .ws-btn-primary:hover:not(:disabled) { background: ${c.accent.hover}; }
  .ws-btn-danger { background: ${c.emergency.main}; border-color: ${c.emergency.main}; color: #fff; }
  .ws-message { margin: 0; font-size: 13px; color: ${c.accentText.gold}; }
  .ws-confirm { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 14px; color: ${c.text.primary}; }
`;

const WebSearchPanel: React.FC<WebSearchPanelProps> = ({ isDarkMode }) => {
  const darkPalette = useDarkPalette();
  const colors = isDarkMode ? darkPalette : lightColors;
  const { data: { webSearch }, updateWebSearch } = useCustomization();
  const [site, setSite] = useState<WebSearchTarget>('youtube');
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const current = SITES.find(s => s.id === site) || SITES[0];
  const list = webSearch.personal[site];
  const full = list.length >= MAX_PERSONAL_SEARCHES;
  const remembered = { youtube: webSearch.history.youtube.length, google: webSearch.history.google.length };
  const rememberedTotal = remembered.youtube + remembered.google;

  const add = (text: string): boolean => {
    const result = addPersonalSearch(webSearch, site, text);
    if (result.error) { setMessage(ADD_ERRORS[result.error]); return false; }
    updateWebSearch(result.data);
    setMessage(`Added to the ${current.name} list.`);
    return true;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[4] }}>
      <style>{scopedCSS(colors)}</style>

      <div>
        <div className="settings-panel-title" style={{ fontSize: typography.fontSize.xl, color: colors.text.primary, fontWeight: typography.fontWeight.bold }}>
          Web Search
        </div>
        <div style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary, marginTop: 4, lineHeight: 1.5 }}>
          While Papa types on the YouTube or Google search keyboard, up to three suggestions appear beside what he types:
          first from these lists, then his earlier searches, then popular searches. Choosing one searches it at once.
          Changes are saved straight away.
        </div>
      </div>

      <div role="tablist" aria-label="Site" className="ws-tabs">
        {SITES.map(s => (
          <button key={s.id} id={`websearch-tab-${s.id}`} type="button" role="tab" aria-selected={site === s.id} className="ws-tab"
            onClick={() => { setSite(s.id); setDraft(''); setMessage(null); }}>
            {s.name} searches
            <span className="ws-count">{webSearch.personal[s.id].length} / {MAX_PERSONAL_SEARCHES}</span>
          </button>
        ))}
      </div>

      <section className="ws-card" aria-labelledby="websearch-list-title">
        <div className="ws-card-head">
          <h3 id="websearch-list-title">Papa&rsquo;s {current.name} searches</h3>
          <span className="ws-count">{list.length} / {MAX_PERSONAL_SEARCHES}</span>
        </div>
        {list.length === 0 && (
          <p className="ws-note">No searches yet. Add the songs, singers or topics Papa looks for most; the first ones are suggested first.</p>
        )}
        {list.length > 0 && (
          <ol className="ws-list">
            {list.map((item, index) => (
              <li key={item} className="ws-row">
                <span className="ws-row-number">{index + 1}</span>
                <span className="ws-row-text">{item}</span>
                <button type="button" className="ws-icon-btn" aria-label={`Move ${item} up`} disabled={index === 0}
                  onClick={() => updateWebSearch(movePersonalSearch(webSearch, site, index, -1))}>&uarr;</button>
                <button type="button" className="ws-icon-btn" aria-label={`Move ${item} down`} disabled={index === list.length - 1}
                  onClick={() => updateWebSearch(movePersonalSearch(webSearch, site, index, 1))}>&darr;</button>
                <button type="button" className="ws-icon-btn ws-remove" aria-label={`Remove ${item}`}
                  onClick={() => { updateWebSearch(removePersonalSearch(webSearch, site, index)); setMessage(null); }}>&times;</button>
              </li>
            ))}
          </ol>
        )}
        <form className="ws-add" onSubmit={event => { event.preventDefault(); if (add(draft)) setDraft(''); }}>
          <input id="websearch-add-input" className="ws-input" value={draft} maxLength={SEARCH_QUERY_MAX}
            placeholder={full ? 'The list is full' : `Add a ${current.name} search, ${current.example}`}
            aria-label={`Add a ${current.name} search`} disabled={full}
            onChange={event => { setDraft(event.target.value); setMessage(null); }} />
          <button id="websearch-add" type="submit" className="ws-btn ws-btn-primary" disabled={full || !draft.trim()}>Add</button>
        </form>
        {message && <p className="ws-message" role="status">{message}</p>}
      </section>

      <section className="ws-card" aria-labelledby="websearch-popular-title">
        <div className="ws-card-head">
          <h3 id="websearch-popular-title">Popular {current.name} searches</h3>
        </div>
        <ToggleSetting label="Also suggest popular searches" description="When on, these are suggested after Papa's own lists and earlier searches, for YouTube and Google."
          value={webSearch.showPopular} onChange={on => updateWebSearch({ ...webSearch, showPopular: on })} isDarkMode={isDarkMode} />
        <ul className="ws-popular">
          {POPULAR_SEARCHES[site].map(item => {
            const listed = list.some(entry => entry.toLowerCase() === item.toLowerCase());
            return (
              <li key={item} className="ws-row">
                <span className="ws-row-text">{item}</span>
                <button type="button" className="ws-btn" disabled={listed || full} onClick={() => add(item)}>
                  {listed ? 'In the list' : 'Add to list'}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="ws-card" aria-labelledby="websearch-history-title">
        <div className="ws-card-head">
          <h3 id="websearch-history-title">Earlier searches</h3>
        </div>
        <ToggleSetting label="Remember searches" description="Searches Papa makes are kept on this computer, so they can be suggested again. Nothing is sent anywhere."
          value={webSearch.rememberSearches} onChange={on => updateWebSearch({ ...webSearch, rememberSearches: on })} isDarkMode={isDarkMode} />
        <p className="ws-note">
          {rememberedTotal === 0
            ? 'No searches are remembered.'
            : `${rememberedTotal} remembered: ${remembered.youtube} on YouTube, ${remembered.google} on Google (the latest 50 of each).`}
        </p>
        {!confirmClear ? (
          <div>
            <button id="websearch-clear" type="button" className="ws-btn" disabled={rememberedTotal === 0} onClick={() => setConfirmClear(true)}>
              Clear search history
            </button>
          </div>
        ) : (
          <div className="ws-confirm" role="alert">
            <span>Forget all {rememberedTotal} remembered searches?</span>
            <button id="websearch-clear-confirm" type="button" className="ws-btn ws-btn-danger"
              onClick={() => { updateWebSearch(clearSearchHistory(webSearch)); setConfirmClear(false); }}>Clear</button>
            <button type="button" className="ws-btn" onClick={() => setConfirmClear(false)}>Cancel</button>
          </div>
        )}
      </section>
    </div>
  );
};

export default WebSearchPanel;
