import unittest
from subbeats_vocal_confidence import assess_pair, boundary_assessment


def activity(start, end, spans):
    return dict(coverageStartSeconds=start, coverageEndSeconds=end, resolutionSeconds=.05,
                passages=[dict(startSeconds=a, endSeconds=b) for a, b in spans])


class ConfidenceTests(unittest.TestCase):
    def setUp(self):
        self.plan = dict(first=100., entry=100., out_end=120., end=125., rate=1., period=.5)

    def test_short_overlap_is_allowed_even_with_reviewed_boundaries(self):
        fit = assess_pair(activity(100,120,[(110,115)]),activity(0,30,[(13,18)]),self.plan,
                          dict(reviewedTailSeconds=115),dict(reviewedHeadSeconds=13))
        self.assertEqual(fit['confidence'],'high')
        self.assertEqual(fit['overlapSeconds'],2.)
        self.assertNotEqual(fit['status'],'conflict')

    def test_long_energy_only_overlap_is_low_and_still_auditionable(self):
        fit=assess_pair(activity(100,120,[(110,119)]),activity(0,30,[(10,20)]),self.plan)
        self.assertEqual(fit['confidence'],'low')
        self.assertEqual(fit['status'],'uncertain')
        self.assertEqual(fit['overlapSeconds'],9.)
        fit=assess_pair(activity(100,120,[(110,119)]),activity(0,30,[(10,20)]),self.plan,
                        dict(reviewedTailSeconds=119),dict(reviewedHeadSeconds=10))
        self.assertEqual(fit['status'],'conflict')

    def test_head_version_disagreement_does_not_invalidate_independent_tail(self):
        evidence=dict(firstSeconds=1.,lastStartSeconds=112.,versionConfidence='medium',firstSpreadSeconds=8.,tailSpreadSeconds=0.)
        head,_=boundary_assessment(activity(0,20,[(1,5)]),evidence,'head',0,20,2)
        tail,_=boundary_assessment(activity(100,120,[(110,118)]),evidence,'tail',100,120,2)
        self.assertEqual(head['confidence'],'low')
        self.assertEqual(tail['confidence'],'medium')
        self.assertEqual(tail['lastSeconds'],118.,'final lyric start at 112 is not used as the vocal end')

    def test_missing_partial_and_original_mix_coverage_never_becomes_silence(self):
        for outgoing in (None,activity(110,120,[]),{**activity(100,120,[(100,110)]),'unmeasuredUntilSeconds':110}):
            fit=assess_pair(outgoing,activity(0,30,[]),self.plan,dict(instrumental=True),dict(instrumental=True))
            self.assertIn(fit['status'],('unassessed','coverage'))
            self.assertIn(fit['confidence'],('low','unknown'))

    def test_tempo_conversion_and_union_avoid_counting_the_same_overlap_twice(self):
        self.plan['rate']=2.
        fit=assess_pair(activity(100,120,[(110,115),(112,116)]),activity(0,50,[(20,30),(22,32)]),self.plan)
        self.assertEqual(fit['overlapSeconds'],6.)
        self.assertEqual(fit['longestOverlapSeconds'],6.)

    def test_reviewed_head_does_not_promote_unmeasured_duration_to_high(self):
        for onset in (0.,1.):
            head,_=boundary_assessment(activity(0,20,[]),dict(reviewedHeadSeconds=onset),'head',0,20,2)
            self.assertEqual(head['confidence'],'low')
            self.assertEqual(head['boundaryVocal'],'likely')
        tail,_=boundary_assessment(activity(0,20,[]),dict(reviewedTailSeconds=20.),'tail',0,20,2)
        self.assertEqual(tail['confidence'],'low')


if __name__=='__main__':
    unittest.main()
