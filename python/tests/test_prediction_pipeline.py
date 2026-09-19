import pathlib
import sys
import tempfile
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from main import GazeConnectBackend, ServerConfig  # noqa: E402

# What the renderer sends from the default customization (People board names and
# a few of their board phrases); see src/utils/predictionContext.ts.
HOUSEHOLD_WORDS = ['Rishabh', 'Bhawana', 'Parakh', 'Caretaker', 'Nurse', 'Doctor']
HOUSEHOLD_PHRASES = ['Call Rishabh', 'Call Bhawana', 'Call Parakh', 'Parakh come here',
                     'Talk to Parakh', 'Call Nurse', 'Call Doctor', 'Change my position']


class RecordingBackend(GazeConnectBackend):
    def __init__(self, config: ServerConfig):
        self.sent_messages = []
        super().__init__(config)

    def _send(self, websocket, msg_type: str, data=None):
        payload = {'type': msg_type}
        if data:
            payload.update(data)
        self.sent_messages.append(payload)


def make_backend(test: unittest.TestCase, **overrides) -> RecordingBackend:
    temp_dir = tempfile.TemporaryDirectory()
    test.addCleanup(temp_dir.cleanup)
    cfg = ServerConfig(
        tobii_enabled=False,
        tts_enabled=False,
        log_sessions=False,
        data_dir=temp_dir.name,
        survey_data_dir=temp_dir.name,
        prediction_execution='inline',
        # Never migrate from a developer's real ./data during tests.
        prediction_legacy_data_dirs=[],
        **overrides,
    )
    return RecordingBackend(cfg)


class PredictionPipelineTests(unittest.TestCase):
    """Deterministic engine (the default): words and phrases travel separately."""

    def _backend(self) -> RecordingBackend:
        return make_backend(self)

    def test_empty_text_returns_word_board_and_starter_phrases_separately(self):
        backend = self._backend()

        backend._get_predictions(None, '', request_id=7)

        payload = backend.sent_messages[-1]
        self.assertEqual(payload['type'], 'predictions')
        self.assertEqual(payload['request_id'], 7)
        words = [item['word'] for item in payload['words']]
        self.assertEqual(len(payload['word_slots']), 10)
        self.assertTrue(words)
        self.assertTrue(all(' ' not in word for word in words), words)
        starters = {item['text']: item for item in payload['sentences']}
        self.assertIn('I need', starters)
        self.assertEqual(starters['I need']['mode'], 'append')

    def test_history_sentence_contributes_starter_stem(self):
        backend = self._backend()
        backend._learn_sentence('Please check oxygen')

        backend._get_predictions(None, '', request_id=9)

        payload = backend.sent_messages[-1]
        self.assertIn('Please check', [item['text'] for item in payload['sentences']])

    def test_non_empty_predictions_preserve_request_id(self):
        backend = self._backend()

        backend._get_predictions(None, 'I need ', request_id=11)

        payload = backend.sent_messages[-1]
        self.assertEqual(payload['type'], 'predictions')
        self.assertEqual(payload['request_id'], 11)
        self.assertGreater(len(payload['words']), 0)
        self.assertEqual(payload['prediction']['text'], 'I need ')

    def test_datamuse_is_disabled_by_default(self):
        backend = self._backend()
        self.assertFalse(backend.config.enable_datamuse)

        with mock.patch('main.asyncio.create_task') as create_task:
            backend._get_predictions(None, 'I need ', request_id=3)
            create_task.assert_not_called()

    def test_learn_sentence_deduplicates_quick_repeats_and_updates_topics(self):
        backend = self._backend()

        backend._learn_sentence('I am in pain')
        backend._learn_sentence('I am in pain')

        matches = [
            item for item in backend.sentence_predictor.history
            if item['text'].lower() == 'i am in pain'
        ]
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0].get('count', 1), 1)

        topic_boosts = backend._session_topics.get_boosts('I')
        self.assertIn('medical', topic_boosts)

    def test_can_i_space_prefers_sentence_like_next_words(self):
        backend = self._backend()

        backend._get_predictions(None, 'can i ', request_id=12)

        payload = backend.sent_messages[-1]
        words = [item['word'].lower() for item in payload['words'][:5]]
        self.assertTrue(any(word in words for word in ('have', 'get', 'rest')))

    def test_blocked_phrase_is_not_learned_and_supplies_is_not_suggested(self):
        backend = self._backend()

        backend._learn_sentence('rishabh more supplies')
        backend._get_predictions(None, 'more ', request_id=13)

        history_texts = [item['text'].lower() for item in backend.sentence_predictor.history]
        self.assertNotIn('rishabh more supplies', history_texts)

        payload = backend.sent_messages[-1]
        words = [item['word'].lower() for item in payload['words']]
        self.assertNotIn('supplies', words)

    def test_rishabh_remains_available_in_meaningful_family_context(self):
        backend = self._backend()

        backend._get_predictions(None, 'call ', request_id=14)

        payload = backend.sent_messages[-1]
        sentence_texts = [item['text'].lower() for item in payload['sentences']]
        self.assertIn('call rishabh', sentence_texts)

    def test_household_names_reach_the_ten_slots_from_board_configuration(self):
        backend = self._backend()
        backend._set_prediction_context(None, HOUSEHOLD_PHRASES, HOUSEHOLD_WORDS)

        backend._get_predictions(None, 'call p', request_id=15)
        payload = backend.sent_messages[-1]
        self.assertIn('call parakh', [item['text'].lower() for item in payload['sentences']])

        backend._get_predictions(None, 'call pa', request_id=16)
        words = [item['word'] for item in backend.sent_messages[-1]['words']]
        self.assertIn('parakh', words)  # within the ten visible slots once two letters are typed

    def test_screen_specific_urgent_phrase_is_available(self):
        backend = self._backend()

        backend._get_predictions(None, 'tt ', request_id=16)

        payload = backend.sent_messages[-1]
        sentence_texts = [item['text'].lower() for item in payload['sentences']]
        self.assertIn('tt suction needed now', sentence_texts)

    def test_sentence_templates_take_priority_over_noisy_neural_extra(self):
        backend = self._backend()

        backend._get_predictions(None, 'can i ', request_id=17)

        payload = backend.sent_messages[-1]
        sentence_texts = [item['text'].lower() for item in payload['sentences']]
        self.assertIn('can i have water', sentence_texts)
        self.assertNotIn('can i need to go to', sentence_texts)

    def test_word_list_is_not_reordered_by_sentence_suggestions(self):
        backend = self._backend()

        backend._get_predictions(None, 'can i ', request_id=18)
        payload = backend.sent_messages[-1]
        from services.deterministic_prediction import worker
        expected = worker.predict({'draft': 'can i ', 'slot_count': 10})['ranked']
        self.assertEqual([item['word'] for item in payload['words']], expected)

    def test_abbreviation_is_a_phrase_suggestion_that_replaces_the_shortcut(self):
        backend = self._backend()

        backend._get_predictions(None, 'I need gm', request_id=19)

        payload = backend.sent_messages[-1]
        abbreviation = [item for item in payload['sentences'] if item['source'] == 'abbreviation']
        self.assertEqual(abbreviation[0]['text'], 'Good morning')
        self.assertEqual(abbreviation[0]['mode'], 'replace_token')
        self.assertEqual(abbreviation[0]['token'], 'gm')
        self.assertTrue(all(' ' not in item['word'] for item in payload['words']))

    def test_hinglish_abbreviation_and_templates_are_not_offered(self):
        backend = self._backend()

        self.assertIsNone(backend.prediction.expand_abbreviation('mpc'))  # "Mujhe pani chahiye"
        self.assertEqual(backend.prediction.expand_abbreviation('gm'), 'Good morning')
        backend._get_predictions(None, 'mpc', request_id=20)
        texts = [item['text'] for item in backend.sent_messages[-1]['sentences']]
        self.assertFalse(any('pani' in text.lower() for text in texts))

    def test_neural_model_is_not_initialized_by_default(self):
        backend = self._backend()
        self.assertEqual(backend.prediction.get_neural_model_info()['status'], 'not_loaded')
        self.assertFalse(backend.config.enable_neural_sentence_continuation)


class LegacyRollbackPipelineTests(unittest.TestCase):
    """`--prediction-engine legacy` keeps the previous behaviour for rollback."""

    def _backend(self) -> RecordingBackend:
        return make_backend(self, prediction_engine='legacy')

    def test_empty_text_returns_starter_predictions_with_request_id(self):
        backend = self._backend()

        backend._get_predictions(None, '', request_id=7)

        payload = backend.sent_messages[-1]
        self.assertEqual(payload['request_id'], 7)
        starter_words = [item['word'] for item in payload['words']]
        self.assertIn('I need', starter_words)

    def test_call_prefix_reaches_other_default_people(self):
        backend = self._backend()

        backend._get_predictions(None, 'call p', request_id=15)

        payload = backend.sent_messages[-1]
        sentence_texts = [item['text'].lower() for item in payload['sentences']]
        words = [item['word'].lower() for item in payload['words'][:5]]
        self.assertIn('call parakh', sentence_texts)
        self.assertIn('parakh', words)
        self.assertIsNone(backend.word_service)


if __name__ == '__main__':
    unittest.main()
