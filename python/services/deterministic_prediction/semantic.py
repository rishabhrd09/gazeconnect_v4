"""Port of GazeCompass src/spell/semanticModel.ts (pinned de33a95).

A deterministic 69-class interpolated Witten-Bell trigram over word classes:
"what KIND of word follows these two kinds of word". Not a generative model;
rows are parsed only when a context first needs them.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from .jsutil import js_number
from .shared_english import shard_key_for


class _SparseRow:
    __slots__ = ('mu', 'classes', 'probabilities')

    def __init__(self, mu: float, classes: List[int], probabilities: List[float]):
        self.mu = mu
        self.classes = classes
        self.probabilities = probabilities


def _class_index(value: float) -> int:
    # Values are stored in an Int32Array by the reference; the tables hold integers.
    return int(value)


class SemanticView:
    __slots__ = ('_model', '_probabilities', '_peak', '_best')

    def __init__(self, model: 'SemanticModel', probabilities: List[float], peak: float, best: int):
        self._model = model
        self._probabilities = probabilities
        self._peak = peak
        self._best = best

    def strength_for(self, word: str) -> float:
        entry = self._model.word_entry(word)
        if entry is None:
            return 0
        class_index, membership = entry
        fit = (self._probabilities[class_index] * membership) / self._peak
        return 1 if fit > 1 else fit

    def top_class(self) -> str:
        return self._model.class_name(self._best)


class _NoSemanticContext:
    __slots__ = ('_model',)

    def __init__(self, model: 'SemanticModel'):
        self._model = model

    @staticmethod
    def strength_for(word: str) -> float:
        return 0

    def top_class(self) -> str:
        return self._model.class_name(self._model.oov_class)


class SemanticModel:
    def __init__(self, data: dict):
        meta = data['meta']
        self.meta = meta
        self.scale = meta['probabilityScale']
        self.class_count = meta['classCount']
        self.start_class = meta['startClass']
        self.oov_class = meta['oovClass']
        self._classes: List[str] = data['classes']
        self._data = data
        self._loaded = False
        self._unigram: List[float] = []
        self._max_membership: List[float] = []
        self._is_function: List[int] = []
        self._bigram_raw: Dict[int, str] = {}
        self._trigram_raw: Dict[str, str] = {}
        self._bigram: Dict[int, _SparseRow] = {}
        self._trigram: Dict[str, _SparseRow] = {}
        self._word_shards: Dict[str, Dict[str, Tuple[int, float]]] = {}
        self._no_context = _NoSemanticContext(self)

    def _load(self) -> None:
        if self._loaded:
            return
        data = self._data
        unigram = data['classUnigram']
        max_membership = data['classMaxMembership']
        is_function = data['classIsFunction']
        count = self.class_count
        self._unigram = [(unigram[i] if i < len(unigram) else 0) / self.scale for i in range(count)]
        self._max_membership = [(max_membership[i] if i < len(max_membership) else 0) / self.scale for i in range(count)]
        self._is_function = [(is_function[i] if i < len(is_function) else 0) for i in range(count)]
        for line in data['classBigramPacked'].split('\n'):
            tab = line.find('\t')
            if tab < 0:
                continue
            self._bigram_raw[_class_index(js_number(line[:tab]))] = line[tab + 1:]
        for line in data['classTrigramPacked'].split('\n'):
            tab = line.find('\t')
            if tab < 0:
                continue
            self._trigram_raw[line[:tab]] = line[tab + 1:]
        self._loaded = True

    def _parse_sparse_row(self, packed: str) -> _SparseRow:
        bar = packed.find('|')
        mu = js_number(packed[:bar]) / self.scale
        body = packed[bar + 1:]
        if not body:
            return _SparseRow(mu, [], [])
        classes: List[int] = []
        probabilities: List[float] = []
        for entry in body.split(','):
            tilde = entry.find('~')
            classes.append(_class_index(js_number(entry[:tilde])))
            probabilities.append(js_number(entry[tilde + 1:]) / self.scale)
        return _SparseRow(mu, classes, probabilities)

    def word_entry(self, word: str) -> Optional[Tuple[int, float]]:
        self._load()
        key = shard_key_for(word)
        shard = self._word_shards.get(key)
        if shard is None:
            shard = {}
            blob = self._data['wordShards'].get(key, '')
            if blob:
                for entry in blob.split('|'):
                    first = entry.find('~')
                    if first < 0:
                        continue
                    second = entry.find('~', first + 1)
                    shard[entry[:first]] = (
                        _class_index(js_number(entry[first + 1:second])),
                        js_number(entry[second + 1:]) / self.scale,
                    )
            self._word_shards[key] = shard
        return shard.get(word)

    def _bigram_row(self, class_index: int) -> Optional[_SparseRow]:
        cached = self._bigram.get(class_index)
        if cached is not None:
            return cached
        packed = self._bigram_raw.get(class_index)
        if packed is None:
            return None
        parsed = self._parse_sparse_row(packed)
        self._bigram[class_index] = parsed
        return parsed

    def _trigram_row(self, context: str) -> Optional[_SparseRow]:
        cached = self._trigram.get(context)
        if cached is not None:
            return cached
        packed = self._trigram_raw.get(context)
        if packed is None:
            return None
        parsed = self._parse_sparse_row(packed)
        self._trigram[context] = parsed
        return parsed

    def semantic_class_of(self, word: str) -> int:
        entry = self.word_entry(word)
        return self.oov_class if entry is None else entry[0]

    def is_function_word(self, word: str) -> bool:
        entry = self.word_entry(word)
        return False if entry is None else self._is_function[entry[0]] == 1

    def class_name(self, class_index: int) -> str:
        if 0 <= class_index < len(self._classes):
            return self._classes[class_index]
        return self._classes[self.oov_class]

    def view(self, history: List[str]):
        if not history:
            return self._no_context
        self._load()
        count = self.class_count
        second_class = self.semantic_class_of(history[-1])
        first_class = self.semantic_class_of(history[-2]) if len(history) > 1 else self.start_class

        second = self._bigram_row(second_class)
        if second is not None:
            rest = 1 - second.mu
            probabilities = [rest * value for value in self._unigram]
            mu = second.mu
            for index, class_index in enumerate(second.classes):
                if 0 <= class_index < count:
                    probabilities[class_index] += mu * second.probabilities[index]
        else:
            probabilities = list(self._unigram)

        third = self._trigram_row(f'{first_class},{second_class}')
        if third is not None:
            rest = 1 - third.mu
            probabilities = [value * rest for value in probabilities]
            mu = third.mu
            for index, class_index in enumerate(third.classes):
                if 0 <= class_index < count:
                    probabilities[class_index] += mu * third.probabilities[index]

        peak = 0.0
        best = self.oov_class
        max_membership = self._max_membership
        for index in range(count):
            value = probabilities[index] * max_membership[index]
            if value > peak:
                peak = value
                best = index
        if not (peak > 0) or peak == float('inf'):
            return self._no_context
        return SemanticView(self, probabilities, peak, best)
