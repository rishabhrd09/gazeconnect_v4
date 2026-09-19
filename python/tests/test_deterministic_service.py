"""Prediction service: lineage, latest-only scheduling, disconnects, worker isolation and recovery."""
import asyncio
import os
import pathlib
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python'))

from main import GazeConnectBackend, ServerConfig  # noqa: E402
from services.deterministic_prediction import worker  # noqa: E402
from services.deterministic_prediction.learning import PredictionLearningStore  # noqa: E402
from services.deterministic_prediction.service import WordPredictionService  # noqa: E402


def make_service(test, execution='inline'):
    temp = tempfile.TemporaryDirectory()
    test.addCleanup(temp.cleanup)
    store = PredictionLearningStore(pathlib.Path(temp.name))
    store.load()
    service = WordPredictionService(store, execution=execution)
    service.start()
    test.addCleanup(service.shutdown)
    return service


class LineageTests(unittest.TestCase):
    def setUp(self):
        self.service = make_service(self)
        self.client = object()

    def predict(self, text, client=None, reset=False):
        return self.service.predict_sync(client or self.client, text, 10, reset)

    def test_slots_persist_while_the_same_word_grows(self):
        first = self.predict('i need w')
        second = self.predict('i need wa')
        self.assertFalse(first['lineage'])
        self.assertTrue(second['lineage'])
        for index, word in enumerate(first['slots']):
            if word and word in second['ranked']:
                self.assertEqual(second['slots'][index], word, f'{word} moved')

    def test_any_other_edit_starts_a_fresh_board(self):
        self.predict('i need wa')
        self.assertFalse(self.predict('i need w')['lineage'])  # deletion
        self.predict('i need wa')
        self.assertFalse(self.predict('i want wa')['lineage'])  # confirmed text changed
        self.predict('i need wa')
        self.assertFalse(self.predict('i need water ')['lineage'])  # word finished
        self.predict('i need wa')
        self.assertFalse(self.predict('i need wat', reset=True)['lineage'])  # navigation reset
        self.assertFalse(self.predict('i need wate', client=object())['lineage'])  # another client

    def test_same_inputs_give_the_same_slots(self):
        sequence = ['', 'i', 'i ', 'i n', 'i ne', 'i nee', 'i need', 'i need ', 'i need w', 'i need wa']
        runs = []
        for _ in range(2):
            self.service.forget_client(self.client)
            runs.append([self.predict(text)['slots'] for text in sequence])
        self.assertEqual(runs[0], runs[1])

    def test_learning_changes_results_only_through_the_state_snapshot(self):
        before = self.predict('i need r', reset=True)['ranked']
        self.assertEqual(before, self.predict('i need r', reset=True)['ranked'])
        self.assertGreater(before.index('rice'), 2)
        for _ in range(12):
            self.service.store.record_accepted_word('rice', 'i need r', 'i need rice ', ['i', 'need'])
        after = self.predict('i need r', reset=True)['ranked']
        self.assertLess(after.index('rice'), before.index('rice'))

    def test_household_context_is_english_only_and_bounded(self):
        counts = self.service.set_context(
            ['Call Papa', 'call papa', 'mujhe pani chahiye', 'Call  Doctor', 42, ''],
            ['Papa', 'Two Words', 'khana', 'Doctor'],
        )
        self.assertEqual(counts, {'phrases': 2, 'words': 2})
        self.assertEqual(self.service._phrases, ['Call Papa', 'Call Doctor'])
        self.assertEqual([item['text'] for item in self.service.content_items()], ['Papa', 'Doctor'])
        self.assertIn('papa', self.predict('call pa', reset=True)['ranked'])


class SchedulingTests(unittest.TestCase):
    def test_only_the_latest_request_is_answered(self):
        service = make_service(self, 'thread')
        client = object()
        gate = threading.Event()
        real = worker.predict

        def slow(request):
            gate.wait(5)
            return real(request)

        async def scenario():
            with mock.patch.object(worker, 'predict', side_effect=slow):
                tasks = [asyncio.create_task(service.predict(client, text)) for text in ('i n', 'i ne', 'i nee')]
                await asyncio.sleep(0.05)
                gate.set()
                return await asyncio.gather(*tasks)

        first, second, third = asyncio.run(scenario())
        self.assertIsNone(first)  # computed, but superseded before delivery
        self.assertIsNone(second)  # superseded before it started
        self.assertEqual(third['prefix'], 'nee')
        self.assertEqual(service.timing_summary()['n'], 1)

    def test_disconnect_discards_in_flight_work_and_lineage(self):
        service = make_service(self, 'thread')
        client = object()
        service.predict_sync(client, 'i need w')
        gate = threading.Event()
        real = worker.predict

        async def scenario():
            with mock.patch.object(worker, 'predict', side_effect=lambda r: (gate.wait(5), real(r))[1]):
                task = asyncio.create_task(service.predict(client, 'i need wa'))
                await asyncio.sleep(0.05)
                service.forget_client(client)
                gate.set()
                return await task

        self.assertIsNone(asyncio.run(scenario()))
        self.assertNotIn(client, service._lineage)
        self.assertNotIn(client, service._tickets)
        self.assertFalse(service.predict_sync(client, 'i need wat')['lineage'])

    def test_worker_process_matches_inline_and_recovers_from_a_crash(self):
        inline = make_service(self)
        process = make_service(self, 'process')
        client = object()

        async def ask(text):
            return await process.predict(client, text, 10, True)

        first = asyncio.run(ask('i need wa'))
        self.assertEqual(first['slots'], inline.predict_sync(client, 'i need wa', 10, True)['slots'])
        for child in list(process._executor._processes.values()):
            child.kill()
            child.join(5)
        recovered = asyncio.run(ask('please call the '))  # BrokenProcessPool -> answered on a thread
        self.assertEqual(recovered['slots'], inline.predict_sync(client, 'please call the ', 10, True)['slots'])
        again = asyncio.run(ask('my back is hu'))  # a fresh worker process
        self.assertEqual(again['slots'], inline.predict_sync(client, 'my back is hu', 10, True)['slots'])


def _pid_alive(pid: int) -> bool:
    if os.name == 'nt':
        import ctypes
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not handle:
            return False
        code = ctypes.c_ulong()
        kernel32.GetExitCodeProcess(handle, ctypes.byref(code))
        kernel32.CloseHandle(handle)
        return code.value == 259  # STILL_ACTIVE
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


PARENT_SCRIPT = '''
import asyncio, sys, tempfile, time
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from services.deterministic_prediction.learning import PredictionLearningStore
from services.deterministic_prediction.service import WordPredictionService
if __name__ == '__main__':
    store = PredictionLearningStore(Path(tempfile.mkdtemp()))
    store.load()
    service = WordPredictionService(store, execution='process')
    service.start()
    asyncio.run(service.predict(object(), 'i need wa'))
    print(next(iter(service._executor._processes)), flush=True)
    time.sleep(60)
'''


class WorkerLifetimeTests(unittest.TestCase):
    def test_worker_exits_when_the_backend_is_killed(self):
        """Electron hard-kills the backend; its prediction worker must not be orphaned."""
        with tempfile.TemporaryDirectory() as temp:
            script = pathlib.Path(temp) / 'parent.py'
            script.write_text(PARENT_SCRIPT, encoding='utf-8')
            parent = subprocess.Popen([sys.executable, str(script), str(ROOT / 'python')],
                                      stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
            try:
                worker_pid = int(parent.stdout.readline())
                self.assertTrue(_pid_alive(worker_pid))
            finally:
                parent.kill()  # TerminateProcess on Windows, SIGKILL elsewhere: no shutdown code runs
                parent.wait(10)
            deadline = time.monotonic() + 10
            while _pid_alive(worker_pid) and time.monotonic() < deadline:
                time.sleep(0.05)
            self.assertFalse(_pid_alive(worker_pid), 'prediction worker outlived its parent')


class RecordingBackend(GazeConnectBackend):
    def __init__(self, config):
        self.sent_messages = []
        super().__init__(config)

    def _send(self, websocket, msg_type, data=None):
        self.sent_messages.append({'type': msg_type, **(data or {})})


class BackendDeliveryTests(unittest.TestCase):
    def backend(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        return RecordingBackend(ServerConfig(
            tobii_enabled=False, tts_enabled=False, log_sessions=False, data_dir=temp.name,
            survey_data_dir=temp.name, prediction_execution='inline', prediction_legacy_data_dirs=[]))

    def run_request(self, backend, websocket, text, **patches):
        async def scenario():
            backend._get_predictions(websocket, text, request_id=3)
            await asyncio.gather(*list(backend._prediction_tasks))
        if patches:
            with mock.patch.object(backend.word_service, 'predict', **patches):
                asyncio.run(scenario())
        else:
            asyncio.run(scenario())

    def test_engine_failure_answers_with_empty_slots_and_phrases(self):
        backend = self.backend()
        websocket = object()
        backend.connected_clients.add(websocket)
        with self.assertLogs('GazeConnect', 'WARNING'):
            self.run_request(backend, websocket, 'i need wa', side_effect=RuntimeError('boom'))
        payload = backend.sent_messages[-1]
        self.assertEqual(payload['type'], 'predictions')
        self.assertEqual(payload['request_id'], 3)
        self.assertEqual(payload['word_slots'], [None] * 10)
        self.assertEqual(payload['words'], [])
        self.assertEqual(payload['prediction']['text'], 'i need wa')
        self.assertIn('I need water', [s['text'] for s in payload['sentences']])

    def test_nothing_is_computed_or_sent_for_a_closed_connection(self):
        backend = self.backend()
        websocket = object()
        with mock.patch.object(backend.word_service, 'predict') as predict:
            self.run_request(backend, websocket, 'i need wa')
        predict.assert_not_called()
        self.assertEqual([m for m in backend.sent_messages if m['type'] == 'predictions'], [])

    def test_connected_client_gets_ten_slots_with_request_metadata(self):
        backend = self.backend()
        websocket = object()
        backend.connected_clients.add(websocket)
        self.run_request(backend, websocket, 'i need wa')
        payload = backend.sent_messages[-1]
        self.assertEqual(len(payload['word_slots']), 10)
        self.assertEqual(payload['prediction']['prefix'], 'wa')
        self.assertEqual([w['word'] for w in payload['words']], [w for w in payload['word_slots'] if w])


if __name__ == '__main__':
    unittest.main()
