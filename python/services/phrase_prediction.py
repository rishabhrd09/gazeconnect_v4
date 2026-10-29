"""Literal, local phrase suggestions, independent of the word ranker.

Every suggestion is a frozen edit against its full draft. Completion preserves
confirmed wording and earlier sentences; keyword expansion always needs an
explicit replacement review. No inference of intent from a multi-word keyword,
clock, network, neural model, or implicit acceptance.
"""
from __future__ import annotations
import re
import unicodedata
from functools import lru_cache
from typing import Any, Dict, List, Mapping, Sequence
from prediction_guardrails import contains_blocked_prediction_word
from .phrase_starters import STARTER_PHRASES
from .deterministic_prediction.jsutil import utf16_length
from .deterministic_prediction.policy import load_english_only_withheld

MAX_SUGGESTIONS = 12
MAX_PHRASE_CHARS = 240
_WORD = re.compile(r"[a-z]+(?:'[a-z]+)?", re.I)
_BOUNDARY = re.compile(r'''[.!?]["')\]]*(?:\s+|$)|\n+''')
_ABBREVIATIONS = frozenset(('mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'vs', 'e.g', 'i.e'))
_KEYWORD_STOP = frozenset('i me my we our you your he she it they the a an is am are was be been have has had do does did not no never can could would should will may might please want need feel help thank thanks hello good and or but to for with from on off in of at'.split())


def normalized(text: str) -> str:
    return ' '.join(unicodedata.normalize('NFKC', text).replace('’', "'").lower().split())


@lru_cache(maxsize=1)
def withheld_words():
    return frozenset(load_english_only_withheld())


@lru_cache(maxsize=4096)
def prepared(text: str):
    norm = normalized(text)
    tokens = tuple(_WORD.findall(norm))
    withheld = withheld_words()
    allowed = bool(norm) and len(text) <= MAX_PHRASE_CHARS and not contains_blocked_prediction_word(text)
    allowed = allowed and not re.search(r'[\u0900-\u097f]', text) and not any(w in withheld for w in tokens)
    return norm, tokens, allowed


def sentence_start(draft: str) -> int:
    start = 0
    for match in _BOUNDARY.finditer(draft):
        if draft[match.start()] == '.':
            previous = re.search(r"([A-Za-z.]+)$", draft[:match.start()])
            if previous and previous.group(1).lower() in _ABBREVIATIONS:
                continue
        start = match.end()
    while start < len(draft) and draft[start].isspace():
        start += 1
    return start


@lru_cache(maxsize=1)
def template_bank():
    # Import only when phrases are requested; word-only workers keep their
    # original import/runtime contract. This constructor never reads history.
    from .sentence_prediction import SentencePredictor
    return tuple((text, row.get('c', '')) for row in SentencePredictor._build_templates(None) for text in row['s'])


def _completion(active: str, phrase: str) -> str | None:
    """Return the resulting active sentence without rewriting confirmed tokens."""
    typed = normalized(active)
    target, _, allowed = prepared(phrase)
    if not allowed or not typed or target.rstrip('.!?') == typed.rstrip('.!?'):
        return None
    # A trailing space confirms a token: 'i nee ' cannot become 'i need'.
    probe = typed + (' ' if active[-1:].isspace() else '')
    if not target.startswith(probe):
        return None
    # Match normalized whitespace/case while keeping the authored text. The
    # only replacement allowed here is the unfinished final word.
    pattern = r'\s+'.join(re.escape(p) for p in unicodedata.normalize('NFKC', active).replace('’', "'").strip().split())
    visible_phrase = unicodedata.normalize('NFKC', phrase).replace('’', "'")
    match = re.match(pattern, visible_phrase, re.I)
    if not match:
        return None
    if active[-1:].isspace():
        suffix = visible_phrase[match.end():].lstrip()
        return active + suffix
    trailing = re.search(r"[A-Za-z'’]+$", active)
    if trailing:
        # The candidate continuation includes the end of this unfinished word.
        return active[:trailing.end()] + visible_phrase[match.end():]
    return active.rstrip() + visible_phrase[match.end():]


def suggest_phrases(draft: str, context: Mapping[str, Any], configured: Sequence[str] = (),
                    items: Sequence[Mapping[str, Any]] = ()) -> List[Dict[str, Any]]:
    if not isinstance(draft, str) or len(draft) > 8192:
        return []
    start = sentence_start(draft)
    active = draft[start:]
    typed = normalized(active)
    # source priority orders only competing literal matches; keyword expansion
    # is a separate, lower tier and never displaces a literal completion.
    pool = []
    item_texts = {normalized(item['text']) for item in items[:2000] if isinstance(item, dict) and isinstance(item.get('text'), str)}
    disabled = {normalized(item['text']).rstrip('.!?') for item in items[:2000]
                if isinstance(item, dict) and isinstance(item.get('text'), str) and item.get('enabled') is False}
    for index, text in enumerate(configured[:2000]):
        if isinstance(text, str) and normalized(text) in item_texts: continue
        if isinstance(text, str): pool.append((text, 'configured', 30.0, index, ()))
    for index, item in enumerate(items[:2000]):
        if item.get('enabled') is False or not isinstance(item.get('text'), str): continue
        rank = item.get('priority', 0)
        priority = min(5, max(0, rank)) if isinstance(rank, (int, float)) and not isinstance(rank, bool) else 0
        keywords = tuple(normalized(k) for k in item.get('keywords', [])[:8] if isinstance(k, str)) if isinstance(item.get('keywords'), list) else ()
        pool.append((item['text'], 'configured', 30.0 + priority, index, keywords))
    for index, item in enumerate(context.get('history', [])[:500]):
        if not isinstance(item, dict) or not isinstance(item.get('text'), str): continue
        count = item.get('count', 1)
        count = min(10, max(1, count)) if isinstance(count, (int, float)) and not isinstance(count, bool) else 1
        pool.append((item['text'], 'history', 32.0 + count * .3, index, ()))
    for index, (text, category) in enumerate(template_bank()):
        boost = context.get('topic_boosts', {}).get(category, 0)
        boost = min(.35, max(0, boost) * .35) if isinstance(boost, (int, float)) else 0
        pool.append((text, 'template', 20.0 + boost, index, ()))
    for index, text in enumerate(STARTER_PHRASES):
        pool.append((text, 'starter', 10.0, index, ()))

    results: List[tuple] = []
    expansion = context.get('abbreviation')
    if isinstance(expansion, dict) and expansion.get('token') and isinstance(expansion.get('text'), str):
        token = re.search(r'(\S+)$', draft)
        if token and not draft[-1:].isspace() and token.group().lower() == expansion['token'].lower() and prepared(expansion['text'])[2] and normalized(expansion['text']).rstrip('.!?') not in disabled:
            results.append((-1, 0, 0, {'text': expansion['text'], 'score': 100.0, 'source': 'abbreviation',
                'mode': 'replace_token', 'token': token.group(), 'matched_text': draft}))
    if not typed:
        for index, item in enumerate(context.get('empty_starters', [])[:12]):
            text = item.get('word', '')
            if isinstance(text, str) and prepared(text)[2] and normalized(text).rstrip('.!?') not in disabled:
                results.append((0, -float(item.get('score', 0)), index, {'text': text, 'score': item.get('score', 0),
                    'source': item.get('source', 'starter'), 'mode': 'append', 'matched_text': draft}))
    else:
        key_tokens = _WORD.findall(typed)
        keyword = key_tokens[0] if len(key_tokens) == 1 and typed == key_tokens[0] and len(key_tokens[0]) >= 3 and key_tokens[0] not in _KEYWORD_STOP else None
        for text, source, score, index, keywords in pool:
            target, tokens, allowed = prepared(text)
            if not allowed or len(tokens) < 2 or target.rstrip('.!?') in disabled: continue
            completed = _completion(active, text)
            if completed is not None:
                candidate = {'text': text, 'score': score, 'source': source, 'mode': 'complete_sentence',
                    'matched_text': draft, 'replacement_start': utf16_length(draft[:start]),
                    'result_text': draft[:start] + completed.rstrip() + ' '}
                results.append((0, -score, index, candidate))
            elif keyword and target.rstrip('.!?') != typed and (any(word.startswith(keyword) for word in tokens) or keyword in keywords):
                # Only a lone keyword can request a whole-sentence replacement.
                # Multi-word drafts (especially negations) are never guessed at.
                candidate = {'text': text, 'score': score * .5, 'source': source, 'mode': 'replace_sentence',
                    'matched_text': draft, 'replacement_start': utf16_length(draft[:start]), 'requires_confirmation': True,
                    'result_text': draft[:start] + text.rstrip() + ' '}
                results.append((1, -score, index, candidate))
    results.sort(key=lambda row: row[:3])
    output, seen = [], set()
    for _, _, _, candidate in results:
        key = normalized(candidate.get('result_text', candidate['text'])).rstrip('.!?')
        if key in seen: continue
        seen.add(key); output.append(candidate)
        if len(output) >= MAX_SUGGESTIONS: break
    return output
