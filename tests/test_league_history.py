from unittest import TestCase

from league_history import club_report, historical_clubs, history_api, query, season_scores, season_summaries


class LeagueHistoryTests(TestCase):
    def test_imported_database_has_integrity_and_coverage(self):
        self.assertEqual(query('PRAGMA integrity_check'), [{'integrity_check': 'ok'}])
        self.assertEqual(query('PRAGMA foreign_key_check'), [])
        seasons = season_summaries()
        self.assertGreaterEqual(len(seasons), 34)
        self.assertEqual([row['year'] for row in reversed(seasons)], list(range(1992, seasons[0]['year'] + 1)))
        original_coverage = [row for row in seasons if row['year'] <= 2025]
        self.assertEqual(sum(row['stored_matches'] for row in original_coverage), 13166)
        self.assertTrue(all(row['expected_matches'] == row['stored_matches'] for row in seasons))
        self.assertTrue(all(row['scoring_leaders'] for row in original_coverage))
        self.assertGreaterEqual(len(historical_clubs()), 51)

    def test_historic_match_and_table_endpoints(self):
        inaugural = history_api('/api/history/seasons/1992')
        self.assertEqual((inaugural['champion'], inaugural['runner_up'], inaugural['champion_points']),
                         ('Manchester United', 'Aston Villa', 84))
        self.assertEqual(len(inaugural['standings']), 22)
        self.assertEqual(len(history_api('/api/history/seasons/1992/matches')['matches']), 462)
        self.assertEqual(len(season_scores(1992, ('manchester-united', 'aston-villa'))['matches']), 2)
        self.assertEqual(len(season_scores(1992, ('manchester-united',))['matches']), 42)
        united = club_report('manchester-united')
        self.assertEqual(sum(row['year'] <= 2025 and row['position'] == 1 for row in united['seasons']), 13)
        self.assertIsNone(history_api('/api/history/seasons/1900'))
