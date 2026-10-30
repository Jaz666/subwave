"""Phrase-count policy and sample placement, without models or real station state."""
import unittest
import numpy as np
from subbeats_phrases import plan_phrase, mix_phrase, phrase_timeline
from subbeats_preview import fit_grid, preserve_cue_phase


class PhraseTests(unittest.TestCase):
    def plan(self, **kwargs):
        values = dict(in_cue=.05, period=.4325, incoming_seconds=68,
                      outgoing_seconds=40, out_cue=1, candidates=[])
        values.update(kwargs)
        return plan_phrase(**values)

    def test_immediate_opening_counts_sixteen_bars_without_inventing_a_change(self):
        plan = self.plan()
        self.assertEqual(plan['bars'], 16)
        self.assertEqual(plan['reference_evidence'], 'counted_opening')
        self.assertAlmostEqual(plan['incoming_reference'], 27.73)
        self.assertEqual(plan['lead_bars'], 4)
        self.assertEqual(plan['loop_bars'], 4)
        self.assertFalse(plan['phrase_verified'])

    def test_structural_destinations_extend_beyond_sixteen_bars_but_keep_legal_counts(self):
        # A 24-bar landmark: eight bars of opening precede a 16-bar exchange.
        event = {'at_seconds': .05 + 96 * .4325, 'strength': 3, 'evidence': ['bass_arrival', 'texture_change']}
        plan = self.plan(candidates=[event])
        self.assertEqual(plan['bars'], 16)
        self.assertEqual(plan['hold_bars'], 8)
        self.assertEqual(plan['lead_bars'], 16)
        self.assertEqual(plan['reference_evidence'], 'structural')
        self.assertAlmostEqual(plan['incoming_start'] + plan['incoming_reference'], plan['lead'] + 64 * plan['period'])
        # A stray one-bar-late event cannot move the automatic alignment.
        event['at_seconds'] = .05 + 68 * .4325
        self.assertEqual(self.plan(candidates=[event])['reference_evidence'], 'counted_opening')

    def test_coverage_selects_eight_or_four_whole_bars_and_declines_partial_bars(self):
        self.assertEqual(self.plan(outgoing_seconds=20)['bars'], 8)
        self.assertEqual(self.plan(outgoing_seconds=10)['bars'], 4)
        with self.assertRaisesRegex(ValueError, 'phrase window'):
            self.plan(outgoing_seconds=7)
        for bars in [(7,), (), (12,)]:
            with self.assertRaisesRegex(ValueError, 'evidence'):
                self.plan(allowed_bars=bars)
        with self.assertRaisesRegex(ValueError, 'phrase window'):
            self.plan(in_cue=5)

    def test_exit_fit_obeys_four_bar_phase_instead_of_latest_arbitrary_kick(self):
        peaks = .1 + np.arange(100) * .5
        cue, period = fit_grid(peaks, 120, 50, True, phrase_origin=.1, reference_period=.5, source_start=0)
        self.assertAlmostEqual(cue, 16.1)
        self.assertAlmostEqual(period, .5)
        self.assertAlmostEqual((cue-.1)/period % 16, 0, places=6)

    def test_manual_shift_is_marked_and_does_not_change_automatic_window_lengths(self):
        original = self.plan(period=.5)
        for shift in range(-2, 3):
            plan = self.plan(period=.5, bar_shift=shift)
            self.assertEqual(plan['bars'], 16)
            self.assertAlmostEqual(plan['incoming_start'] - original['incoming_start'], shift * 2)
            timeline = phrase_timeline(plan, False)
            self.assertEqual(any('manual bar shift' in e['label'] for e in timeline['events']), bool(shift))
            self.assertTrue(all(0 <= e['at'] <= timeline['duration'] and len(e['label']) <= 180 for e in timeline['events']))

    def test_short_window_withholds_outgoing_vocals_instead_of_shortening_vocal_gap(self):
        sr = 1000
        out = {s: np.full((2, 20000), .2 if s == 'vocals' else .1 if s == 'drums' else 0, dtype='float32') for s in ('drums','bass','other','vocals')}
        inc = {s: np.zeros((2, 68000), dtype='float32') for s in out}
        plan = self.plan(outgoing_seconds=20)
        self.assertEqual(plan['bars'], 8)
        audio, withheld = mix_phrase(out, inc, plan, sr)
        self.assertTrue(withheld)
        self.assertAlmostEqual(float(audio[0, round((plan['lead'] + 1) * sr)]), .1, places=5)

    def test_tempo_matching_keeps_the_original_beat_number(self):
        for extra in (0, 3, 16, 65):
            self.assertAlmostEqual(preserve_cue_phase(.02, 1, .025 + extra * .5, .5), .025)
        self.assertAlmostEqual(preserve_cue_phase(4, 2, 2.01 + 3 * .5, .5), 2.01)
        with self.assertRaisesRegex(ValueError, 'beat phase'):
            preserve_cue_phase(.02, 1, .22, .5)

    def test_instrumental_loop_preserves_source_zero_and_has_no_looped_vocals(self):
        sr = 1000
        out = {s: np.zeros((2, 45000), dtype='float32') for s in ('drums','bass','other','vocals')}
        inc = {s: np.zeros((2, 68000), dtype='float32') for s in out}
        out['drums'][:] = .1; out['vocals'][:] = .2
        inc['other'][:, :1000] = .05
        plan = self.plan(in_cue=0, period=.5)
        audio, intro = mix_phrase(out, inc, plan, sr)
        self.assertFalse(intro)
        self.assertAlmostEqual(float(audio[0, 1000]), .1, places=5, msg='lead loop is instrumental')
        start = round(plan['incoming_start'] * sr)
        inc['other'][:] = 0
        without_opening, _ = mix_phrase(out, inc, plan, sr)
        difference = audio - without_opening
        self.assertGreater(float(difference[0, start+500]), 0)
        self.assertEqual(float(difference[0, start+1500]), 0)
        self.assertTrue(np.isfinite(audio).all())
        self.assertLessEqual(float(abs(audio).max()), .981)
        timeline = phrase_timeline(plan, intro)
        self.assertTrue(any('inferred from opening' in e['label'] for e in timeline['events']))
        self.assertTrue(all(0 <= e['at'] <= timeline['duration'] and len(e['label']) <= 180 for e in timeline['events']))
        short = {s: a[:, :1000] for s,a in inc.items()}
        with self.assertRaisesRegex(ValueError, 'coverage'):
            mix_phrase(out, short, plan, sr)
        with self.assertRaisesRegex(ValueError, '4, 8 or 16'):
            mix_phrase(out, inc, {**plan, 'bars': 7}, sr)


if __name__ == '__main__':
    unittest.main()
