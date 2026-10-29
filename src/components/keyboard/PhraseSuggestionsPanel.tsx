import React, { useState } from 'react';
import GazeButton from '../core/GazeButton';
import { acceptSentenceSuggestion, type SentenceSuggestion } from '../../utils/wordPredictionSlots';
import '../../styles/phrase-suggestions.css';
import { useGazeControl } from '../core/GazeControlToggle';

interface Props {
  draft: string;
  suggestions: SentenceSuggestion[];
  review?: SentenceSuggestion;
  gazeEnabled: boolean;
  gazeEnabledTimestamp: number;
  onAccept: (suggestion: SentenceSuggestion, reviewed: boolean) => void;
  onClose: () => void;
}

/** Explicitly opened chooser. Never overlays the message while somebody types. */
export default function PhraseSuggestionsPanel({ draft, suggestions, review, gazeEnabled, gazeEnabledTimestamp, onAccept, onClose }: Props) {
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState<SentenceSuggestion | undefined>(review);
  const { signalNavigation } = useGazeControl();
  const gaze = { gazeEnabled, gazeEnabledTimestamp };
  const eligible = suggestions.filter(s => acceptSentenceSuggestion(draft, s, true) !== null);
  const pages = Math.max(1, Math.ceil(eligible.length / 3));
  const visible = eligible.slice(page * 3, page * 3 + 3);
  const result = pending ? acceptSentenceSuggestion(draft, pending, true) : null;
  const changedSentence = pending ? result?.slice(pending.replacement_start ?? 0).trim() : '';
  return (
    <div className="phrase-panel" role="dialog" aria-modal="true" aria-labelledby="phrase-panel-title">
      <h2 id="phrase-panel-title">{pending ? 'Review phrase' : 'Suggested phrases'}</h2>
      {pending ? <>
        <div className="phrase-review-copy">
          <p>Replace “{draft.slice(pending.replacement_start ?? 0).trim()}” with:</p>
          <div className="phrase-review-result">{changedSentence}</div>
          {(pending.replacement_start ?? 0) > 0 && <p>Earlier sentences stay unchanged.</p>}
        </div>
        <div className="phrase-panel-navigation">
          <GazeButton id="phrase-review-use" {...gaze} dwellCategory="deliberateAction" disabled={!result}
            onClick={() => onAccept(pending, true)}>Use phrase</GazeButton>
          <GazeButton id="phrase-review-cancel" {...gaze} dwellCategory="navigationButton" onClick={onClose}>Keep typing</GazeButton>
        </div>
      </> : <>
        <div className="phrase-panel-choices">
          {visible.map((suggestion, index) => <GazeButton
            key={JSON.stringify([draft, suggestion.mode, suggestion.text, suggestion.result_text])}
            id={'phrase-panel-choice-' + index} {...gaze} dwellCategory="predictionButton"
            ariaLabel={(suggestion.requires_confirmation ? 'Review replacement: ' : 'Add phrase: ') + suggestion.text}
            onClick={() => { if (suggestion.requires_confirmation) { signalNavigation(); setPending(suggestion); } else onAccept(suggestion, false); }}>
            <span className="phrase-panel-choice-label">{suggestion.requires_confirmation ? 'Review replacement' : 'Add phrase'}</span>
            <span>{suggestion.text}</span>
          </GazeButton>)}
          {!visible.length && <p>No matching phrases. Keep typing to find a completion.</p>}
        </div>
        <div className="phrase-panel-navigation">
          <GazeButton id="phrase-panel-back" {...gaze} dwellCategory="navigationButton" onClick={onClose}>Back to typing</GazeButton>
          <GazeButton id="phrase-panel-previous" {...gaze} dwellCategory="navigationButton" disabled={page === 0} onClick={() => { signalNavigation(); setPage(p => p - 1); }}>Previous</GazeButton>
          <GazeButton id="phrase-panel-more" {...gaze} dwellCategory="navigationButton" disabled={page >= pages - 1} onClick={() => { signalNavigation(); setPage(p => p + 1); }}>More phrases</GazeButton>
        </div>
        <div className="phrase-panel-page" aria-live="polite">Page {page + 1} of {pages}</div>
      </>}
    </div>
  );
}
