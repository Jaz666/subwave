"""A single CPU-only handoff lane; busy requests decline without queueing.

The one-shot process group includes downloads, decoders and Rubber Band. Kill
the whole group on deadline/disconnect so abandoned work never occupies a pool
member or publishes a late transition.
"""
import asyncio
import json
import os
from pathlib import Path
import shutil
import signal
import time

from fastapi import HTTPException

_busy = False


async def render_live_request(body, request, python, worker):
    global _busy
    if _busy:
        raise HTTPException(409, 'The live handoff renderer is busy.')
    budget = min(120., (body['deadlineMs'] - time.time() * 1000) / 1000)
    if budget <= 0:
        raise HTTPException(408, 'The live handoff deadline has passed.')
    deadline = time.monotonic() + budget
    _busy = True
    proc = None
    creation = None
    communication = None
    completed = False
    try:
        creation = asyncio.create_task(asyncio.create_subprocess_exec(
            python, str(Path(worker).with_name('subbeats_live.py')),
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL, start_new_session=True,
            env={**os.environ, 'OMP_NUM_THREADS': '1', 'OPENBLAS_NUM_THREADS': '1', 'NUMBA_NUM_THREADS': '1'},
        ))
        proc = await asyncio.shield(creation)
        communication = asyncio.create_task(proc.communicate((json.dumps(body) + '\n').encode()))
        while not communication.done():
            if time.monotonic() >= deadline or await request.is_disconnected():
                raise HTTPException(408, 'The live handoff deadline or request ended.')
            await asyncio.wait({communication}, timeout=min(.1, max(0., deadline - time.monotonic())))
        out, _ = await communication
        if proc.returncode or len(out) > 128 * 1024:
            raise HTTPException(422, 'The live handoff could not be rendered.')
        result = json.loads(out.decode().strip().splitlines()[-1])
        completed = True
        return result
    finally:
        try:
            if proc is None and creation is not None:
                try:
                    proc = await creation
                except Exception:
                    pass
            if proc:
                # Also kill orphaned descendants if the direct child exited first.
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                await proc.wait()
            if communication:
                await asyncio.gather(communication, return_exceptions=True)
            root = Path(body['stateDir']) / 'transitions'
            shutil.rmtree(root / f".subbeats-{body['transitionId']}", ignore_errors=True)
            if not completed:
                for role in ('out', 'in'):
                    (root / f"subbeats-{body['transitionId']}-{role}.wav").unlink(missing_ok=True)
        finally:
            _busy = False
