import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from backend.event_classifier import classify, resolve_flight, summarize
from backend.yolo_pipeline import PITCH_CORNERS, VideoError, calibration_specs, upload_response

ROOT = Path(__file__).resolve().parents[1]
CALIBRATION = json.dumps([{'t': 0, 'points': [[0, 0], [1, 0], [1, 1], [0, 1]]}])


class VideoAnalysisTests(unittest.TestCase):
    def test_bundled_sample_has_valid_event_times_and_metrics(self):
        sample = json.loads((ROOT / 'static/data/tactical-sample.json').read_text(encoding='utf-8'))
        frames = sample['frames']
        events = sample['events']
        self.assertGreater(len(frames), 300)
        self.assertTrue(all(a['t'] < b['t'] for a, b in zip(frames, frames[1:])))
        self.assertTrue({'pass', 'save', 'shot', 'counter', 'recovery'}.issubset({e['type'] for e in events}))
        self.assertEqual(summarize(frames, events)['teams'], sample['stats']['teams'])
        self.assertAlmostEqual(sum(t['possession_pct'] for t in sample['stats']['teams'].values()), 100, places=2)
        self.assertGreater(sample['stats']['teams']['home']['prediction_pct'], 50)

    def test_summary_does_not_count_a_pass_before_its_outcome_is_observed(self):
        frames = [{'t': t, 'players': [], 'ball': None} for t in (0, 1, 2)]
        events = [{'type': 'pass', 't': 0.5, 'observed_at': 1.5, 'team': 'home', 'player': 3, 'outcome': 'complete'}]
        self.assertEqual(summarize(frames, events, until=1)['teams']['home']['completed_passes'], 0)
        self.assertEqual(summarize(frames, events, until=2)['teams']['home']['completed_passes'], 1)

    def test_release_towards_net_followed_by_keeper_control_suggests_save(self):
        striker = {'id': 7, 'x': 88, 'y': 34, 'role': 'player', 'team': 'home'}
        keeper = {'id': 12, 'x': 102, 'y': 34, 'role': 'goalkeeper', 'team': 'away'}
        markers = resolve_flight((striker, 0, {'x': 93, 'y': 34}, striker), keeper, keeper, 0.8, True)
        self.assertEqual([marker['type'] for marker in markers], ['shot', 'save'])
        self.assertEqual(markers[1]['player'], 12)

    def test_cut_never_turns_coordinate_jump_into_motion(self):
        player = {'id': 3, 'x': 48, 'y': 34, 'role': 'player', 'team': 'home'}
        frames = [
            {'t': 0, 'ball': player, 'players': [player]},
            {'t': .2, 'ball': player, 'players': [player]},
            {'t': .4, 'cut': True, 'ball': player, 'players': [dict(player, x=50)]},
        ]
        self.assertEqual(classify(frames), [])
        self.assertEqual(frames[-1]['motion'], [])
        self.assertEqual(summarize(frames, [])['tracked_seconds'], 0)

    def test_calibration_and_upload_validation(self):
        self.assertEqual(calibration_specs(CALIBRATION)[0]['points'][2], [1, 1])
        self.assertEqual(PITCH_CORNERS[2], [105, 68])
        with self.assertRaises(VideoError):
            calibration_specs(CALIBRATION.replace('"t": 0', '"t": 4'))
        headers = {'X-Video-Name': 'match.webm', 'X-Pitch-Calibration': CALIBRATION}
        limits = {'available': True, 'max_bytes': 1000, 'max_seconds': 120}
        with patch('backend.yolo_pipeline.capabilities', return_value=limits):
            self.assertEqual(upload_response(io.BytesIO(), 1001, headers)[0], 413)
            self.assertEqual(upload_response(io.BytesIO(b'junk'), 4, headers)[0], 415)


if __name__ == '__main__':
    unittest.main()
