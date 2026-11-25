from datetime import datetime, timedelta, timezone
from unittest import TestCase
from unittest.mock import patch

import league_feed
import season_forecast

NOW = datetime(2026, 11, 23, tzinfo=timezone.utc)


class LeagueFeedTests(TestCase):
    def test_unreported_games_do_not_look_live(self):
        match = {'kickoff': (NOW - timedelta(minutes=15)).isoformat(), 'state': 'scheduled', 'score': None}
        self.assertEqual(league_feed.match_state(match, NOW, False), 'awaiting')
        match['score'] = [0, 0]
        self.assertEqual(league_feed.match_state(match, NOW, False), 'reported')
        self.assertEqual(league_feed.match_state(match, NOW, True), 'awaiting')
        match['state'] = 'finished'
        self.assertEqual(league_feed.match_state(match, NOW, True), 'finished')

    def test_half_time_score_is_never_used_as_a_confirmed_result(self):
        row = {
            'matchDateTimeUTC': '2026-11-23T00:00:00Z', 'matchID': 42, 'matchIsFinished': True,
            'group': {'groupOrderID': 11}, 'team1': {'teamName': 'Home'}, 'team2': {'teamName': 'Away'},
            'goals': [], 'matchResults': [{'resultOrderID': 1, 'resultTypeKind': 'HalfTime',
                                            'pointsTeam1': 0, 'pointsTeam2': 0}],
        }
        with patch.object(league_feed, 'get_json', return_value=[row]):
            result, = league_feed.openliga_matches(2026, 11)
        self.assertIsNone(result['score'])
        self.assertNotEqual(result['state'], 'finished')

    def test_cache_retains_last_success_after_failed_refresh(self):
        cache = league_feed.CachedRequest()
        result = cache.get(lambda: [1], 60)
        self.assertIs(cache.get(lambda: [2], 60), result)
        cache.expiry = 0

        def fail():
            raise OSError('Provider unavailable')

        snapshot = cache.get(fail, 60)
        self.assertEqual(snapshot.value, result.value)
        self.assertEqual(snapshot.checked_at, result.checked_at)
        self.assertTrue(snapshot.stale)


class ForecastTests(TestCase):
    def test_outage_uses_labeled_real_snapshot_and_consistent_probabilities(self):
        with patch.object(season_forecast, 'current_table', return_value=('OpenLigaDB', league_feed.Snapshot(stale=True))):
            forecast = season_forecast.season_forecast(NOW)
        rows = forecast['rows']
        self.assertEqual((forecast['season'], forecast['input_season']), ('2027/28', '2026/27'))
        self.assertEqual(forecast['input_status'], 'bundled')
        self.assertEqual(len(rows), 20)
        self.assertGreater(forecast['input_matches'], 0)
        self.assertEqual(sorted((row['points'] for row in rows), reverse=True), [row['points'] for row in rows])
        for field, expected_total in [('title', 100), ('top_four', 400), ('bottom_three', 300)]:
            self.assertAlmostEqual(sum(row[field] for row in rows), expected_total, delta=1)
        for row in rows:
            low, high = row['finish_range']
            self.assertTrue(1 <= low <= high <= 20)
            self.assertLessEqual(row['title'], row['top_four'])
