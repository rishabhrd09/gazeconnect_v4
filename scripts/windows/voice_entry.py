"""Frozen spawned-process speech check: offline, no playback or hardware."""
import json
import multiprocessing


def run_test(pipe):
    try:
        from services.local_voice import self_test
        pipe.send({'ok': True, **self_test()})
    except Exception as exc:
        pipe.send({'ok': False, 'error': repr(exc)})
    finally:
        pipe.close()


if __name__ == '__main__':
    multiprocessing.freeze_support()
    ctx = multiprocessing.get_context('spawn')
    receiver, sender = ctx.Pipe(duplex=False)
    worker = ctx.Process(target=run_test, args=(sender,))
    worker.start()
    sender.close()
    try:
        if not receiver.poll(90):
            raise RuntimeError('Frozen local voice timed out')
        result = receiver.recv()
        if not result['ok']:
            raise RuntimeError(result['error'])
        print(json.dumps(result))
    finally:
        receiver.close()
        worker.join(timeout=5)
        if worker.is_alive():
            worker.terminate()
            worker.join(timeout=5)
