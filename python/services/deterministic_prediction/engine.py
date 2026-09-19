"""Deterministic word prediction: port of GazeCompass buildPredictionSnapshot.

Reference: src/spell/predictionService.ts at commit de33a95 (see assets/manifest.json).
The order of operations, tie-breaks, feature formulas and slot semantics follow
the reference line by line; comments name the reference function each block
ports. Intentional differences are listed in DIFFERENCES below and in
docs/deterministic-prediction/README.md.

Nothing here reads the clock, the network, a random source or an LLM. The same
draft, learned state, phrase data, configuration and previous-snapshot lineage
always produce the same snapshot.
"""
from __future__ import annotations

import math
import re
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional, Sequence, Set, Tuple

from . import assets_loader
from .jsutil import (
    JS_WS,
    compare_text,
    current_prefix,
    drop_utf16_tail,
    ends_with_js_whitespace,
    is_js_finite_number,
    is_js_integer,
    js_number,
    js_trim,
    normalize_content_text,
    normalize_word,
    utf16_key,
    words_in,
)
from .personal_continuations import continuation_evidence
from .policy import CATEGORY_CLINICAL, ReferenceWordPolicy
from .semantic import SemanticModel
from .shared_english import EVIDENCE_BACKOFF, EVIDENCE_BIGRAM, EVIDENCE_TRIGRAM, SharedEnglishModel

DIFFERENCES = (
    'Statistics cache keyed by (context history, distilled-row key) instead of history alone; '
    'the reference could reuse a wh-frame distilled value for a longer clause with the same last three words.',
    'Saved-content and governed-phrase candidate ranking is not ported; GazeConnect keeps its own '
    'sentence suggestions as a separate feature.',
    'The lexicon index is computed by the pinned reference code at export time and loaded, not rebuilt.',
)

FEATURE_NAMES = (
    'curatedContext', 'caregiverContext', 'caregiver', 'personal', 'personalContext', 'prefixFit',
    'exactSpelling', 'kn', 'evidence', 'semanticClass', 'aacDomain', 'contextPrior', 'distilled',
    'protectedCare', 'phraseWord', 'unigram', 'grammar', 'posAgreement', 'fallback', 'typoPenalty',
)

EVIDENCE_TIER_SCORES = {EVIDENCE_TRIGRAM: 1, EVIDENCE_BIGRAM: 0.45, EVIDENCE_BACKOFF: 0}

_WORD_PATTERN = re.compile(r"[a-z]+(?:'[a-z]+)?")
_SENTENCE_SPLIT = re.compile(r'[.?!]["\')\]]?' + JS_WS + '*')
_SENTENCE_END = re.compile(r'[.?!]["\')\]]?' + JS_WS + r'*\Z')
_CLAUSE_SPLIT = re.compile(r'[.!?]')


class Features:
    """CandidateFeatures. Slots keep attribute access cheap in the per-candidate loop."""

    __slots__ = FEATURE_NAMES

    def __init__(self) -> None:
        self.curatedContext = 0
        self.caregiverContext = 0
        self.caregiver = 0
        self.personal = 0
        self.personalContext = 0
        self.prefixFit = 0
        self.exactSpelling = 0
        self.kn = 0
        self.evidence = 0
        self.semanticClass = 0
        self.aacDomain = 0
        self.contextPrior = 0
        self.distilled = 0
        self.protectedCare = 0
        self.phraseWord = 0
        self.unigram = 0
        self.grammar = 0
        self.posAgreement = 0
        self.fallback = 0
        self.typoPenalty = 0

    def as_dict(self) -> Dict[str, float]:
        return {name: getattr(self, name) for name in FEATURE_NAMES}


class RankedCandidate:
    __slots__ = ('word', 'features', 'score')

    def __init__(self, word: str, features: Features, score: float):
        self.word = word
        self.features = features
        self.score = score


@dataclass(frozen=True)
class SnapshotLineage:
    """PredictionSnapshotLineage: only meaningful while the same unfinished word grows."""

    prefix: str
    candidates: Tuple[str, ...]
    candidate_slots: Optional[Tuple[Optional[str], ...]] = None


@dataclass
class PredictionSnapshot:
    id: Any
    prefix: str
    candidates: List[str]
    candidate_slots: List[Optional[str]]
    word_evidence: Optional[List[Dict[str, Any]]] = None
    diagnostics: Optional[Dict[str, Any]] = None

    def lineage(self) -> SnapshotLineage:
        return SnapshotLineage(self.prefix, tuple(self.candidates), tuple(self.candidate_slots))


@dataclass
class ConfirmedContext:
    previous: str
    pair: str
    expanded_previous: str
    expanded_pair: str
    sentence_start: bool
    message_start: bool
    history: List[str]


@dataclass
class _PhraseModel:
    words: Dict[str, float]
    transitions: Dict[str, Dict[str, int]]
    pair_transitions: Dict[str, Dict[str, int]]


@dataclass
class _ContentEntry:
    item: Dict[str, Any]
    lower: str
    tokens: List[str]
    aliases: List[str]
    stable_index: int


@dataclass
class _ContentModel:
    entries: List[_ContentEntry] = field(default_factory=list)
    recency_rank: Dict[str, int] = field(default_factory=dict)


class _Index:
    """PredictionIndex, loaded from the reference-computed export."""

    def __init__(self, data: dict, priors: dict, distilled: dict):
        self.entries: List[Tuple[str, float]] = [(word, count) for word, count in data['entries']]
        self.frequency: Dict[str, float] = dict(self.entries)
        self.lemma_by_word: Dict[str, str] = dict(data['lemmaByWord'])
        self.prefix_buckets: Dict[str, List[str]] = dict(data['prefixBuckets'])
        self.bigrams: Dict[str, List[Tuple[str, float]]] = {
            key: [(word, count) for word, count in row] for key, row in data['bigrams']
        }
        self.aac_bigrams: Dict[str, List[Tuple[str, float]]] = {
            key: [(word, count) for word, count in row] for key, row in data['aacBigrams']
        }
        self.part_of_speech: Dict[str, List[str]] = dict(data['partOfSpeech'])
        self.protected_prefix_buckets: Dict[str, List[str]] = dict(data['protectedPrefixBuckets'])
        self.protected_care: Set[str] = set(data['protectedCare'])
        self.words_by_pos: Dict[str, List[str]] = dict(data['wordsByPos'])
        self.urgent_transitions: Dict[str, List[str]] = dict(data['urgentTransitions'])
        self.urgent_pair_transitions: Dict[str, List[str]] = dict(data['urgentPairTransitions'])
        self.fallback_unigram: Dict[str, float] = dict(data['fallbackUnigram'])
        self.context_prior_bigrams: Dict[str, List[str]] = dict(priors['bigrams'])
        self.context_prior_trigrams: Dict[str, List[str]] = dict(priors['trigrams'])
        self.distilled_continuations: Dict[str, str] = dict(distilled['rows'])
        self.first_entries: List[str] = [word for word, _ in self.entries]


class _Tables:
    """In-code curated tables of predictionService.ts, exported verbatim."""

    def __init__(self, data: dict):
        pairs = lambda key: {k: list(v) for k, v in data[key]}  # noqa: E731
        self.aac_domain_words: List[Tuple[str, float]] = [(word, boost) for word, boost in data['aacDomainWords']]
        self.aac_context = pairs('aacContext')
        self.aac_two_word_context = pairs('aacTwoWordContext')
        self.aac_two_word_context_v2 = pairs('aacTwoWordContextV2')
        self.aac_context_v2 = pairs('aacContextV2')
        self.contraction_expansions = pairs('contractionExpansions')
        self.apostrophe_words = list(data['apostropheWords'])
        self.grammar_expectation = pairs('grammarExpectation')
        self.sentence_openers = list(data['sentenceOpeners'])
        self.session_openers = list(data['sessionOpeners'])
        self.fallback = list(data['fallback'])
        self.junk_residue_tokens = frozenset(data['junkResidueTokens'])
        self.finite_verbs = frozenset(data['finiteVerbs'])
        self.modal_auxiliaries = frozenset(data['modalAuxiliaries'])
        self.copulas = frozenset(data['copulas'])
        self.degree_adverbs = frozenset(data['degreeAdverbs'])
        self.wh_words = frozenset(data['whWords'])
        self.subject_pronouns = frozenset(data['subjectPronouns'])
        self.object_pronouns = frozenset(data['objectPronouns'])
        self.preposition_object_contexts = frozenset(data['prepositionObjectContexts'])
        self.copula_like = frozenset(data['copulaLike'])
        self.sensitive_communication_context = frozenset(data['sensitiveCommunicationContext'])
        self.care_context_words = frozenset(data['careContextWords'])
        self.clinical_soft_boost_words = frozenset(data['clinicalSoftBoostWords'])
        self.uninformative_context_words = frozenset(data['uninformativeContextWords'])
        self.wh_overridable_pairs = frozenset(data['whOverridablePairs'])
        self.curated_tiers = list(data['curatedTiers'])
        self.ranker_weights = dict(data['rankerWeights'])
        self.word_boundary_ranker_weights = dict(data['wordBoundaryRankerWeights'])
        self.tail_rerank_residual = [(name, weight) for name, weight in data['tailRerankResidual']]
        self.rerank_protected_tiers = list(data['rerankProtectedTiers'])
        self.grammatical_role_forms = frozenset(data['grammaticalRoleForms'])
        self.capped_function_classes = frozenset(data['cappedFunctionClasses'])
        self.evidence_tier_scores = dict(data['evidenceTierScores'])
        self.numeric = dict(data['numericConstants'])
        self.person_centered_prefix_pair_context = pairs('personCenteredPrefixPairContext')
        self.place_starts = list(data['placeStarts'])
        self.place_pairs = frozenset(data['placePairs'])
        self.place_previous = frozenset(data['placePrevious'])
        self.reserved_navigation_labels = frozenset(data['reservedNavigationLabels'])
        self.never_suggested_words = list(data['neverSuggestedWords'])
        self.clinical_or_safeguarding_words = list(data['clinicalOrSafeguardingWords'])
        self.personal_expression_words = list(data['personalExpressionWords'])


# Numeric constants (predictionService.ts). test_deterministic_constants.py asserts
# every value equals the exported reference value.
MAX_WORD_CANDIDATES = 5
MAX_WORD_SLOTS = 10
MAX_GENERIC_PREFIX_BUCKET = 256
MAX_CONTEXT_SUCCESSORS = 12
MAX_NGRAM_SUPPLY = 100
MAX_GRAMMAR_SUPPLY = 20
GRAMMAR_SWAP_SCAN_LIMIT = 8
GRAMMAR_SWAP_MAX_SCORE_GAP = 40
FAMILY_SECOND_FORM_MAX_INDEX = 3
GRAMMAR_VIOLATION_PENALTY = 90
COPULA_THIRD_SINGULAR_PENALTY = 15
MAX_PERSONAL_COUNT = 100
MAX_PRIORITY_WORDS = 50
MAX_CACHED_PHRASE_MODELS = 4
PROTECTED_CARE_MIN_PREFIX = 3
DERIVED_VOCABULARY_MIN_PREFIX = 3
MAX_COMPLETION_LETTERS = 12
MAX_AAC_DOMAIN_BOOST = 220
AAC_EMPHASIS_MIN_PREFIX = 1
AAC_EMPHASIS_MAX_PREFIX = 1
AAC_SHORT_PREFIX_EMPHASIS = 2
MAX_PHRASE_WORD_BOOST = 40
MAX_RECENCY_BOOST = 240
MAX_PRIORITY_BOOST = 2200 + MAX_PRIORITY_WORDS * 12
PERSONAL_USE_SHARE = 0.6
CAREGIVER_BASE_STRENGTH = 0.3
CAREGIVER_PRIORITY_SHARE = 0.4
CAREGIVER_USE_SHARE = 0.15
CAREGIVER_RECENCY_SHARE = 0.1
CAREGIVER_PINNED_SHARE = 0.05
MAX_CAREGIVER_TRANSITION_COUNT = 6
CAREGIVER_CONTEXT_WORD_STRENGTH = 0.45
CAREGIVER_CONTEXT_PAIR_STRENGTH = 0.7
TYPO_MIN_PREFIX = 3
TYPO_MAX_RESULTS = 12
MAX_LEGAL_CANDIDATES = 64
MAX_FUSION_PRIOR_SUPPLY = 32
SENSITIVE_CONTEXT_AAC_STRENGTH = 0.35
MAX_SENSITIVE_CONTEXT_SHORTLIST = 4
CONTEXT_HISTORY_WORDS = 3
POS_SECONDARY_STRENGTH = 0.5
KN_LOG_DECADES = 6
AAC_DOMAIN_MISFIT_FLOOR = 0.12
AAC_DOMAIN_CONTEXT_GATE_MAX_PREFIX = 2
MAX_UNEVIDENCED_FUNCTION_WORDS = 3
RRF_K = 6
HOUSEHOLD_PAIR_SLOTS = 2
HOUSEHOLD_PAIR_RANK = 3
DISTILLED_ROW_CACHE_LIMIT = 256
DISTILLED_LOG_DECADES = 4
CURATED_RANK_SLOTS = MAX_WORD_CANDIDATES
PERSONAL_MISFIT_FLOOR = 0.15
AAC_MISFIT_FLOOR = 0.35
CAREGIVER_MISFIT_FLOOR = 0.1
SEMANTIC_GATE_REJECTED = 0
SEMANTIC_GATE_ALLOWED = 1
PHRASE_TAIL_WORD_POINTS = 130  # reference constant; phrase ranking is not ported

NUMERIC_CONSTANTS = {name: value for name, value in globals().items() if name.isupper() and isinstance(value, (int, float))}


def use_strength(count: float) -> float:
    bounded = min(max(count, 0), MAX_PERSONAL_COUNT)
    return math.log1p(bounded) / math.log1p(MAX_PERSONAL_COUNT)


def kn_log_feature(probability: float) -> float:
    if probability <= 0:
        return 0
    return max(0, min(1, 1 + math.log10(probability) / KN_LOG_DECADES))


def distilled_feature(log10_probability: Optional[float]) -> float:
    if log10_probability is None:
        return 0
    return max(0, min(1, 1 + log10_probability / DISTILLED_LOG_DECADES))


def is_within_one_edit(prefix: str, word: str) -> bool:
    length = len(prefix)
    index = 0
    while index < length and index < len(word) and prefix[index] == word[index]:
        index += 1
    if index == length:
        return False
    if word.startswith(prefix[index + 1:], index + 1):
        return True
    if word.startswith(prefix[index + 1:], index):
        return True
    if word.startswith(prefix[index:], index + 1):
        return True
    return False


def near_prefix_bucket_keys(prefix: str) -> List[str]:
    head = prefix[:4]
    keys: Set[str] = set()
    alphabet = 'abcdefghijklmnopqrstuvwxyz'
    for length in range(1, len(head) + 1):
        keys.add(head[:length])
    for position in range(len(head)):
        keys.add((head[:position] + head[position + 1:])[:4])
        for letter in alphabet:
            keys.add((head[:position] + letter + head[position + 1:])[:4])
            keys.add((head[:position] + letter + head[position:])[:4])
    for letter in alphabet:
        keys.add((head + letter)[:4])
    keys.discard('')
    return sorted(keys, key=utf16_key)


def price_priority(priority_rank: Any) -> float:
    """priorityBoost()."""
    if priority_rank is None or not is_js_integer(priority_rank) or priority_rank < 1 or priority_rank > MAX_PRIORITY_WORDS:
        return 0
    return 2200 + (MAX_PRIORITY_WORDS + 1 - priority_rank) * 12


def _valid_priority_rank(value: Any) -> float:
    if value is not None and is_js_integer(value) and 1 <= value <= MAX_PRIORITY_WORDS:
        return value
    return 9007199254740991


def _content_entry_wins(candidate: Mapping[str, Any], existing: Mapping[str, Any]) -> bool:
    def strength(item: Mapping[str, Any]) -> List[float]:
        order = item.get('order')
        return [
            -_valid_priority_rank(item.get('priorityRank')),
            1 if item.get('pinned') else 0,
            item.get('useCount') or 0,
            item.get('lastUsedAt') or 0,
            -(9007199254740991 if order is None else order),
        ]
    a = strength(candidate)
    b = strength(existing)
    for index, value in enumerate(a):
        if value > b[index] and all(a[prior] == b[prior] for prior in range(index)):
            return True
    return False


class DeterministicPredictionEngine:
    """Loads the pinned tables once and builds prediction snapshots."""

    def __init__(self, asset_dir: Optional[Path] = None, policy: Optional[ReferenceWordPolicy] = None):
        directory = asset_dir or assets_loader.default_asset_dir()
        self.manifest = assets_loader.load_manifest(directory)
        self.tables = _Tables(assets_loader.load_asset('engine_tables', directory))
        self.index = _Index(
            assets_loader.load_asset('index', directory),
            assets_loader.load_asset('context_priors', directory),
            assets_loader.load_asset('distilled_continuations', directory),
        )
        self.shared = SharedEnglishModel(assets_loader.load_asset('shared_english', directory))
        self.semantic = SemanticModel(assets_loader.load_asset('semantic', directory))
        t = self.tables
        self.reference_policy = ReferenceWordPolicy(
            t.never_suggested_words, t.clinical_or_safeguarding_words, t.personal_expression_words
        )
        self.policy: ReferenceWordPolicy = policy or self.reference_policy
        self._never_in_lexicon = frozenset(t.never_suggested_words)
        self._curated_tier_index = {tier: index for index, tier in enumerate(t.curated_tiers)}
        self._curated_slot_count = len(t.curated_tiers) * CURATED_RANK_SLOTS
        self._weights = self._weight_vector(t.ranker_weights)
        self._boundary_weights = self._weight_vector(t.word_boundary_ranker_weights)
        self._statistics_key: Optional[Tuple[str, str]] = None
        self._statistics: Dict[str, Tuple[float, float, float, float, float, float]] = {}
        self._distilled_rows: 'OrderedDict[str, Dict[str, float]]' = OrderedDict()
        self._phrase_models: 'OrderedDict[str, _PhraseModel]' = OrderedDict()
        self._personal_cache: Dict[Any, List[Tuple[str, float, float]]] = {}
        self._content_cache: Dict[Any, _ContentModel] = {}

    # ----------------------------------------------------------- utilities
    @staticmethod
    def _weight_vector(weights: Mapping[str, float]) -> Tuple[float, ...]:
        return tuple(weights[name] for name in (
            'curatedContext', 'caregiverContext', 'caregiver', 'personal', 'personalContext', 'kn',
            'evidence', 'semanticClass', 'exactSpelling', 'aacDomain', 'unigram', 'contextPrior',
            'distilled', 'posAgreement', 'protectedCare', 'prefixFit', 'grammar', 'phraseWord',
            'fallback', 'typoPenalty',
        ))

    def blend_features(self, f: Features, at_word_boundary: bool = False) -> float:
        """blendFeatures(): the unrolled sum, in the reference's summation order."""
        (w_curated, w_caregiver_context, w_caregiver, w_personal, w_personal_context, w_kn, w_evidence,
         w_semantic, w_exact, w_aac, w_unigram, w_prior, w_distilled, w_pos, w_care, w_fit, w_grammar,
         w_phrase, w_fallback, w_typo) = self._boundary_weights if at_word_boundary else self._weights
        return (
            w_curated * f.curatedContext +
            w_caregiver_context * f.caregiverContext +
            w_caregiver * f.caregiver +
            w_personal * f.personal +
            w_personal_context * f.personalContext +
            w_kn * f.kn +
            w_evidence * f.evidence +
            w_semantic * f.semanticClass +
            w_exact * f.exactSpelling +
            w_aac * f.aacDomain +
            w_unigram * f.unigram +
            w_prior * f.contextPrior +
            w_distilled * f.distilled +
            w_pos * f.posAgreement +
            w_care * f.protectedCare +
            w_fit * f.prefixFit +
            w_grammar * f.grammar +
            w_phrase * f.phraseWord +
            w_fallback * f.fallback +
            w_typo * f.typoPenalty
        )

    def habit_score(self, f: Features) -> float:
        w = self.tables.ranker_weights
        return (
            w['caregiver'] * f.caregiver +
            w['personal'] * f.personal +
            w['exactSpelling'] * f.exactSpelling +
            w['unigram'] * f.unigram +
            w['prefixFit'] * f.prefixFit +
            w['typoPenalty'] * f.typoPenalty
        )

    def curated_strength(self, tier: str, rank: int) -> float:
        slot = self._curated_tier_index.get(tier, len(self.tables.curated_tiers)) * CURATED_RANK_SLOTS + min(rank, CURATED_RANK_SLOTS - 1)
        return (self._curated_slot_count - slot) / self._curated_slot_count

    def is_allowed_word(self, word: str) -> bool:
        if word in self._never_in_lexicon:
            return False
        return (
            _WORD_PATTERN.fullmatch(word) is not None and
            word not in self.tables.junk_residue_tokens and
            (len(word) >= 2 or word == 'a' or word == 'i')
        )

    @staticmethod
    def is_prefix_compatible(prefix: str, word: str) -> bool:
        if not prefix:
            return True
        normalized = normalize_word(word)
        if normalized.startswith(prefix):
            return True
        return "'" in normalized and normalized.replace("'", '').startswith(prefix)

    def stem_key(self, word: str) -> str:
        if word in self.tables.grammatical_role_forms:
            return word
        known = self.index.lemma_by_word.get(word)
        if known:
            return known
        length = len(word)
        if length > 6 and word.endswith('ies'):
            return f'{word[:-3]}y'
        if length > 6 and word.endswith('ing'):
            return word[:-3]
        if length > 5 and word.endswith('ed'):
            return word[:-2]
        if length > 5 and word.endswith('es'):
            return word[:-2]
        if length > 4 and word.endswith('s'):
            return word[:-1]
        return word

    def word_class_of(self, word: str) -> str:
        return self.shared.word_class_of(word)

    def is_reserved_navigation_label(self, value: str) -> bool:
        return self._normalize_communication_text(value) in self.tables.reserved_navigation_labels

    @staticmethod
    def _normalize_communication_text(value: str) -> str:
        return normalize_content_text(value).lower()

    def is_insertable_communication_text(self, value: str) -> bool:
        normalized = self._normalize_communication_text(value)
        return len(normalized) > 0 and normalized not in self.tables.reserved_navigation_labels

    # ------------------------------------------------------------ context
    def confirmed_context(self, draft: str, history_limit: int = CONTEXT_HISTORY_WORDS) -> ConfirmedContext:
        prefix = current_prefix(draft)
        without_prefix = drop_utf16_tail(draft, len(prefix)) if prefix else draft
        sentence = _SENTENCE_SPLIT.split(without_prefix)[-1]
        words = words_in(sentence)
        all_words = words_in(without_prefix)
        expansions = self.tables.contraction_expansions
        tail: List[str] = []
        for word in words[-2:]:
            tail.extend(expansions[word] if word in expansions else [word])
        return ConfirmedContext(
            previous=words[-1] if words else '',
            pair=' '.join(words[-2:]),
            expanded_previous=tail[-1] if tail else '',
            expanded_pair=' '.join(tail[-2:]),
            sentence_start=len(words) == 0 or _SENTENCE_END.search(without_prefix) is not None,
            message_start=len(all_words) == 0,
            history=words[-history_limit:],
        )

    def prediction_context_words(self, draft: str) -> List[str]:
        return self.confirmed_context(draft).history

    def _wh_frame_context_key(self, draft: str, prefix: str, history: List[str]) -> str:
        if len(history) != CONTEXT_HISTORY_WORDS or history[0] not in self.tables.wh_words:
            return ''
        confirmed = drop_utf16_tail(draft, len(prefix)) if prefix else draft
        clause = words_in(_CLAUSE_SPLIT.split(confirmed)[-1])
        return ' '.join(history) if len(clause) == CONTEXT_HISTORY_WORDS and clause[0] == history[0] else ''

    def _distilled_row(self, key: str) -> Dict[str, float]:
        cached = self._distilled_rows.get(key)
        if cached is not None:
            return cached
        packed = self.index.distilled_continuations.get(key)
        if not packed:
            return {}
        row: Dict[str, float] = {}
        for part in packed.split('|'):
            at = part.rfind('~')
            if at <= 0:
                continue
            value = js_number(part[at + 1:])
            if math.isfinite(value):
                row[part[:at]] = value
        if len(self._distilled_rows) >= DISTILLED_ROW_CACHE_LIMIT:
            self._distilled_rows.popitem(last=False)
        self._distilled_rows[key] = row
        return row

    def _place_context_candidates(self, pair: str, previous: str, prefix: str) -> List[str]:
        t = self.tables
        if len(prefix) < 2 or (pair not in t.place_pairs and previous not in t.place_previous):
            return []
        return [word for word in t.place_starts if word.startswith(prefix)][:8]

    # ------------------------------------------------------ phrase / personal
    def phrase_model(self, phrases: Sequence[str]) -> _PhraseModel:
        normalized = [text for text in (normalize_content_text(p) for p in phrases) if self.is_insertable_communication_text(text)]
        key = ''.join(normalized)
        cached = self._phrase_models.get(key)
        if cached is not None:
            self._phrase_models.move_to_end(key)
            return cached
        words: Dict[str, float] = {}
        transitions: Dict[str, Dict[str, int]] = {}
        pair_transitions: Dict[str, Dict[str, int]] = {}
        for phrase in normalized:
            tokens = words_in(phrase)
            for index, word in enumerate(tokens):
                if not self.is_allowed_word(word):
                    continue
                words[word] = max(words.get(word, 0), 30 + max(0, 10 - index))
                if index == 0:
                    continue
                previous = tokens[index - 1]
                next_words = transitions.setdefault(previous, {})
                next_words[word] = next_words.get(word, 0) + 1
                if index >= 2:
                    pair = f'{tokens[index - 2]} {previous}'
                    pair_words = pair_transitions.setdefault(pair, {})
                    pair_words[word] = pair_words.get(word, 0) + 1
        model = _PhraseModel(words, transitions, pair_transitions)
        self._phrase_models[key] = model
        while len(self._phrase_models) > MAX_CACHED_PHRASE_MODELS:
            self._phrase_models.popitem(last=False)
        return model

    def _relative_recency_ranks(self, timestamps: Optional[Mapping[str, Any]]) -> Dict[str, int]:
        if not timestamps:
            return {}
        entries = []
        for raw_word, stamp in timestamps.items():
            if not is_js_finite_number(stamp) or not stamp > 0:
                continue
            word = normalize_word(raw_word)
            if not self.is_allowed_word(word):
                continue
            entries.append((word, stamp))
        entries.sort(key=lambda entry: (-entry[1], utf16_key(entry[0])))
        ranks: Dict[str, int] = {}
        for rank, (word, _) in enumerate(entries):
            ranks[word] = rank
        return ranks

    def _personal_model(
        self,
        accepted_words: Mapping[str, Any],
        timestamps: Optional[Mapping[str, Any]],
        cache_key: Any,
    ) -> List[Tuple[str, float, float]]:
        if cache_key is not None:
            cached = self._personal_cache.get(cache_key)
            if cached is not None:
                return cached
        ranks = self._relative_recency_ranks(timestamps)
        words: List[Tuple[str, float, float]] = []
        for raw_word, count in accepted_words.items():
            word = normalize_word(raw_word)
            if not self.is_allowed_word(word) or not is_js_finite_number(count) or count <= 0:
                continue
            rank = ranks.get(word)
            words.append((word, count, 0 if rank is None else max(0, 240 - rank * 18)))
        if cache_key is not None:
            if len(self._personal_cache) > 8:
                self._personal_cache.clear()
            self._personal_cache[cache_key] = words
        return words

    def _content_model(self, items: Sequence[Mapping[str, Any]], cache_key: Any) -> _ContentModel:
        if not items:
            return _ContentModel()
        if cache_key is not None and cache_key in self._content_cache:
            return self._content_cache[cache_key]
        unique: Dict[str, Dict[str, Any]] = {}
        for item in items:
            if item.get('enabled') is False:
                continue
            text = normalize_content_text(str(item.get('text', '')))
            key = text.lower()
            if not self.is_insertable_communication_text(text):
                continue
            aliases = [alias for alias in (normalize_content_text(str(a)) for a in (item.get('aliases') or [])) if alias]
            candidate = {**item, 'text': text, 'aliases': aliases}
            existing = unique.get(key)
            if existing is None:
                unique[key] = candidate
                continue
            merged_aliases = list(dict.fromkeys([*existing['aliases'], *candidate['aliases']]))
            unique[key] = {**(candidate if _content_entry_wins(candidate, existing) else existing), 'aliases': merged_aliases}
        recency = [item for item in unique.values() if is_js_finite_number(item.get('lastUsedAt')) and (item.get('lastUsedAt') or 0) > 0]
        recency.sort(key=lambda item: (-(item.get('lastUsedAt') or 0), utf16_key(str(item.get('id', '')))))
        recency_rank: Dict[str, int] = {}
        for index, item in enumerate(recency):
            recency_rank[item.get('id')] = index
        entries = []
        for stable_index, item in enumerate(unique.values()):
            lower = item['text'].lower()
            entries.append(_ContentEntry(item, lower, words_in(lower), [alias.lower() for alias in item['aliases']], stable_index))
        model = _ContentModel(entries, recency_rank)
        if cache_key is not None:
            if len(self._content_cache) > 8:
                self._content_cache.clear()
            self._content_cache[cache_key] = model
        return model

    def _household_pair_words(self, pair_words: Optional[Mapping[str, int]], reviewed: Sequence[str]) -> List[str]:
        if not pair_words:
            return []
        taken = set(reviewed)
        eligible = [
            (word, count) for word, count in pair_words.items()
            if word not in taken and word not in self.tables.uninformative_context_words and
            (word in self.index.frequency or word in self.index.protected_care)
        ]
        eligible.sort(key=lambda item: -item[1])  # stable: ties keep phrase order
        return [word for word, _ in eligible[:HOUSEHOLD_PAIR_SLOTS]]

    # ------------------------------------------------------------ snapshot
    def build_snapshot(
        self,
        draft: str,
        *,
        snapshot_id: Any = 0,
        phrase_texts: Sequence[str] = (),
        accepted_words: Optional[Mapping[str, Any]] = None,
        accepted_word_last_used_at: Optional[Mapping[str, Any]] = None,
        personal_continuations: Optional[Mapping[str, Any]] = None,
        content_items: Optional[Sequence[Mapping[str, Any]]] = None,
        previous_snapshot: Optional[SnapshotLineage] = None,
        slot_count: Any = None,
        clinical_boost_enabled: bool = True,
        word_evidence: bool = False,
        diagnostics: bool = False,
        policy: Optional[ReferenceWordPolicy] = None,
        personal_cache_key: Any = None,
        content_cache_key: Any = None,
    ) -> PredictionSnapshot:
        stages = self._rank(
            draft,
            phrase_texts=phrase_texts,
            accepted_words=accepted_words or {},
            accepted_word_last_used_at=accepted_word_last_used_at,
            personal_continuations=personal_continuations,
            content_items=content_items or (),
            clinical_boost_enabled=clinical_boost_enabled,
            diagnostics=diagnostics,
            policy=policy or self.policy,
            personal_cache_key=personal_cache_key,
            content_cache_key=content_cache_key,
        )
        return self.select(stages, snapshot_id=snapshot_id, previous_snapshot=previous_snapshot,
                           slot_count=slot_count, word_evidence=word_evidence, diagnostics=diagnostics)

    def normalize_slot_count(self, slot_count: Any) -> int:
        if is_js_integer(slot_count) and MAX_WORD_CANDIDATES < slot_count <= MAX_WORD_SLOTS:
            return int(slot_count)
        return MAX_WORD_CANDIDATES

    def select(
        self,
        stages: '_RankStages',
        *,
        snapshot_id: Any = 0,
        previous_snapshot: Optional[SnapshotLineage] = None,
        slot_count: Any = None,
        word_evidence: bool = False,
        diagnostics: bool = False,
    ) -> PredictionSnapshot:
        """Selection stage (diversity, fusion, habit slot, stable slots) for one board size.

        Scoring does not depend on the board size, so one `_rank` result can be
        selected at five and at ten slots without scoring twice.
        """
        count = self.normalize_slot_count(slot_count)
        decisions: Optional[List[Dict[str, Any]]] = [] if diagnostics else None
        diverse = self.select_diverse_candidates(stages.ranked, count, decisions)
        fused = self.fuse_context_priors(
            diverse, stages.context, stages.prefix, stages.clause_tokens,
            stages.is_policy_eligible, stages.legal_candidates.__contains__,
        )
        candidates = self.reserve_habit_slot(fused, stages.legal_pool)
        candidate_slots = self.stabilize_candidate_slots(candidates, stages.prefix, previous_snapshot, count)
        evidence = None
        if word_evidence:
            score_by_word = {entry.word: entry.score for entry in stages.ranked}
            evidence = [{'word': word, 'score': score_by_word[word]} for word in candidates if word in score_by_word]
        diag = None
        if diagnostics:
            diag = {
                'pool': list(stages.legal_pool.keys()),
                'sourceUnion': stages.source_union,
                'scoredUnion': [{'word': entry.word, 'score': entry.score} for entry in stages.ranked_all],
                'ranked': [entry.word for entry in stages.ranked],
                'diverse': diverse,
                'diversityDecisions': decisions,
                'fused': fused,
                'expectedPartsOfSpeech': list(stages.expectation),
                'recoveredCandidates': stages.recovered,
                'features': {entry.word: entry.features.as_dict() for entry in stages.ranked},
            }
        return PredictionSnapshot(snapshot_id, stages.prefix, candidates, candidate_slots, evidence, diag)

    # The scoring half of buildPredictionSnapshot. Returns everything selection needs.
    def _rank(
        self,
        draft: str,
        *,
        phrase_texts: Sequence[str],
        accepted_words: Mapping[str, Any],
        accepted_word_last_used_at: Optional[Mapping[str, Any]],
        personal_continuations: Optional[Mapping[str, Any]],
        content_items: Sequence[Mapping[str, Any]],
        clinical_boost_enabled: bool,
        diagnostics: bool,
        policy: ReferenceWordPolicy,
        personal_cache_key: Any,
        content_cache_key: Any,
    ) -> '_RankStages':
        index = self.index
        tables = self.tables
        prefix = current_prefix(draft)
        prefix_length = len(prefix)
        context = self.confirmed_context(draft)
        previous = context.previous
        history = context.history
        phrases = self.phrase_model(phrase_texts)
        content_model = self._content_model(content_items, content_cache_key)
        pool: Dict[str, Features] = {}

        personalized_words: Set[str] = {normalize_word(word) for word in accepted_words.keys()}
        for text in phrase_texts:
            personalized_words.update(words_in(text))
        for entry in content_model.entries:
            personalized_words.update(entry.tokens)

        category = policy.category
        sensitive_context = any(
            word in tables.sensitive_communication_context or category(word) == CATEGORY_CLINICAL
            for word in history
        )
        care_context_relevant = any(
            word in tables.care_context_words or word in index.protected_care for word in history
        )
        eligible = policy.eligible

        def is_policy_eligible(word: str) -> bool:
            return eligible(word, prefix_length, word in personalized_words, sensitive_context)

        is_allowed_word = self.is_allowed_word
        never_in_lexicon = self._never_in_lexicon

        def features_for(raw_word: str) -> Optional[Features]:
            word = raw_word if raw_word.isascii() and raw_word == raw_word.strip().lower() else normalize_word(raw_word)
            existing = pool.get(word)
            if existing is not None:
                return existing
            if word in never_in_lexicon or not is_allowed_word(word):
                return None
            if prefix and not word.startswith(prefix) and not ("'" in word and word.replace("'", '').startswith(prefix)):
                return None
            if not is_policy_eligible(word):
                return None
            created = Features()
            if clinical_boost_enabled and prefix_length == 0 and sensitive_context and category(word) == CATEGORY_CLINICAL:
                created.aacDomain = SENSITIVE_CONTEXT_AAC_STRENGTH
            pool[word] = created
            return created

        context_is_uninformative = previous in tables.uninformative_context_words
        wh_frame_key = self._wh_frame_context_key(draft, prefix, history)
        wh_frame_row = self._distilled_row(wh_frame_key) if wh_frame_key else {}
        reviewed_pair_stands_down = len(wh_frame_row) > 0 and context.pair in tables.wh_overridable_pairs
        one_word_tiers_supply_only = context_is_uninformative or reviewed_pair_stands_down

        curated_strength = self.curated_strength

        def note_curated(words: Sequence[str], tier: str, supply_only: bool = False) -> Sequence[str]:
            for rank, raw_word in enumerate(words):
                features = features_for(raw_word)
                if features is None or supply_only:
                    continue
                strength = curated_strength(tier, rank)
                if strength > features.curatedContext:
                    features.curatedContext = strength
            return [] if supply_only else words

        aac_emphasis = AAC_SHORT_PREFIX_EMPHASIS if AAC_EMPHASIS_MIN_PREFIX <= prefix_length <= AAC_EMPHASIS_MAX_PREFIX else 1

        bucket_key = prefix[:min(4, prefix_length)]
        primary_pool = index.prefix_buckets.get(bucket_key, []) if prefix else index.first_entries[:MAX_GENERIC_PREFIX_BUCKET]
        for word in primary_pool:
            features_for(word)

        kn = self.shared.kn_context_view(history)
        for word in kn.top_successors(MAX_NGRAM_SUPPLY):
            if word in index.frequency:
                features_for(word)

        expectation = tables.grammar_expectation.get(previous, [])
        for tag in expectation:
            candidates = index.words_by_pos.get(tag)
            if not candidates:
                continue
            taken = 0
            position = 0
            while position < len(candidates) and taken < MAX_GRAMMAR_SUPPLY:
                if features_for(candidates[position]) is not None:
                    taken += 1
                position += 1

        for word, boost in tables.aac_domain_words:
            features = features_for(word)
            if features is None:
                continue
            if word in tables.clinical_soft_boost_words:
                if not clinical_boost_enabled:
                    continue
                if not care_context_relevant and prefix_length < 2 and word not in personalized_words:
                    continue
            features.aacDomain = max(features.aacDomain, (boost / MAX_AAC_DOMAIN_BOOST) * aac_emphasis)

        if prefix_length >= PROTECTED_CARE_MIN_PREFIX:
            for word in index.protected_prefix_buckets.get(bucket_key, ()):
                features = features_for(word)
                if features is not None and (clinical_boost_enabled or word not in tables.clinical_soft_boost_words):
                    features.protectedCare = 1

        for word, boost in phrases.words.items():
            features = features_for(word)
            if features is not None:
                features.phraseWord = max(features.phraseWord, boost / MAX_PHRASE_WORD_BOOST)

        personal_words = self._personal_model(accepted_words, accepted_word_last_used_at, personal_cache_key)
        for word, strength in continuation_evidence(personal_continuations, history):
            if word not in index.frequency and word not in personalized_words:
                continue
            features = features_for(word)
            if features is not None:
                features.personalContext = strength
        for word, count, recency_boost in personal_words:
            features = features_for(word)
            if features is None:
                continue
            recency_strength = recency_boost / MAX_RECENCY_BOOST
            features.personal = max(
                features.personal,
                PERSONAL_USE_SHARE * use_strength(count) + (1 - PERSONAL_USE_SHARE) * recency_strength,
            )

        for entry in content_model.entries:
            item = entry.item
            if item.get('kind') != 'word':
                continue
            features = features_for(entry.lower)
            if features is None:
                continue
            priority_strength = price_priority(item.get('priorityRank')) / MAX_PRIORITY_BOOST
            recent_rank = content_model.recency_rank.get(item.get('id'))
            recency_strength = 0 if recent_rank is None else max(0, 240 - recent_rank * 18) / MAX_RECENCY_BOOST
            use_count = item.get('useCount') if item.get('useCount') is not None else 0
            features.caregiver = max(
                features.caregiver,
                CAREGIVER_BASE_STRENGTH +
                priority_strength * CAREGIVER_PRIORITY_SHARE +
                use_strength(use_count) * CAREGIVER_USE_SHARE +
                recency_strength * CAREGIVER_RECENCY_SHARE +
                (CAREGIVER_PINNED_SHARE if item.get('pinned') else 0),
            )

        manual_context = note_curated(tables.aac_context.get(previous, []), 'reviewedWord', one_word_tiers_supply_only)
        reviewed_pair_words = [] if reviewed_pair_stands_down else tables.aac_two_word_context.get(context.pair, [])
        household = self._household_pair_words(phrases.pair_transitions.get(context.pair), reviewed_pair_words)
        two_word_context = note_curated(
            reviewed_pair_words if not household else [
                *reviewed_pair_words[:HOUSEHOLD_PAIR_RANK], *household, *reviewed_pair_words[HOUSEHOLD_PAIR_RANK:],
            ],
            'reviewedPair',
        )
        wh_frame_words = note_curated(list(wh_frame_row.keys())[:CURATED_RANK_SLOTS], 'harvestedPair') if reviewed_pair_stands_down else []
        pair_context_v2 = note_curated(tables.aac_two_word_context_v2.get(context.pair, []), 'harvestedPair')
        person_centered_words = tables.person_centered_prefix_pair_context.get(context.pair, [])
        person_centered_prefix_pair_context = (
            note_curated(person_centered_words, 'harvestedPair')
            if prefix_length > 0 and any(self.is_prefix_compatible(prefix, word) for word in person_centered_words)
            else []
        )
        word_context_v2 = note_curated(
            [] if len(two_word_context) > 0 else tables.aac_context_v2.get(previous, []),
            'harvestedWord',
            one_word_tiers_supply_only,
        )
        expanded_pair_context = note_curated(
            [] if context.expanded_pair == context.pair else self._first_non_empty(
                (tables.aac_two_word_context, tables.aac_two_word_context_v2), context.expanded_pair),
            'expandedPair',
        )
        expanded_word_context = note_curated(
            [] if context.expanded_previous == previous else self._first_non_empty(
                (tables.aac_context, tables.aac_context_v2), context.expanded_previous),
            'expandedWord',
            one_word_tiers_supply_only,
        )
        specific_context_applied = (
            len(manual_context) > 0 or len(two_word_context) > 0 or len(wh_frame_words) > 0 or
            len(pair_context_v2) > 0 or len(person_centered_prefix_pair_context) > 0 or
            len(word_context_v2) > 0 or len(expanded_pair_context) > 0 or len(expanded_word_context) > 0
        )
        if not specific_context_applied:
            note_curated(index.urgent_pair_transitions.get(context.pair, []), 'urgentPair')
            note_curated(index.urgent_transitions.get(previous, []), 'urgentWord', one_word_tiers_supply_only)

        if context.message_start and prefix_length == 0:
            note_curated(tables.session_openers, 'sentenceOpener')
        elif context.sentence_start and not context.message_start:
            note_curated(tables.sentence_openers, 'sentenceOpener')

        def apply_context_row(row: Sequence[Tuple[str, float]]) -> None:
            row_max = row[0][1] if row else 0
            for rank, (word, count) in enumerate(row):
                features = features_for(word)
                if features is None:
                    continue
                strength = (count / row_max if row_max > 0 else 0) * max(0, 1 - rank / MAX_CONTEXT_SUCCESSORS)
                if strength > features.contextPrior:
                    features.contextPrior = strength

        apply_context_row(index.bigrams.get(previous, ()))
        apply_context_row(index.aac_bigrams.get(previous, ()))

        fusion_prior_row = index.context_prior_trigrams.get(context.pair)
        if fusion_prior_row is None:
            fusion_prior_row = index.context_prior_bigrams.get(previous, [])
        corroborated_prefix_prior = prefix_length == 1 and context.pair in index.context_prior_trigrams
        for rank, word in enumerate(fusion_prior_row[:MAX_FUSION_PRIOR_SUPPLY]):
            features = features_for(word)
            if features is not None and (prefix_length == 0 or (corroborated_prefix_prior and kn.evidence(word) == EVIDENCE_TRIGRAM)):
                features.contextPrior = max(features.contextPrior, 1 / (rank + 1))

        contextual_places = {word for word in self._place_context_candidates(context.pair, previous, prefix) if word in index.frequency}
        for word in self._place_context_candidates(context.pair, previous, prefix):
            if word in contextual_places:
                features_for(word)

        distilled_context = wh_frame_row if len(wh_frame_row) > 0 else self._distilled_row(context.pair)
        for word in distilled_context.keys():
            features_for(word)

        custom_context = phrases.transitions.get(previous)
        if custom_context:
            for word, count in custom_context.items():
                features = features_for(word)
                if features is None:
                    continue
                features.caregiverContext = max(
                    features.caregiverContext,
                    CAREGIVER_CONTEXT_WORD_STRENGTH * min(1, count / MAX_CAREGIVER_TRANSITION_COUNT),
                )
        custom_pair_context = phrases.pair_transitions.get(context.pair)
        if custom_pair_context:
            for word, count in custom_pair_context.items():
                features = features_for(word)
                if features is None:
                    continue
                features.caregiverContext = max(
                    features.caregiverContext,
                    CAREGIVER_CONTEXT_PAIR_STRENGTH +
                    (1 - CAREGIVER_CONTEXT_PAIR_STRENGTH) * min(1, count / MAX_CAREGIVER_TRANSITION_COUNT),
                )

        fallback_words = tables.fallback
        for rank, word in enumerate(fallback_words):
            features = features_for(word)
            if features is not None:
                features.fallback = max(features.fallback, 1 - rank / len(fallback_words))

        recovered: List[str] = []
        if diagnostics and prefix_length >= TYPO_MIN_PREFIX and len(pool) == 0:
            for word in self._near_prefix_matches(prefix):
                if not self.is_allowed_word(word) or word in pool:
                    continue
                if not is_policy_eligible(word):
                    continue
                recovered.append(word)

        grammar = self.shared.grammar_view(previous)
        semantic = self.semantic.view(history)
        expected_pos = expectation
        statistics = self._statistics_for(' '.join(history), wh_frame_key if len(wh_frame_row) > 0 else '')
        has_context = len(history) > 0
        preposition_context = previous in tables.preposition_object_contexts
        object_pronouns = tables.object_pronouns
        part_of_speech = index.part_of_speech
        fallback_unigram = index.fallback_unigram
        unigram_feature = self.shared.unigram_feature
        evidence_scores = EVIDENCE_TIER_SCORES
        semantic_strength = semantic.strength_for
        grammar_bonus = grammar.bonus_for
        for word, features in pool.items():
            cached = statistics.get(word)
            if cached is not None:
                (features.unigram, features.kn, features.evidence, features.distilled,
                 features.grammar, features.posAgreement) = cached
            else:
                unigram = unigram_feature(word)
                if not unigram or unigram != unigram:
                    unigram = fallback_unigram.get(word, 0)
                features.unigram = unigram
                features.kn = kn_log_feature(kn.probability(word))
                features.evidence = evidence_scores[kn.evidence(word)]
                features.distilled = distilled_feature(distilled_context.get(word))
                features.grammar = grammar_bonus(word)
                if expected_pos:
                    best = -1
                    for pos in part_of_speech.get(word, ()):
                        try:
                            match = expected_pos.index(pos)
                        except ValueError:
                            continue
                        if best < 0 or match < best:
                            best = match
                    if best >= 0:
                        features.posAgreement = 1 if best == 0 else POS_SECONDARY_STRENGTH
                if preposition_context and word in object_pronouns:
                    features.posAgreement = max(features.posAgreement, 1)
                statistics[word] = (features.unigram, features.kn, features.evidence, features.distilled,
                                    features.grammar, features.posAgreement)
            features.semanticClass = max(
                semantic_strength(word) * (SEMANTIC_GATE_REJECTED if features.grammar < 0 else SEMANTIC_GATE_ALLOWED),
                1 if word in contextual_places else 0,
            )
            if word in contextual_places:
                features.contextPrior = max(features.contextPrior, 1)
            if has_context:
                fit = max(features.evidence, features.semanticClass)
                features.personal *= PERSONAL_MISFIT_FLOOR + (1 - PERSONAL_MISFIT_FLOOR) * fit
                if prefix_length == 0:
                    features.aacDomain *= AAC_MISFIT_FLOOR + (1 - AAC_MISFIT_FLOOR) * features.evidence
                features.caregiver *= CAREGIVER_MISFIT_FLOOR + (1 - CAREGIVER_MISFIT_FLOOR) * fit
                if prefix_length < AAC_DOMAIN_CONTEXT_GATE_MAX_PREFIX:
                    if prefix_length == 0:
                        features.aacDomain *= AAC_DOMAIN_MISFIT_FLOOR + (1 - AAC_DOMAIN_MISFIT_FLOOR) * features.evidence
                    else:
                        features.aacDomain *= AAC_DOMAIN_MISFIT_FLOOR + (1 - AAC_DOMAIN_MISFIT_FLOOR) * fit
            else:
                features.personal *= 1
                if prefix_length == 0:
                    features.aacDomain *= 1
                features.caregiver *= 1
                if prefix_length < AAC_DOMAIN_CONTEXT_GATE_MAX_PREFIX:
                    features.aacDomain *= 1
            if features.typoPenalty == 0:
                exact = prefix_length > 0 and (
                    word == prefix or ("'" in word and word.replace("'", '') == prefix)
                )
                remaining = max(0, len(word) - prefix_length)
                features.exactSpelling = 1 if exact else 0
                features.prefixFit = max(0, 1 - remaining / MAX_COMPLETION_LETTERS)

        confirmed_draft = drop_utf16_tail(draft, prefix_length) if prefix else draft
        clause_tokens = words_in(_CLAUSE_SPLIT.split(confirmed_draft)[-1])
        clause_head = clause_tokens[0] if clause_tokens else None
        previous_opens_clause = len(clause_tokens) <= 1 or (clause_head is not None and clause_head in tables.wh_words)
        after_inverted_subject = (
            len(clause_tokens) == 2 and clause_head is not None and
            clause_head in tables.finite_verbs and previous in tables.subject_pronouns
        )
        after_statement_modal = (
            previous in tables.modal_auxiliaries and len(clause_tokens) >= 2 and
            clause_tokens[-2] in tables.subject_pronouns
        )
        after_modal_question_subject = (
            len(clause_tokens) == 2 and clause_head in tables.modal_auxiliaries and previous in tables.subject_pronouns
        )

        def modal_misfit(word: str) -> bool:
            return prefix_length == 0 and (
                (after_statement_modal and word in tables.subject_pronouns) or
                ((after_statement_modal or after_modal_question_subject) and
                 (word in tables.finite_verbs or word in tables.modal_auxiliaries))
            )

        if prefix_length == 0 and (after_statement_modal or after_modal_question_subject):
            for word, features in pool.items():
                if modal_misfit(word):
                    features.curatedContext = 0

        def violates_grammar(candidate: str) -> bool:
            if previous in tables.finite_verbs and candidate in tables.finite_verbs:
                return True
            if after_inverted_subject and candidate in tables.finite_verbs:
                return True
            if previous in tables.degree_adverbs:
                if candidate in tables.uninformative_context_words:
                    return True
                if candidate in tables.finite_verbs:
                    return True
            if previous in tables.copulas and not previous_opens_clause and candidate in tables.subject_pronouns:
                return True
            return False

        source_union = list(pool.keys()) if diagnostics else []
        copula_context = previous in tables.copula_like

        def copula_third_singular_misfit(word: str, features: Features) -> bool:
            if not copula_context or features.curatedContext != 0:
                return False
            tags = part_of_speech.get(word)
            return (tags[0] if tags else '') == 'V_3SG'

        for word, features in pool.items():
            if copula_third_singular_misfit(word, features):
                features.posAgreement = 0

        at_boundary = prefix_length == 0
        blend = self.blend_features
        ranked_all = [
            RankedCandidate(
                word,
                features,
                blend(features, at_boundary)
                - (GRAMMAR_VIOLATION_PENALTY if (modal_misfit(word) or violates_grammar(word)) else 0)
                - (COPULA_THIRD_SINGULAR_PENALTY if copula_third_singular_misfit(word, features) else 0),
            )
            for word, features in pool.items()
        ]
        ranked_all.sort(key=lambda entry: (-entry.score, entry.word))

        shortlist = ranked_all[:MAX_LEGAL_CANDIDATES]
        ranked = self.rerank_unprotected_tail(shortlist) if prefix_length <= 1 else shortlist
        if sensitive_context and len(ranked) == MAX_LEGAL_CANDIDATES:
            shortlisted = {entry.word for entry in ranked}
            sensitive_supply = [
                entry for entry in ranked_all
                if category(entry.word) == CATEGORY_CLINICAL and entry.word not in shortlisted
            ][:MAX_SENSITIVE_CONTEXT_SHORTLIST]
            insertion_start = len(ranked) - len(sensitive_supply)
            for offset, entry in enumerate(sensitive_supply):
                # Mutates `shortlist` too when no reranking copy was made, exactly as the reference.
                ranked[insertion_start + offset] = entry
        legal_pool: Dict[str, Features] = {}
        for entry in shortlist:
            legal_pool[entry.word] = entry.features

        return _RankStages(
            prefix=prefix,
            context=context,
            clause_tokens=clause_tokens,
            ranked_all=ranked_all,
            ranked=ranked,
            legal_pool=legal_pool,
            legal_candidates=set(legal_pool.keys()),
            is_policy_eligible=is_policy_eligible,
            expectation=list(expectation),
            source_union=source_union,
            recovered=recovered,
        )

    @staticmethod
    def _first_non_empty(maps: Sequence[Mapping[str, List[str]]], key: str) -> List[str]:
        for table in maps:
            entry = table.get(key, [])
            if len(entry) > 0:
                return entry
        return []

    def _statistics_for(self, history_key: str, distilled_key: str) -> Dict[str, Tuple[float, ...]]:
        key = (history_key, distilled_key)
        if self._statistics_key != key:
            self._statistics_key = key
            self._statistics = {}
        return self._statistics

    def _near_prefix_matches(self, prefix: str) -> List[str]:
        found: List[str] = []
        seen: Set[str] = set()
        for key in near_prefix_bucket_keys(prefix):
            bucket = self.index.prefix_buckets.get(key)
            if not bucket:
                continue
            for word in bucket:
                if word in seen:
                    continue
                seen.add(word)
                if not is_within_one_edit(prefix, word):
                    continue
                found.append(word)
                if len(found) >= TYPO_MAX_RESULTS:
                    return found
        return found

    # ----------------------------------------------------- tail reranker
    def _is_rerank_protected(self, features: Features) -> bool:
        for tier in self.tables.rerank_protected_tiers:
            if getattr(features, tier) > 0:
                return True
        return False

    def _tail_residual(self, features: Features) -> float:
        total = 0
        for name, weight in self.tables.tail_rerank_residual:
            total += weight * getattr(features, name)
        return total

    def rerank_unprotected_tail(self, ranked: List[RankedCandidate]) -> List[RankedCandidate]:
        positions: List[int] = []
        movable: List[RankedCandidate] = []
        for position, entry in enumerate(ranked):
            if self._is_rerank_protected(entry.features):
                continue
            positions.append(position)
            movable.append(entry)
        if len(movable) < 2:
            return ranked
        movable.sort(key=lambda entry: (-(entry.score + self._tail_residual(entry.features)), entry.word))
        out = list(ranked)
        for offset, position in enumerate(positions):
            out[position] = movable[offset]
        return out

    # ---------------------------------------------------------- diversity
    def select_diverse_candidates(
        self,
        ranked: Sequence[RankedCandidate],
        slot_count: int = MAX_WORD_CANDIDATES,
        decisions: Optional[List[Dict[str, Any]]] = None,
    ) -> List[str]:
        tables = self.tables
        capped = tables.capped_function_classes
        word_class_of = self.shared.word_class_of
        trigram = EVIDENCE_TIER_SCORES[EVIDENCE_TRIGRAM]
        selected: List[str] = []
        deferred: List[str] = []
        families: Set[str] = set()
        family_slot: Dict[str, int] = {}
        closed_families: Set[str] = set()
        agreement_of: Dict[str, float] = {}
        evidence_of: Dict[str, float] = {}
        grammar_of: Dict[str, float] = {}
        curated_of: Dict[str, float] = {}
        score_of: Dict[str, float] = {}
        function_words = 0

        for scanned, item in enumerate(ranked):
            if len(selected) >= slot_count and scanned >= GRAMMAR_SWAP_SCAN_LIMIT:
                if decisions is not None:
                    decisions.append({'word': item.word, 'family': self.stem_key(item.word), 'action': 'scan-limit'})
                break
            f = item.features
            family = self.stem_key(item.word)
            if family in families:
                held = family_slot.get(family)
                incumbent = None if held is None else selected[held]
                incumbent_score = score_of.get(incumbent if incumbent is not None else '', math.inf)
                if (
                    incumbent is not None and
                    f.posAgreement > agreement_of.get(incumbent, 0) and
                    (evidence_of.get(incumbent, 0) < trigram or f.evidence >= trigram) and
                    (held != 0 or f.grammar >= grammar_of.get(incumbent, 0)) and
                    curated_of.get(incumbent, 0) <= 0 and
                    item.score >= incumbent_score - GRAMMAR_SWAP_MAX_SCORE_GAP
                ):
                    selected[held] = item.word
                    agreement_of[item.word] = f.posAgreement
                    evidence_of[item.word] = f.evidence
                    grammar_of[item.word] = f.grammar
                    score_of[item.word] = item.score
                    closed_families.add(family)
                    if decisions is not None:
                        decisions.append(_decision(item.word, family, 'replaced-family', incumbent))
                elif (
                    incumbent is not None and
                    scanned <= FAMILY_SECOND_FORM_MAX_INDEX and
                    family not in closed_families and
                    len(selected) < slot_count and
                    f.posAgreement >= agreement_of.get(incumbent, 0) and
                    (evidence_of.get(incumbent, 0) < trigram or f.evidence >= trigram) and
                    word_class_of(item.word) != 'determiner' and
                    (word_class_of(item.word) not in capped or f.evidence >= trigram or
                     f.curatedContext > 0 or function_words < MAX_UNEVIDENCED_FUNCTION_WORDS)
                ):
                    if word_class_of(item.word) in capped and f.evidence < trigram and f.curatedContext <= 0:
                        function_words += 1
                    closed_families.add(family)
                    agreement_of[item.word] = f.posAgreement
                    evidence_of[item.word] = f.evidence
                    grammar_of[item.word] = f.grammar
                    curated_of[item.word] = f.curatedContext
                    score_of[item.word] = item.score
                    selected.append(item.word)
                    if decisions is not None:
                        decisions.append(_decision(item.word, family, 'selected-second-form', incumbent))
                else:
                    if decisions is not None:
                        decisions.append(_decision(item.word, family, 'suppressed-family', incumbent))
                continue
            exempt = f.evidence >= trigram or f.curatedContext > 0
            if not exempt and word_class_of(item.word) in capped:
                if function_words >= MAX_UNEVIDENCED_FUNCTION_WORDS:
                    deferred.append(item.word)
                    families.add(family)
                    if decisions is not None:
                        decisions.append({'word': item.word, 'family': family, 'action': 'deferred-function-cap'})
                    continue
                function_words += 1
            if len(selected) >= slot_count:
                if decisions is not None:
                    decisions.append({'word': item.word, 'family': family, 'action': 'skipped-capacity'})
                continue
            family_slot[family] = len(selected)
            agreement_of[item.word] = f.posAgreement
            evidence_of[item.word] = f.evidence
            grammar_of[item.word] = f.grammar
            curated_of[item.word] = f.curatedContext
            score_of[item.word] = item.score
            selected.append(item.word)
            families.add(family)
            if decisions is not None:
                decisions.append({'word': item.word, 'family': family, 'action': 'selected'})

        for word in deferred:
            if len(selected) >= slot_count:
                break
            selected.append(word)
            if decisions is not None:
                decisions.append({'word': word, 'family': self.stem_key(word), 'action': 'backfill-function'})
        if len(selected) < slot_count:
            shown = set(selected)
            for prefer_new_family in (True, False):
                for item in ranked:
                    if len(selected) >= slot_count:
                        break
                    if item.word in shown:
                        continue
                    family = self.stem_key(item.word)
                    if prefer_new_family == (family in families):
                        continue
                    selected.append(item.word)
                    shown.add(item.word)
                    families.add(family)
                    if decisions is not None:
                        decisions.append({'word': item.word, 'family': family, 'action': 'backfill-family'})
        return selected

    # ------------------------------------------------------------ fusion
    def fuse_context_priors(
        self,
        candidates: List[str],
        context: ConfirmedContext,
        prefix: str,
        clause_tokens: List[str],
        is_policy_eligible: Callable[[str], bool],
        is_legal_candidate: Callable[[str], bool],
    ) -> List[str]:
        index = self.index
        tables = self.tables
        shipped = candidates[:MAX_WORD_CANDIDATES]
        care_in_shipped = [word for word in shipped if word in index.protected_care]
        if len(prefix) > 0 and len(care_in_shipped) > 0:
            return candidates
        prior_previous = clause_tokens[-1] if clause_tokens else ''
        prior_pair = ' '.join(clause_tokens[-2:])
        priors = index.context_prior_trigrams.get(prior_pair)
        if priors is None:
            priors = index.context_prior_bigrams.get(prior_previous)
        if priors is None:
            return candidates

        scores: Dict[str, float] = {}
        for rank, word in enumerate(candidates):
            scores[word] = 1 / (RRF_K + rank)
        for rank, word in enumerate(priors):
            if (
                not self.is_allowed_word(word) or
                not is_policy_eligible(word) or
                not is_legal_candidate(word) or
                (prefix and not word.startswith(prefix))
            ):
                continue
            scores[word] = scores.get(word, 0) + 1 / (RRF_K + rank)

        fused = [word for word, _ in sorted(scores.items(), key=lambda item: (-item[1], utf16_key(item[0])))]

        expansion = tables.contraction_expansions.get(context.previous)
        inherits_expanded_context = expansion is not None and len(expansion) == 1
        if (
            context.pair in index.urgent_pair_transitions or
            context.previous in index.urgent_transitions or
            (len(prefix) > 0 and any(self.is_prefix_compatible(prefix, word)
                                     for word in tables.person_centered_prefix_pair_context.get(context.pair, []))) or
            (inherits_expanded_context and context.expanded_previous in index.urgent_transitions)
        ):
            shipped_set = set(candidates)
            fused = [*candidates, *[word for word in fused if word not in shipped_set]]

        if candidates:
            head = candidates[0]
            if head in fused:
                at = fused.index(head)
                if at > 0:
                    fused.pop(at)
                    fused.insert(0, head)
        fused = fused[:len(candidates)]

        for word in care_in_shipped:
            shipped_rank = shipped.index(word)
            fused_rank = fused.index(word) if word in fused else -1
            if fused_rank <= shipped_rank:
                continue
            fused.pop(fused_rank)
            fused.insert(min(shipped_rank, len(fused)), word)
        return fused

    # --------------------------------------------------------- habit slot
    def reserve_habit_slot(self, candidates: List[str], pool: Mapping[str, Features]) -> List[str]:
        if len(candidates) < MAX_WORD_CANDIDATES:
            return candidates
        best: Optional[str] = None
        best_score = -math.inf
        for word, features in pool.items():
            if not (features.personal > 0 or features.caregiver > 0):
                continue
            score = self.habit_score(features)
            if score > best_score or (score == best_score and best is not None and utf16_key(word) < utf16_key(best)):
                best = word
                best_score = score
        if best is None or best in candidates:
            return candidates
        last = candidates[-1]
        if last in self.index.protected_care:
            return candidates
        return [*candidates[:-1], best]

    # --------------------------------------------------------- stable slots
    def stabilize_candidate_slots(
        self,
        ranked_candidates: Sequence[str],
        prefix: str,
        previous_snapshot: Optional[SnapshotLineage] = None,
        slot_count: int = MAX_WORD_CANDIDATES,
    ) -> List[Optional[str]]:
        bounded = max(0, int(math.floor(slot_count)))
        slots: List[Optional[str]] = [None] * bounded

        def eligible(word: str) -> bool:
            return self.is_allowed_word(word) and self.is_prefix_compatible(prefix, word)

        normalized = [normalize_word(word) for word in ranked_candidates]
        ranked: List[str] = []
        for position, word in enumerate(normalized):
            if eligible(word) and normalized.index(word) == position:
                ranked.append(word)

        if is_continuing_prefix(prefix, previous_snapshot):
            previous_slots = previous_snapshot.candidate_slots if previous_snapshot.candidate_slots is not None else previous_snapshot.candidates
            ranked_set = set(ranked)
            for slot_index, candidate in enumerate(list(previous_slots)[:bounded]):
                if not candidate:
                    continue
                word = normalize_word(candidate)
                if word in ranked_set and eligible(word):
                    slots[slot_index] = word

        placed = {word for word in slots if word is not None}
        next_rank = 0
        for slot_index in range(len(slots)):
            if slots[slot_index] is not None:
                continue
            while next_rank < len(ranked) and ranked[next_rank] in placed:
                next_rank += 1
            if next_rank >= len(ranked):
                break
            slots[slot_index] = ranked[next_rank]
            placed.add(ranked[next_rank])
            next_rank += 1
        return slots


@dataclass
class _RankStages:
    prefix: str
    context: ConfirmedContext
    clause_tokens: List[str]
    ranked_all: List[RankedCandidate]
    ranked: List[RankedCandidate]
    legal_pool: Dict[str, Features]
    legal_candidates: Set[str]
    is_policy_eligible: Callable[[str], bool]
    expectation: List[str]
    source_union: List[str]
    recovered: List[str]


def _decision(word: str, family: str, action: str, incumbent: Optional[str]) -> Dict[str, Any]:
    """A diversity decision record; `incumbent` is absent (not null) when unknown, as in JSON from the reference."""
    record: Dict[str, Any] = {'word': word, 'family': family, 'action': action}
    if incumbent is not None:
        record['incumbent'] = incumbent
    return record


def is_continuing_prefix(prefix: str, previous_snapshot: Optional[SnapshotLineage]) -> bool:
    if previous_snapshot is None or not previous_snapshot.prefix or not prefix:
        return False
    return len(prefix) >= len(previous_snapshot.prefix) and prefix.startswith(previous_snapshot.prefix)


def confirmed_history(draft: str, limit: int = CONTEXT_HISTORY_WORDS) -> List[str]:
    """predictionContextWords(): the last confirmed words of the current sentence.

    Table-free, so the backend can record learning context without loading the engine.
    """
    prefix = current_prefix(draft)
    without_prefix = drop_utf16_tail(draft, len(prefix)) if prefix else draft
    return words_in(_SENTENCE_SPLIT.split(without_prefix)[-1])[-limit:]


# ------------------------------------------------------------- editing helpers
def accept_predicted_word(draft: str, word: str) -> str:
    """acceptPredictedWord(): replace only the unfinished word, then one space."""
    prefix = current_prefix(draft)
    before = drop_utf16_tail(draft, len(prefix)) if prefix else draft
    separator = ' ' if before and not ends_with_js_whitespace(before) else ''
    return f'{before}{separator}{word} '
