"""Port of GazeCompass src/spell/sharedEnglishModel.ts (pinned de33a95).

Modified Kneser-Ney trigram evidence, the blended unigram feature and the
hand-authored word-class transition table. Tables stay packed exactly as the
reference ships them; a shard is split on first use and a context row is parsed
only when that context is asked about, so the work stays proportional to what
the person typed.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from .jsutil import js_number

PACK_SEPARATOR = '~'
BEGINNING_OF_SENTENCE = '<s>'
UNCLASSIFIED_SENTINEL = '__unclassified__'
UNCLASSIFIED_NOUN_SHARE = 0.5

EVIDENCE_TRIGRAM = 'trigram'
EVIDENCE_BIGRAM = 'bigram'
EVIDENCE_BACKOFF = 'backoff'


def shard_key_for(text: str) -> str:
    if not text:
        return '^'
    first = ord(text[0])
    return text[0] if 97 <= first <= 122 else '^'


class NgramContext:
    __slots__ = ('lambda_', 'successors', 'ranked')

    def __init__(self, lambda_: float, successors: Dict[str, float]):
        self.lambda_ = lambda_
        self.successors = successors
        self.ranked: Optional[List[str]] = None


class _ShardedTable:
    def __init__(self, shards: Dict[str, str], scale: float):
        self.shards = shards
        self.scale = scale
        self.rows: Dict[str, Dict[str, str]] = {}
        self.parsed: Dict[str, NgramContext] = {}

    def _shard_rows(self, shard_key: str) -> Dict[str, str]:
        cached = self.rows.get(shard_key)
        if cached is not None:
            return cached
        rows: Dict[str, str] = {}
        blob = self.shards.get(shard_key, '')
        if blob:
            for line in blob.split('\n'):
                separator = line.find('\t')
                if separator < 0:
                    continue
                rows[line[:separator]] = line[separator + 1:]
        self.rows[shard_key] = rows
        return rows

    def row(self, context: str, context_tail: str) -> Optional[NgramContext]:
        cached = self.parsed.get(context)
        if cached is not None:
            return cached
        packed = self._shard_rows(shard_key_for(context_tail)).get(context)
        if packed is None:
            # Misses are not cached: arbitrary user contexts must not grow memory.
            return None
        separator = packed.find('\t')
        lambda_ = js_number(packed[:separator]) / self.scale
        successors: Dict[str, float] = {}
        body = packed[separator + 1:]
        if body:
            for entry in body.split('|'):
                mark = entry.rfind(PACK_SEPARATOR)
                successors[entry[:mark]] = js_number(entry[mark + 1:]) / self.scale
        row = NgramContext(lambda_, successors)
        self.parsed[context] = row
        return row


def _ranked_successors(row: NgramContext) -> List[str]:
    if row.ranked is None:
        row.ranked = [word for word, _ in sorted(row.successors.items(), key=lambda item: (-item[1], item[0]))]
    return row.ranked


class KnContextView:
    """Kneser-Ney view bound to one confirmed context (two map lookups per word)."""

    __slots__ = ('_model', '_bigram', '_trigram')

    def __init__(self, model: 'SharedEnglishModel', bigram: Optional[NgramContext], trigram: Optional[NgramContext]):
        self._model = model
        self._bigram = bigram
        self._trigram = trigram

    def probability(self, word: str) -> float:
        bigram = self._bigram
        if bigram is not None:
            bigram_probability = bigram.successors.get(word, 0) + bigram.lambda_ * self._model.continuation_probability(word)
        else:
            bigram_probability = self._model.continuation_probability(word)
        trigram = self._trigram
        if trigram is None:
            return bigram_probability
        return trigram.successors.get(word, 0) + trigram.lambda_ * bigram_probability

    def evidence(self, word: str) -> str:
        if self._trigram is not None and word in self._trigram.successors:
            return EVIDENCE_TRIGRAM
        if self._bigram is not None and word in self._bigram.successors:
            return EVIDENCE_BIGRAM
        return EVIDENCE_BACKOFF

    def top_successors(self, limit: int) -> List[str]:
        if limit <= 0:
            return []
        ordered: List[str] = []
        taken = set()
        for row in (self._trigram, self._bigram):
            if row is None or len(ordered) >= limit:
                continue
            for word in _ranked_successors(row):
                if len(ordered) >= limit:
                    break
                if word in taken:
                    continue
                ordered.append(word)
                taken.add(word)
        return ordered


class GrammarView:
    __slots__ = ('_row', '_classes', '_noun_prior')

    def __init__(self, row: Dict[str, float], classes: Dict[str, str], noun_class: str):
        self._row = row
        self._classes = classes
        self._noun_prior = row.get(noun_class, 0) * UNCLASSIFIED_NOUN_SHARE

    def bonus_for(self, word: str) -> float:
        word_class = self._classes.get(word)
        if word_class is not None:
            return self._row.get(word_class, 0)
        return self._noun_prior


class SharedEnglishModel:
    def __init__(self, data: dict):
        meta = data['ngramMeta']
        self.meta = meta
        self.probability_scale = meta['probabilityScale']
        self.unigram_scale = meta['unigramScale']
        self.continuation_default = meta['continuationDefault'] / self.probability_scale
        self._trigram = _ShardedTable(data['trigramShards'], self.probability_scale)
        self._bigram = _ShardedTable(data['bigramShards'], self.probability_scale)
        self._unigram_shards: Dict[str, str] = data['unigramShards']
        self._continuation_shards: Dict[str, str] = data['continuationShards']
        self._unigram_cache: Dict[str, Dict[str, float]] = {}
        self._continuation_cache: Dict[str, Dict[str, float]] = {}
        grammar_meta = data['grammarMeta']
        self.noun_class = grammar_meta['unclassifiedWordClass']
        self.sentence_start_class = grammar_meta['sentenceStartClass']
        self._classes_packed: str = data['grammarClassesPacked']
        self._grammar_edges = data['grammarEdges']
        self._word_classes: Optional[Dict[str, str]] = None
        self._grammar_rows: Dict[str, Dict[str, float]] = {}

    # -- per-word sharded tables -------------------------------------------
    @staticmethod
    def _sharded_lookup(shards: Dict[str, str], cache: Dict[str, Dict[str, float]], word: str, scale: float) -> Optional[float]:
        key = shard_key_for(word)
        rows = cache.get(key)
        if rows is None:
            rows = {}
            blob = shards.get(key, '')
            if blob:
                for entry in blob.split('|'):
                    separator = entry.rfind(PACK_SEPARATOR)
                    if separator < 0:
                        continue
                    rows[entry[:separator]] = js_number(entry[separator + 1:]) / scale
            cache[key] = rows
        return rows.get(word)

    def continuation_probability(self, word: str) -> float:
        value = self._sharded_lookup(self._continuation_shards, self._continuation_cache, word, self.probability_scale)
        return self.continuation_default if value is None else value

    def unigram_feature(self, word: str) -> float:
        value = self._sharded_lookup(self._unigram_shards, self._unigram_cache, word, self.unigram_scale)
        return 0 if value is None else value

    # -- Kneser-Ney ----------------------------------------------------------
    def kn_context_view(self, history: List[str]) -> KnContextView:
        previous = history[-1] if history else BEGINNING_OF_SENTENCE
        before_previous = history[-2] if len(history) > 1 else BEGINNING_OF_SENTENCE
        bigram = self._bigram.row(previous, previous)
        trigram = self._trigram.row(f'{before_previous} {previous}', previous)
        return KnContextView(self, bigram, trigram)

    # -- word classes --------------------------------------------------------
    def _classes(self) -> Dict[str, str]:
        if self._word_classes is None:
            classes: Dict[str, str] = {}
            for entry in self._classes_packed.split('|'):
                separator = entry.rfind(PACK_SEPARATOR)
                if separator < 0:
                    continue
                classes[entry[:separator]] = entry[separator + 1:]
            self._word_classes = classes
        return self._word_classes

    def word_class_of(self, word: str) -> str:
        return self._classes().get(word, UNCLASSIFIED_SENTINEL)

    def _grammar_row(self, from_class: str) -> Dict[str, float]:
        cached = self._grammar_rows.get(from_class)
        if cached is not None:
            return cached
        marker = f'{from_class}>'
        row = {key[len(marker):]: value for key, value in self._grammar_edges if key.startswith(marker)}
        self._grammar_rows[from_class] = row
        return row

    def grammar_view(self, previous_word: str) -> GrammarView:
        from_class = self.word_class_of(previous_word) if previous_word else self.sentence_start_class
        return GrammarView(self._grammar_row(from_class), self._classes(), self.noun_class)

    def cache_sizes(self) -> Dict[str, int]:
        return {'bigrams': len(self._bigram.parsed), 'trigrams': len(self._trigram.parsed)}
