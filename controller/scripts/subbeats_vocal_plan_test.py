"""Suggested passage handovers only; no audio, models or station writes."""
import unittest
from subbeats_vocal_plan import suggest_handover
from subbeats_matching import find_matches


def passage(start,end,**extra):
    return dict(startSeconds=start,endSeconds=end,activityStartSeconds=start+.2,
                activityEndSeconds=end-.2,openStart=False,openEnd=False,confidence='estimated',**extra)


def activity(passages,start=0,end=120):
    return dict(coverageStartSeconds=start,coverageEndSeconds=end,passages=passages)


class VocalPlanTests(unittest.TestCase):
    def suggestion(self,entry=12,outgoing=None,incoming=None,rate=1.,shift=0):
        return suggest_handover(outgoing if outgoing is not None else activity([passage(21,23.4)]),
            incoming if incoming is not None else activity([passage(2+entry*rate-.2,2+(entry+4)*rate)]),
            dict(cueSeconds=20,leadSeconds=20),dict(cueSeconds=2,leadSeconds=2),
            dict(outCue=20,inCue=2,period=.5,rate=rate),shift)

    def test_direct_and_four_bar_multiple_suggestions_preserve_measured_passages(self):
        direct=self.suggestion(entry=4)
        self.assertEqual((direct['status'],direct['mode'],direct['gapBars']),('suggested','direct',0))
        for entry,gap in [(12,4),(20,8),(28,12)]:
            result=self.suggestion(entry=entry)
            self.assertEqual((result['status'],result['gapBars']),('suggested',gap))
            self.assertEqual(result['outgoingEndSeconds'],23.4)
            self.assertFalse(result['approved'])
            self.assertEqual(result['barAlignment'],'unverified')

    def test_bad_spacing_and_cutting_another_outgoing_passage_are_rejected(self):
        self.assertEqual(self.suggestion(entry=10)['status'],'conflict')
        self.assertEqual(self.suggestion(entry=12.5)['status'],'conflict')
        outgoing=activity([passage(21,23.0),passage(23.2,23.9)])
        self.assertEqual(self.suggestion(entry=4,outgoing=outgoing)['status'],'conflict')

    def test_open_edges_missing_measurements_and_empty_detections_are_not_approved(self):
        incoming=activity([passage(13.8,18)])
        incoming['passages'][0]['openStart']=True
        incoming['passages'].append(passage(21.8,26))
        self.assertEqual(self.suggestion(incoming=incoming)['status'],'coverage','never skip the incomplete first line')
        incoming['passages'].reverse()
        self.assertEqual(self.suggestion(incoming=incoming)['status'],'coverage')
        outgoing=activity([passage(21,120)])
        outgoing['passages'][0]['openEnd']=True
        self.assertEqual(self.suggestion(outgoing=outgoing)['status'],'coverage')
        self.assertEqual(self.suggestion(incoming=activity([]))['status'],'uncertain')
        self.assertEqual(suggest_handover(None,None,{}, {}, {})['status'],'unassessed')

    def test_tempo_and_shift_are_applied_to_incoming_vocal_times(self):
        self.assertEqual(self.suggestion(rate=1.02)['gapBars'],4)
        self.assertEqual(self.suggestion(shift=1)['status'],'conflict')
        incoming=activity([passage(13.8,18)],end=30)
        self.assertEqual(self.suggestion(incoming=incoming)['status'],'coverage')

    def test_matcher_ranks_alternative_suggestion_but_keeps_render_plan_unchanged(self):
        def window(cue,lead,post):return dict(cueSeconds=cue,leadSeconds=lead,postSeconds=post,bpm=120)
        out=dict(id='out',title='out',artist='Artist',status='prepared',suitability=dict(outgoing=dict(
            level='subbeat',windows=[window(100,20,28),window(98,18,30)],
            vocalActivity=activity([passage(101,103.4)],80,160))))
        first=dict(id='suggested',title='Z',artist='Z',status='prepared',suitability=dict(incoming=dict(
            level='subbeat',windows=[window(2,2,56)],vocalActivity=activity([passage(15.8,20.2)],0,90))))
        unknown=dict(id='unknown',title='A',artist='A',status='prepared',suitability=dict(incoming=dict(
            level='subbeat',windows=[window(2,2,56)])))
        matches=find_matches([out,unknown,first],'out')['matches']
        self.assertEqual(matches[0]['id'],'suggested')
        self.assertEqual(matches[0]['plan']['outCue'],20)
        self.assertEqual(matches[0]['vocalSuggestion']['plan']['outCue'],18)
        self.assertEqual(matches[0]['vocalSuggestion']['gapBars'],4)


if __name__ == '__main__':
    unittest.main()
