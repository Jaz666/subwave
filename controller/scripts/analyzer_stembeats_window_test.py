#!/usr/bin/env python3
"""Stem Beats starts with the same sample-counted decode as its renderer."""
import contextlib
import json
import os
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyze_worker as aw  # noqa: E402


class Source:
    complete = True
    duration_s = 10

    def __init__(self, path):
        self.path = str(path)

    def load(self, _librosa, *, sr, mono, offset, duration):
        raise AssertionError("Stem Beats must not seek compressed audio by timestamp")

    def describe(self):
        return {"kind": "fixture", "complete": True}


class Separator:
    def separate(self, audio, *, device):
        assert device == "cpu"
        return {name: np.zeros_like(audio) for name in ("drums", "bass", "other", "vocals")}


def main():
    with tempfile.TemporaryDirectory(prefix="analyzer-stembeats-window-") as temporary:
        root = Path(temporary)
        source_path = root / "source.mp3"
        source_path.write_bytes(b"source")
        destination = root / "outgoing"
        destination.mkdir()
        (root / ".subwave-stembeats").touch()
        request = {"version": 1, "side": "tail", "start_ms": 1000, "end_ms": 3000,
                   "key": "a" * 64, "model": aw.DEMUCS_MODEL}
        expected = round(2 * aw.DEMUCS_SR)
        calls = []

        def load_audio(_librosa, path, *, sr, mono):
            assert sr == aw.DEMUCS_SR and mono is False
            if path == "counted.wav":
                return np.zeros((2, expected), dtype=np.float32), sr
            return np.zeros((2, expected - 10), dtype=np.float32), sr

        with patch.object(aw, "extract_tail_window", side_effect=AssertionError("timestamp seek")), \
             patch.object(aw, "extract_window_by_count", side_effect=lambda *_: calls.append("count") or "counted.wav"), \
             patch.object(aw, "load_audio", side_effect=load_audio), \
             patch.object(aw, "get_vocal_detector", return_value=Separator()), \
             patch.object(aw, "write_stems"), \
             patch.object(aw.os, "remove") as remove, \
             patch.object(aw, "shared_output", side_effect=lambda path: contextlib.nullcontext(path)):
            evidence = aw._extract_bounded_stem_window(None, Source(source_path), request, str(destination), "stembeats")

        assert calls == ["count"], calls
        remove.assert_called_once_with("counted.wav")
        assert evidence["samples"] == expected
        assert json.loads((destination / "tail-stembeats.json").read_text())["samples"] == expected
        print("Stem Beats sample-counted decode recovery: ok")


if __name__ == "__main__":
    main()
