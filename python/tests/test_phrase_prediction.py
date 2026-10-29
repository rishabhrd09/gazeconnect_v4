"""Phrase meaning, edit operations, personalization, and word-lane isolation."""
import asyncio
import json
import pathlib
import sys
import tempfile
import unittest
from unittest import mock
ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python'))
from services.phrase_prediction import suggest_phrases, sentence_start
from services.sentence_prediction import SentencePredictor
from services.deterministic_prediction import worker
from services.deterministic_prediction.learning import PredictionLearningStore
from test_prediction_pipeline import make_backend


class PhraseMeaningTests(unittest.TestCase):
    def suggestions(self, draft, configured=(), **context):
        return suggest_phrases(draft, context, configured)

    def test_second_sentence_preserves_every_authored_character(self):
        draft = 'I am cold.  i NEED wa'
        row = next(s for s in self.suggestions(draft) if s['text'] == 'I need water')
        self.assertEqual(row['result_text'], 'I am cold.  i NEED water ')
        self.assertEqual(row['matched_text'], draft)
        self.assertEqual(row['replacement_start'], len('I am cold.  '))
        self.assertEqual(row['mode'], 'complete_sentence')

    def test_keyword_expansion_is_explicit_and_does_not_duplicate_the_keyword(self):
        rows = self.suggestions('suction')
        row = next(s for s in rows if s['text'] == 'I need suction')
        self.assertEqual(row['result_text'], 'I need suction ')
        self.assertEqual(row['mode'], 'replace_sentence')
        self.assertTrue(row['requires_confirmation'])

    def test_confirmed_tokens_and_negation_are_never_guessed_away(self):
        for draft in ['I do not want water', 'do not suction', 'I want my cushion', 'i nee ', 'please turn off ']:
            for row in self.suggestions(draft):
                self.assertNotEqual(row['mode'], 'replace_sentence', (draft, row))
                self.assertTrue(row['result_text'].startswith(draft), (draft, row))
        self.assertEqual(self.suggestions('i nee '), [])

    def test_complete_phrase_does_not_starve_continuations(self):
        for draft in ['I need water', 'I need water ', 'I NEED WATER. ']:
            self.assertNotIn('I need water', [s['text'] for s in self.suggestions(draft)])
        rows = self.suggestions('I want to eat ', ['I want to eat', 'I want to eat poha'])
        self.assertIn('I want to eat poha', [s['text'] for s in rows])
        self.assertNotIn('I want to eat', [s['text'] for s in rows])

    def test_saved_phrases_and_single_use_history_are_reachable(self):
        rows = self.suggestions('Could you bring my gl', ['Could you bring my glasses'])
        self.assertEqual(rows[0]['text'], 'Could you bring my glasses')
        self.assertEqual(rows[0]['source'], 'configured')
        rows = self.suggestions('cushion', history=[{'text': 'Please adjust my cushion', 'count': 1}])
        self.assertIn('Please adjust my cushion', [s['text'] for s in rows])

    def test_disabled_priority_and_explicit_keywords_affect_only_phrases(self):
        items = [{'text': 'Bring my spectacles', 'keywords': ['glasses'], 'priority': 5},
                 {'text': 'Bring my reading glasses', 'enabled': False}]
        rows = suggest_phrases('glasses', {}, ['Bring my reading glasses'], items)
        self.assertEqual(rows[0]['text'], 'Bring my spectacles')
        self.assertNotIn('Bring my reading glasses', [s['text'] for s in rows])
        rows = suggest_phrases('Bring ', {}, [], [{'text': 'Bring water', 'priority': 0}, {'text': 'Bring tea', 'priority': 5}])
        self.assertEqual(rows[0]['text'], 'Bring tea')
        rows = suggest_phrases('i need wa', {'history': [{'text': 'I need water', 'count': 8}]},
            ['I need water'], [{'text': 'I need water', 'enabled': False}])
        self.assertNotIn('I need water', [s['text'] for s in rows])

    def test_starters_are_literal_and_preserve_refusal(self):
        self.assertIn('Can you bring me', [s['text'] for s in self.suggestions('Can you bri')])
        for row in self.suggestions('I do not '):
            self.assertTrue(row['result_text'].lower().startswith('i do not '))
        self.assertEqual(self.suggestions('not'), [])

    def test_suffix_matching_keeps_on_and_off_separate(self):
        rows = self.suggestions('please turn o')
        self.assertIn('Please turn on the fan', [s['text'] for s in rows])
        self.assertIn('Please turn off the light', [s['text'] for s in rows])
        self.assertTrue(all(s['result_text'].lower().startswith('please turn o') for s in rows))

    def test_unicode_offsets_whitespace_and_sentence_boundaries(self):
        draft = '😊 Fine! i need wa'
        row = next(s for s in self.suggestions(draft) if s['text'] == 'I need water')
        self.assertEqual(row['replacement_start'], len('😊 Fine! '.encode('utf-16-le')) // 2)
        self.assertEqual(row['result_text'], '😊 Fine! i need water ')
        self.assertEqual(sentence_start('Call Dr. Rishabh'), 0)
        self.assertEqual(sentence_start('The value is 3.5 and i need wa'), 0)
        row = next(s for s in self.suggestions('i  need\twa') if s['text'] == 'I need water')
        self.assertEqual(row['result_text'], 'i  need\twater ')

    def test_blocked_and_non_english_saved_content_cannot_bypass_policy(self):
        phrases = ['I need water', 'I need pani', 'I need supplies']
        self.assertEqual([s['text'] for s in self.suggestions('i need ', phrases) if s['source'] == 'configured'], ['I need water'])

    def test_duplicate_sources_collapse_to_one_edit(self):
        rows = self.suggestions('i need wa', ['I need water', 'I need water.'], history=[{'text': 'I need water', 'count': 5}])
        self.assertEqual(sum(s['text'].rstrip('.') == 'I need water' for s in rows), 1)

    def test_legacy_single_use_history_keyword_branch_is_live(self):
        with tempfile.TemporaryDirectory() as temp:
            predictor = SentencePredictor(pathlib.Path(temp))
            predictor.history = [{'text': 'Please adjust my cushion', 'count': 1, 'last_used': 0}]
            self.assertIn('Please adjust my cushion', [s.text for s in predictor.predict('cushion')])


class PhrasePipelineTests(unittest.TestCase):
    def test_real_worker_payload_and_words_are_independent(self):
        backend = make_backend(self)
        backend._set_prediction_context(None, ['Please adjust my cushion'], [])
        before = worker.predict({'draft': 'cushion', 'slot_count': 10, 'phrases': ['Please adjust my cushion']})
        backend._get_predictions(None, 'cushion', request_id=81)
        payload = backend.sent_messages[-1]
        self.assertEqual(payload['request_id'], 81)
        self.assertEqual(payload['word_slots'], before['slots'])
        self.assertIn('Please adjust my cushion', [s['text'] for s in payload['sentences']])

    def test_acceptance_is_reversible_without_spoken_history(self):
        backend = make_backend(self)
        store = backend.prediction.store
        backend._accept_phrase({'text_before': 'i need wa', 'text_after': 'i need water '})
        self.assertEqual(store.snapshot()['acceptedWords'].get('water'), 1)
        self.assertNotIn('need', store.snapshot()['acceptedWords'])
        self.assertEqual(backend.sentence_predictor.history, [])
        backend._undo_word_learning('i need water ', 'i need ')
        self.assertNotIn('water', store.snapshot()['acceptedWords'])
        backend._learn_sentence('i need water')
        self.assertEqual(backend.sentence_predictor.history[0]['count'], 1)

    def test_phrase_failure_does_not_remove_the_word_board(self):
        backend = make_backend(self)
        with mock.patch('services.phrase_prediction.suggest_phrases', side_effect=RuntimeError('injected')):
            backend._get_predictions(None, 'i need wa')
        payload = backend.sent_messages[-1]
        self.assertIn('water', payload['word_slots'])
        self.assertEqual(payload['sentences'], [])

    def test_bad_phrase_context_cannot_break_word_prediction(self):
        backend = make_backend(self)
        backend.word_service._phrase_context = mock.Mock(side_effect=ValueError('bad history'))
        backend._get_predictions(None, 'i need wa')
        self.assertIn('water', backend.sent_messages[-1]['word_slots'])

    def test_contracted_phrase_learning_preserves_tokens_and_undo(self):
        backend = make_backend(self)
        store = backend.prediction.store
        backend._accept_phrase({'text_before': '', 'text_after': 'I’m happy '})
        self.assertEqual(store.snapshot()['acceptedWords'], {"i'm": 1, 'happy': 1})
        backend._undo_word_learning('I’m happy ', '')
        self.assertEqual(store.snapshot()['acceptedWords'], {})

    def test_speak_learns_once_with_or_without_transcript_files(self):
        for keep_logs in (False, True):
            with self.subTest(retain_spoken_logs=keep_logs):
                backend = make_backend(self, retain_spoken_logs=keep_logs)
                backend.tts.speak = mock.Mock()
                # _get_chat_history_dir has legacy fallbacks; keep this test
                # entirely inside its temporary profile, including transcripts.
                transcript_dir = pathlib.Path(backend.config.data_dir) / 'chat_history'
                transcript_dir.mkdir()
                backend._accept_phrase({'text_before': 'I need wa', 'text_after': 'I need water '})
                self.assertEqual(backend.sentence_predictor.history, [])
                backend._speak('I need water ')
                backend.tts.speak.assert_called_once_with('I need water ')
                self.assertEqual(backend.sentence_predictor.history[0]['count'], 1)
                transcripts = list(transcript_dir.glob('spoken_*.log'))
                self.assertEqual(len(transcripts), int(keep_logs))

    def test_transcript_write_failure_does_not_lose_spoken_learning(self):
        backend = make_backend(self, retain_spoken_logs=True)
        backend.tts.speak = mock.Mock()
        with mock.patch.object(backend, '_get_chat_history_dir', side_effect=OSError('injected disk failure')):
            backend._speak('Please bring my glasses')
        self.assertEqual(backend.sentence_predictor.history[0]['text'], 'Please bring my glasses')

    def test_process_and_inline_phrase_payloads_match(self):
        backend = make_backend(self)
        service = backend.word_service
        service.set_context(['Could you bring my glasses'], [])
        expected = service.predict_sync('inline', 'Could you bring my gl', reset_lineage=True)
        service.execution = 'process'
        async def ask():
            return await service.predict('process', 'Could you bring my gl', reset_lineage=True)
        try:
            actual = asyncio.run(ask())
            self.assertEqual(actual['slots'], expected['slots'])
            self.assertEqual(actual['sentences'], expected['sentences'])
        finally:
            service.shutdown()


if __name__ == '__main__': unittest.main()
