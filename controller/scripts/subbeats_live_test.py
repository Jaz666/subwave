"""No audio stack or network. Exercise exact split samples and real process cancellation."""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import signal
import sys
import tempfile
import time
import types
import unittest

from subbeats_live import split_handoff

# The helper uses only HTTPException from FastAPI. Keep this check usable on
# controller hosts that deliberately have no analyzer Python dependencies.
class HTTPException(Exception):
    def __init__(self, status_code, detail):
        self.status_code = status_code
        super().__init__(detail)

sys.modules['fastapi'] = types.SimpleNamespace(HTTPException=HTTPException)
helper = Path(__file__).resolve().parents[2] / 'docker/analyzer/subbeats_live_service.py'
spec = importlib.util.spec_from_file_location('live_service', helper)
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class SplitChecks(unittest.TestCase):
    def test_identical_overlap_reconstructs_the_original_samples(self):
        audio = [(i*.001, -i*.002) for i in range(5000)]
        outgoing, incoming = split_handoff(audio, 1500, 1000)
        self.assertEqual(outgoing[0], 'out')
        self.assertEqual(incoming[0], 'in')
        self.assertEqual(outgoing[1][-300:], incoming[1][:300])
        for frame, (a, b) in enumerate(zip(outgoing[1][-300:], incoming[1][:300])):
            alpha = frame/299
            for channel in range(2):
                self.assertAlmostEqual(a[channel]*(1-alpha)+b[channel]*alpha, audio[1500+frame][channel])
        self.assertEqual(outgoing[1][:-300]+incoming[1], audio)
        self.assertEqual(split_handoff(audio, 0, 1000), [('in', audio)])
        with self.assertRaises(ValueError):
            split_handoff(audio, 500, 1000)


class Request:
    disconnected = False

    async def is_disconnected(self):
        return self.disconnected


class ProcessChecks(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='subwave-live-deadline-')
        self.root = Path(self.tmp.name)
        (self.root/'transitions').mkdir()
        # This child spawns another process that holds stdout open. A kill of
        # only the direct child leaves communicate() hung and this test fails.
        (self.root/'subbeats_live.py').write_text('''import json, pathlib, subprocess, sys, time
r=json.loads(sys.stdin.readline())
p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(30)'])
root=pathlib.Path(r['stateDir'])
(root/'pid').write_text(str(p.pid))
(root/'transitions'/('.subbeats-'+r['transitionId'])).mkdir()
(root/'transitions'/('subbeats-'+r['transitionId']+'-in.wav')).write_text('partial')
time.sleep(30)
''')
        self.body = dict(stateDir=str(self.root), transitionId='11111111-1111-4111-8111-111111111111',
                         deadlineMs=int(time.time()*1000)+400)

    async def asyncTearDown(self):
        pidfile = self.root/'pid'
        if pidfile.exists():
            try:
                os.kill(int(pidfile.read_text()), signal.SIGKILL)
            except ProcessLookupError:
                pass
        self.tmp.cleanup()

    def assert_clean(self):
        self.assertFalse(service._busy)
        self.assertEqual(list((self.root/'transitions').iterdir()), [])
        pid = int((self.root/'pid').read_text())
        stat = Path(f'/proc/{pid}/stat')
        self.assertTrue(not stat.exists() or stat.read_text().split()[2] == 'Z', 'decoder grandchild must be stopped')

    async def test_deadline_kills_the_entire_group_and_cleans_unpublished_parts(self):
        with self.assertRaises(HTTPException) as error:
            await service.render_live_request(self.body, Request(), sys.executable, str(self.root/'analyze_worker.py'))
        self.assertEqual(error.exception.status_code, 408)
        self.assert_clean()

    async def test_disconnect_kills_work_and_a_busy_request_never_queues(self):
        self.body['deadlineMs'] = int(time.time()*1000)+5000
        request = Request()
        task = asyncio.create_task(service.render_live_request(self.body, request, sys.executable, str(self.root/'analyze_worker.py')))
        for _ in range(100):
            if (self.root/'pid').exists():
                break
            await asyncio.sleep(.01)
        with self.assertRaises(HTTPException) as error:
            await service.render_live_request(self.body, Request(), sys.executable, str(self.root/'analyze_worker.py'))
        self.assertEqual(error.exception.status_code, 409)
        request.disconnected = True
        with self.assertRaises(HTTPException):
            await task
        self.assert_clean()


if __name__ == '__main__':
    unittest.main()
