import json
import math
from pathlib import Path
import unittest

from subbeats_tempo_plan import (PLAN_VERSION, build_stem_beats_tempo_timeline,
                                 plan_stem_beats_tempo,
                                 stem_beats_source_seconds_at_output)


FIXTURES = Path(__file__).parent / 'fixtures' / 'subbeats-tempo-plan-v1.json'


class StemBeatsTempoPlanTest(unittest.TestCase):
    def test_shared_cross_language_v1_fixtures(self):
        for fixture in json.loads(FIXTURES.read_text()):
            with self.subTest(pair=(fixture['outgoingBpm'], fixture['incomingBpm'])):
                plan = plan_stem_beats_tempo(fixture['outgoingBpm'], fixture['incomingBpm'])
                self.assertEqual(plan['mode'] if plan else None, fixture['mode'])
                if plan is None:
                    continue
                self.assertEqual(plan['planVersion'], PLAN_VERSION)
                for field in ('commonBpm', 'outgoingRate', 'incomingRate', 'symmetricGap'):
                    self.assertTrue(math.isclose(plan[field], fixture[field], rel_tol=0, abs_tol=1e-9), field)
                if 'timelineInput' in fixture:
                    timeline = build_stem_beats_tempo_timeline(plan, fixture['timelineInput'])
                    self.assertIsNotNone(timeline, 'expected complete source coverage')
                    for field, expected in fixture['timeline'].items():
                        actual = timeline[field]
                        if isinstance(expected, (int, float)) and isinstance(actual, (int, float)):
                            self.assertTrue(math.isclose(actual, expected, rel_tol=0, abs_tol=1e-8), field)
                        else:
                            self.assertEqual(actual, expected, field)
                    inputs = fixture['timelineInput']
                    self.assertAlmostEqual(stem_beats_source_seconds_at_output(
                        plan, timeline, 'outgoing', timeline['handoverOutputSeconds']),
                        inputs['handoverSeconds'], places=8)
                    self.assertAlmostEqual(stem_beats_source_seconds_at_output(
                        plan, timeline, 'incoming', timeline['handoverOutputSeconds']),
                        inputs['incomingCueSeconds'], places=8)
                    self.assertAlmostEqual(stem_beats_source_seconds_at_output(
                        plan, timeline, 'outgoing', timeline['outgoingEndOutputSeconds']),
                        inputs['outgoingDurationSeconds'], places=8)
                    self.assertAlmostEqual(stem_beats_source_seconds_at_output(
                        plan, timeline, 'incoming', timeline['incomingReleaseEndOutputSeconds']),
                        timeline['incomingResumeSourceSeconds'], places=8)

    def test_invalid_tempo_values_do_not_produce_an_audition_plan(self):
        self.assertIsNone(plan_stem_beats_tempo(0, 120))
        self.assertIsNone(plan_stem_beats_tempo(float('nan'), 120))


if __name__ == '__main__':
    unittest.main()
