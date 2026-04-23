import pathlib
import sys
import tempfile
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from main import GazeConnectBackend, ServerConfig  # noqa: E402


class RecordingBackend(GazeConnectBackend):
    def __init__(self, config: ServerConfig):
        self.sent_messages = []
        super().__init__(config)

    def _send(self, websocket, msg_type: str, data=None):
        payload = {'type': msg_type}
        if data:
            payload.update(data)
        self.sent_messages.append(payload)


class PredictionPipelineTests(unittest.TestCase):
    def _backend(self) -> RecordingBackend:
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        cfg = ServerConfig(
            tobii_enabled=False,
            tts_enabled=False,
            log_sessions=False,
            data_dir=temp_dir.name,
            survey_data_dir=temp_dir.name,
        )
        return RecordingBackend(cfg)

    def test_empty_text_returns_starter_predictions_with_request_id(self):
        backend = self._backend()

        backend._get_predictions(None, '', request_id=7)

        self.assertTrue(backend.sent_messages)
        payload = backend.sent_messages[-1]
        self.assertEqual(payload['type'], 'predictions')
        self.assertEqual(payload['request_id'], 7)
        starter_words = [item['word'] for item in payload['words']]
        self.assertIn('I need', starter_words)
        self.assertGreater(len(starter_words), 0)

    def test_history_sentence_contributes_starter_stem(self):
        backend = self._backend()
        backend._learn_sentence('Please check oxygen')

        backend._get_predictions(None, '', request_id=9)

        payload = backend.sent_messages[-1]
        starter_words = [item['word'] for item in payload['words']]
        self.assertIn('Please check', starter_words)

    def test_non_empty_predictions_preserve_request_id(self):
        backend = self._backend()

        backend._get_predictions(None, 'I need ', request_id=11)

        payload = backend.sent_messages[-1]
        self.assertEqual(payload['type'], 'predictions')
        self.assertEqual(payload['request_id'], 11)
        self.assertGreater(len(payload['words']), 0)

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

    def test_call_prefix_reaches_other_default_people(self):
        backend = self._backend()

        backend._get_predictions(None, 'call p', request_id=15)

        payload = backend.sent_messages[-1]
        sentence_texts = [item['text'].lower() for item in payload['sentences']]
        words = [item['word'].lower() for item in payload['words'][:5]]
        self.assertIn('call parakh', sentence_texts)
        self.assertIn('parakh', words)

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


if __name__ == '__main__':
    unittest.main()
