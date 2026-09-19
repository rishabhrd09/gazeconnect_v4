"""Word-slot content policy: the reference policy, GazeConnect guardrails and English-only display."""
import json
import pathlib
import re
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python'))

from prediction_guardrails import BLOCKED_PREDICTION_WORDS, is_blocked_prediction_word  # noqa: E402
from services.deterministic_prediction import worker  # noqa: E402
from services.deterministic_prediction.assets_loader import default_asset_dir, load_asset  # noqa: E402
from services.deterministic_prediction.engine import DeterministicPredictionEngine  # noqa: E402
from services.deterministic_prediction.policy import (  # noqa: E402
    CATEGORY_CLINICAL,
    CATEGORY_NEVER,
    CATEGORY_ORDINARY,
    CATEGORY_PERSONAL,
    GazeConnectWordPolicy,
    ReferenceWordPolicy,
    load_english_only_withheld,
)
from services.deterministic_prediction.service import EnglishOnlyText  # noqa: E402

# Symptom/safeguarding words the reference treats as ordinary but GazeConnect's
# guardrails block from word slots (documented in docs/deterministic-prediction/README.md).
DOCUMENTED_CONFLICTS = [
    'attack', 'hit', 'kick', 'kicked', 'kicking', 'punch', 'punched', 'slap', 'slapped', 'embarrassed',
    'empty', 'depressed', 'suicide', 'suicidal', 'die', 'dying', 'death', 'dead', 'shot', 'overwhelmed',
    'tense', 'terrified', 'fat', 'supplies',
]


def predict(draft):
    return worker.predict({'draft': draft, 'slot_count': 10, 'state': {}, 'phrases': [], 'content_items': []})['ranked']


class ReferencePolicyTests(unittest.TestCase):
    def setUp(self):
        self.policy = ReferenceWordPolicy(['badword'], ['choking', 'abuse'], ['lonely'])

    def test_categories(self):
        self.assertEqual(self.policy.category('badword'), CATEGORY_NEVER)
        self.assertEqual(self.policy.category('choking'), CATEGORY_CLINICAL)
        self.assertEqual(self.policy.category('lonely'), CATEGORY_PERSONAL)
        self.assertEqual(self.policy.category('water'), CATEGORY_ORDINARY)

    def test_context_gating(self):
        eligible = self.policy.eligible
        self.assertFalse(eligible('badword', 7, True, True))
        self.assertTrue(eligible('water', 0, False, False))
        self.assertFalse(eligible('choking', 1, False, False))  # one letter is not enough
        self.assertTrue(eligible('choking', 2, False, False))
        self.assertTrue(eligible('choking', 1, True, False))  # locally personalised
        self.assertTrue(eligible('choking', 0, False, True))  # sensitive context
        self.assertFalse(eligible('lonely', 0, False, True))  # personal words are not context-offered
        self.assertTrue(eligible('lonely', 2, False, False))


class GazeConnectPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        worker.ensure()
        cls.engine = DeterministicPredictionEngine()
        cls.withheld = load_english_only_withheld()

    def test_production_policy_is_the_gazeconnect_policy(self):
        self.assertIsInstance(worker.engine().policy, GazeConnectWordPolicy)

    def test_documented_conflicts_are_ordinary_in_the_reference_and_blocked_here(self):
        policy = worker.engine().policy
        for word in DOCUMENTED_CONFLICTS:
            with self.subTest(word=word):
                self.assertEqual(self.engine.reference_policy.category(word), CATEGORY_ORDINARY)
                self.assertTrue(is_blocked_prediction_word(word))
                self.assertFalse(policy.eligible(word, 5, True, True))

    def test_blocked_words_never_reach_word_slots(self):
        cases = {'she h': 'hit', 'i feel depre': 'depressed', 'my stomach is ': 'empty', 'i was ki': 'kills',
                 'i am emb': 'embarrassed', 'we need more sup': 'supplies', 'you are stu': 'stupid'}
        for draft, word in cases.items():
            with self.subTest(draft=draft):
                self.assertNotIn(word, predict(draft))

    def test_reference_never_suggested_words_stay_blocked(self):
        policy = worker.engine().policy
        for word in self.engine.tables.never_suggested_words:
            self.assertFalse(policy.eligible(word, 9, True, True), word)

    def test_every_lexicon_form_of_a_blocked_word_is_blocked(self):
        """Adding a word to prediction_guardrails.py must also cover its lexicon inflections."""
        index = load_asset('index')
        lemma = dict(index['lemmaByWord'])
        vocabulary = set(lemma) | {word for word, _ in index['entries']}
        english = {word for word in BLOCKED_PREDICTION_WORDS if word.isascii()}

        def forms(word):
            out = {word + suffix for suffix in ('s', 'es', 'ed', 'd', 'ing', 'er', 'ers', 'ly')}
            if word.endswith('e'):
                out |= {word[:-1] + suffix for suffix in ('ing', 'ed', 'er')}
            if word.endswith('y'):
                out |= {word[:-1] + suffix for suffix in ('ies', 'ied', 'ier')}
            if re.search(r'[^aeiou][aeiou][bdgklmnprt]$', word):
                out |= {word + word[-1] + suffix for suffix in ('ing', 'ed', 'er', 'ers')}
            return out

        missing = sorted({w for w, base in lemma.items() if base in english} | {f for w in english for f in forms(w) if f in vocabulary})
        self.assertEqual([word for word in missing if not is_blocked_prediction_word(word)], [])

    def test_romanized_hindi_is_withheld_but_english_homographs_are_not(self):
        policy = worker.engine().policy
        for word in ('khana', 'pani', 'accha', 'bahut', 'chahiye', 'mujhe', 'nahi', 'dawai', 'dard', 'kya'):
            with self.subTest(word=word):
                self.assertIn(word, self.withheld)
                self.assertFalse(policy.eligible(word, 5, True, True))
        # English homographs, place names and Indian English in the English lexicon stay available.
        for word in ('pet', 'mat', 'papa', 'mama', 'tab', 'paneer', 'diwali', 'indore', 'roti', 'chai', 'khichdi', 'kirana'):
            with self.subTest(word=word):
                self.assertNotIn(word, self.withheld)
        for draft in ('i need kh', 'mujhe pa', 'aap ', 'i want kha'):
            with self.subTest(draft=draft):
                self.assertEqual([w for w in predict(draft) if w in self.withheld], [])

    def test_english_only_policy_file(self):
        data = json.loads((default_asset_dir().parent / 'english_only_policy.v1.json').read_text(encoding='utf-8'))
        words = data['withheldRomanizedHindi']
        self.assertEqual(words, sorted(set(words)))
        self.assertTrue(all(re.fullmatch(r"[a-z']+", word) for word in words))
        self.assertGreater(len(words), 400)
        excluded = data['excluded']
        for group in ('properNounAllowlist', 'englishHomographs', 'indianEnglishTerms'):
            self.assertEqual(set(excluded[group]) & set(words), set(), group)

    def test_phrase_level_english_only_filter(self):
        english = EnglishOnlyText(load_english_only_withheld())
        self.assertTrue(english.allows('I need water'))
        self.assertTrue(english.allows('Call Papa'))
        self.assertFalse(english.allows('mujhe pani chahiye'))
        self.assertFalse(english.allows('मुझे पानी चाहिए'))
        self.assertFalse(english.allows(''))


if __name__ == '__main__':
    unittest.main()
