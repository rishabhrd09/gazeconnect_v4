"""Port of GazeCompass src/spell/personalContinuations.ts (pinned de33a95).

Bounded, opt-in "this person follows these two words with that word" evidence,
learned only from confirmed word commits and reversible by explicit undo. It
defaults to disabled exactly as in the reference; nothing here stores draft
text (the anchor journal keeps offsets and an integrity signature only).
"""
from __future__ import annotations

import re
import unicodedata
from collections import OrderedDict
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from .jsutil import is_js_safe_integer

MAX_CONTINUATION_EVENTS = 512
MAX_CONTEXT_ROWS = 128
MAX_ROW_WORDS = 4
_WORD = re.compile(r"[a-z]+(?:'[a-z]+)?")
_SIGNATURE = re.compile(r'\d+:\d+:\d+')


def empty_personal_continuations() -> Dict[str, Any]:
    return {'enabled': False, 'nextId': 1, 'events': [], 'anchors': [], 'draftSignature': ''}


def _valid_word(word: Any) -> bool:
    return isinstance(word, str) and len(word) <= 40 and _WORD.fullmatch(word) is not None


def _utf16_units(text: str) -> List[int]:
    data = text.encode('utf-16-le', 'surrogatepass')
    return [data[i] | (data[i + 1] << 8) for i in range(0, len(data), 2)]


def _unit_string(text: str) -> str:
    """One Python character per UTF-16 code unit, so offsets match JavaScript's."""
    if text.isascii():
        return text
    return ''.join(chr(unit) for unit in _utf16_units(text))


def signature(text: str) -> str:
    """Integrity hint matching the undo journal to the draft (FNV-1a / djb2 over UTF-16)."""
    a = 2166136261
    b = 5381
    units = _utf16_units(text)
    for unit in units:
        a = ((a ^ unit) * 16777619) & 0xFFFFFFFF
        b = ((b * 33) & 0xFFFFFFFF) ^ unit
    return f'{len(units)}:{a}:{b}'


def normalize_personal_continuations(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, Mapping):
        return empty_personal_continuations()
    seen = set()
    events = []
    for event in raw.get('events') or []:
        if not isinstance(event, Mapping):
            continue
        event_id = event.get('id')
        context = event.get('context')
        if (not is_js_safe_integer(event_id) or event_id < 1 or event_id in seen or not _valid_word(event.get('word'))
                or not isinstance(context, list) or not 1 <= len(context) <= 2 or not all(_valid_word(w) for w in context)):
            continue
        seen.add(event_id)
        events.append({'id': int(event_id), 'context': list(context), 'word': event['word']})
    events = events[-MAX_CONTINUATION_EVENTS:]
    ids = {event['id'] for event in events}
    anchors = []
    for anchor in raw.get('anchors') or []:
        if not isinstance(anchor, Mapping) or anchor.get('id') not in ids:
            continue
        start, end = anchor.get('start'), anchor.get('end')
        if not is_js_safe_integer(start) or not is_js_safe_integer(end) or start < 0 or end <= start or end > 12000:
            continue
        anchors.append({'id': anchor['id'], 'start': int(start), 'end': int(end)})
    anchors = anchors[-MAX_CONTINUATION_EVENTS:]
    draft_signature = raw.get('draftSignature')
    return {
        'enabled': raw.get('enabled') is True,
        'events': events,
        'anchors': anchors,
        'nextId': max([1] + [event['id'] + 1 for event in events]),
        'draftSignature': draft_signature if isinstance(draft_signature, str) and _SIGNATURE.fullmatch(draft_signature) else '',
    }


def apply_continuation_edit(
    state: Mapping[str, Any],
    before: str,
    after: str,
    word: Optional[str] = None,
    context: Optional[Sequence[str]] = None,
    undo: bool = False,
) -> Dict[str, Any]:
    """applyContinuationEdit(): record a confirmed word, or remove it on explicit undo."""
    if not state.get('enabled') or before == after:
        return dict(state)
    if not word and not undo and after.startswith(before):
        return dict(state)
    after_text = after
    before = _unit_string(before)
    after = _unit_string(after)
    events = list(state['events'])
    draft_signature = state.get('draftSignature') or ''
    signed_length = int(draft_signature.split(':')[0]) if draft_signature else 0
    anchors = list(state['anchors']) if (
        draft_signature and signed_length <= len(before) and draft_signature == signature(before[:signed_length])
    ) else []
    if undo and before.startswith(after):
        by_id = {event['id']: event for event in events}
        removed = {
            anchor['id'] for anchor in anchors
            if anchor['end'] > len(after) and
            before[anchor['start']:anchor['end']].lower().replace('’', "'") == (by_id.get(anchor['id']) or {}).get('word')
        }
        events = [event for event in events if event['id'] not in removed]
        anchors = [anchor for anchor in anchors if anchor['id'] not in removed]
    elif not after.startswith(before) and not word:
        anchors = []
    normalized_word = unicodedata.normalize('NFKC', word).lower().replace('’', "'") if word else None
    last_context = list(context)[-2:] if context is not None else None
    next_id = state['nextId']
    if (_valid_word(normalized_word) and last_context and all(_valid_word(w) for w in last_context)
            and after.endswith(f'{normalized_word} ') and is_js_safe_integer(next_id + 1)):
        end = len(after) - 1
        start = end - len(normalized_word)
        by_id = {event['id']: event for event in events}
        already = any(
            anchor['start'] == start and anchor['end'] == end and (by_id.get(anchor['id']) or {}).get('word') == normalized_word
            for anchor in anchors
        )
        if not already:
            anchors = [anchor for anchor in anchors if anchor['end'] <= start]
            events = (events + [{'id': next_id, 'context': list(last_context), 'word': normalized_word}])[-MAX_CONTINUATION_EVENTS:]
            anchors = anchors + [{'id': next_id, 'start': start, 'end': end}]
            next_id += 1
    retained = {event['id'] for event in events}
    return {
        **state,
        'events': events,
        'anchors': [anchor for anchor in anchors if anchor['id'] in retained],
        'nextId': next_id,
        'draftSignature': signature(after_text),
    }


def continuation_evidence(state: Optional[Mapping[str, Any]], history: Sequence[str]) -> List[Tuple[str, float]]:
    """continuationEvidence(): words seen at least twice after this exact context."""
    if not state or not state.get('enabled') or not history:
        return []
    table: 'OrderedDict[str, Dict[str, Dict[str, int]]]' = OrderedDict()
    for event in state.get('events') or []:
        key = ' '.join(event['context'])
        row = table.pop(key, None) or {}
        previous = row.get(event['word'])
        row[event['word']] = {'count': (previous['count'] if previous else 0) + 1, 'last': event['id']}
        table[key] = row
        if len(table) > MAX_CONTEXT_ROWS:
            table.popitem(last=False)
    row = table.get(' '.join(list(history)[-2:]))
    if not row:
        return []
    ranked = [(word, value) for word, value in row.items() if value['count'] >= 2]
    ranked.sort(key=lambda item: (-item[1]['count'], -item[1]['last'], item[0]))
    return [(word, value['count'] / (value['count'] + 3)) for word, value in ranked[:MAX_ROW_WORDS]]
