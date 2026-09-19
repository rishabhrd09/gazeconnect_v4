#!/usr/bin/env python3
"""Build python/services/deterministic_prediction/english_only_policy.v1.json.

GazeConnect's legacy learner and bundled tables carry romanized Hindi/Hinglish
("mujhe", "pani", "chahiye", "karo"). This release is English-only, but stored
patient history must not be deleted, so the deterministic word slots WITHHOLD
those tokens at display time instead.

The list is derived, not keyword-guessed: every Latin-script token the legacy
code ships in explicitly Hindi/Hinglish tables, minus
  * every word in the English lexicon of the pinned reference (that already
    includes the owner-reviewed Indian English terms: chai, dal, roti, namaste,
    puja, lakh, ...),
  * every token of GazeConnect's own English phrase boards (household names and
    proper nouns such as Diwali, Hanuman Chalisa, Kishore Kumar), and
  * the reviewed allowlist below (place names and festivals used in English).
No blanket ASCII or "looks Indian" rule is applied, so English names and Indian
English stay available.

    python tools/prediction/build_english_only_policy.py [--check]
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python'))
OUT = ROOT / 'python' / 'services' / 'deterministic_prediction' / 'english_only_policy.v1.json'
LATIN = re.compile(r"[a-z]+(?:'[a-z]+)?")

# Reviewed by hand; extend deliberately. Everything here stays displayable.
ENGLISH_PROPER_NOUN_ALLOWLIST = {
    # Places and festivals GazeConnect's English boards use or a person types in English.
    'indore', 'bhopal', 'ujjain', 'madhya', 'pradesh', 'mahakal', 'rajwada', 'sarafa',
    'diwali', 'holi', 'hanuman', 'hanumanji', 'chalisa', 'ramayan', 'krishna',
}
# Ordinary English words that happen to share a spelling with a Hinglish token.
# The pinned lexicon (about 10k words) lacks some of them, which is why the
# lexicon alone cannot protect them.
ENGLISH_HOMOGRAPHS = {
    'pet', 'mat', 'tab', 'mast', 'char', 'lo', 'papa', 'mama', 'nana', 'dada', 'ghee',
}
# Indian English nouns and address terms used inside English sentences (food,
# worship, kinship titles). Hindi grammar words, verbs and adjectives stay withheld.
INDIAN_ENGLISH_TERMS = {
    'paneer', 'paratha', 'masala', 'kheer', 'halwa', 'ladoo', 'barfi', 'aloo', 'gobhi', 'namkeen',
    'aarti', 'prasad', 'pooja', 'mandir',
    'didi', 'bhaiya', 'bhai', 'dadi', 'nani', 'mami', 'chacha', 'chachi',
}


def legacy_romanized_tokens() -> dict:
    import services.word_prediction as legacy
    from services.sentence_prediction import SentencePredictor

    sources = {}

    def add(name: str, texts) -> None:
        tokens = set()
        for text in texts:
            tokens.update(LATIN.findall(str(text).lower()))
        sources[name] = tokens

    add('HINGLISH_VOCABULARY', legacy.HINGLISH_VOCABULARY)
    add('ABBREVIATIONS (Hinglish shortcuts)', [
        legacy.ABBREVIATIONS[key] for key in ('mkb', 'pdc', 'pgk', 'dkt', 'ddd', 'cdd', 'mpc', 'mdh', 'mna',
                                              'skb', 'dkc', 'skd', 'pck', 'kgk', 'fbk', 'lbk')
    ])
    add('CONVERSATIONAL_SCAFFOLD Hinglish rows', [
        ' '.join([*key, *value]) for key, value in legacy.CONVERSATIONAL_SCAFFOLD_2.items() if key in (('kaise', 'ho'), ('theek', 'hoon'))
    ] + [' '.join([key, *legacy.CONVERSATIONAL_SCAFFOLD_1[key]]) for key in ('kaise', 'mujhe', 'aap')])
    add('time-of-day sets', [w for w in legacy._MORNING | legacy._AFTERNOON | legacy._EVENING | legacy._NIGHT if w.isascii()])
    template_tokens = []
    for template in SentencePredictor._build_templates(None):
        template_tokens.extend(s for s in template['s'] if s.isascii())
    sources['sentence templates (all Latin tokens; filtered below)'] = set()
    for text in template_tokens:
        sources['sentence templates (all Latin tokens; filtered below)'].update(LATIN.findall(text.lower()))
    return sources


def english_lexicon() -> set:
    from services.deterministic_prediction.engine import DeterministicPredictionEngine
    engine = DeterministicPredictionEngine()
    words = set(engine.index.frequency) | set(engine.index.lemma_by_word) | engine.index.protected_care
    for bucket in engine.index.prefix_buckets.values():
        words.update(bucket)
    return words


def phrase_board_tokens() -> tuple:
    path = ROOT / 'docs' / 'phrase-inventory.csv'
    rows = list(csv.DictReader(path.open(encoding='utf-8')))
    tokens = set()
    for row in rows:
        tokens.update(LATIN.findall((row.get('text', '') + ' ' + row.get('spoken', '')).lower()))
    return tokens, hashlib.sha256(path.read_bytes()).hexdigest()


def build() -> dict:
    sources = legacy_romanized_tokens()
    lexicon = english_lexicon()
    board_tokens, board_hash = phrase_board_tokens()
    hinglish_sources = {k: v for k, v in sources.items() if not k.startswith('sentence templates')}
    candidates = set().union(*hinglish_sources.values())
    # Template tokens are mostly English; only those also listed in a Hinglish
    # table would qualify, and those are already in `candidates`.
    allowlisted = ENGLISH_PROPER_NOUN_ALLOWLIST | ENGLISH_HOMOGRAPHS | INDIAN_ENGLISH_TERMS
    withheld = sorted(
        token for token in candidates
        if token not in lexicon and token not in board_tokens and token not in allowlisted
    )
    return {
        'schemaVersion': 1,
        'purpose': 'Display-only English policy for deterministic word slots. Stored history is never deleted.',
        'generator': 'tools/prediction/build_english_only_policy.py',
        'sources': sorted(hinglish_sources),
        'excluded': {
            'englishLexicon': 'pinned reference lexicon incl. reviewed Indian English (see assets/manifest.json)',
            'phraseBoards': {'path': 'docs/phrase-inventory.csv', 'sha256': board_hash},
            'properNounAllowlist': sorted(ENGLISH_PROPER_NOUN_ALLOWLIST),
            'englishHomographs': sorted(ENGLISH_HOMOGRAPHS),
            'indianEnglishTerms': sorted(INDIAN_ENGLISH_TERMS),
        },
        'withheldRomanizedHindi': withheld,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    payload = json.dumps(build(), indent=1, ensure_ascii=False) + '\n'
    if args.check:
        if not OUT.is_file() or OUT.read_text(encoding='utf-8') != payload:
            raise SystemExit(f'{OUT.relative_to(ROOT)} is stale; rerun without --check')
        print('English-only policy is current.')
        return
    OUT.write_text(payload, encoding='utf-8')
    data = json.loads(payload)
    print(f"withheld {len(data['withheldRomanizedHindi'])} tokens -> {OUT.relative_to(ROOT)}")


if __name__ == '__main__':
    main()
