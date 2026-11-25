"""Read the completed-season SQLite database shipped with the site."""

import sqlite3
from contextlib import closing
from functools import lru_cache
from pathlib import Path

DATABASE = Path(__file__).resolve().parent / 'data' / 'premier-league-history.sqlite3'
TABLE_CREDIT = {'provider': 'Wikipedia contributors', 'title': 'English football champions',
                'url': 'https://en.wikipedia.org/wiki/List_of_English_football_champions',
                'license': 'CC BY-SA 4.0', 'license_url': 'https://creativecommons.org/licenses/by-sa/4.0/'}
SCORE_CREDIT = {'provider': 'OpenFootball', 'title': 'OpenFootball England', 'url': 'https://github.com/openfootball/england',
                'license': 'CC0 1.0', 'license_url': 'https://creativecommons.org/publicdomain/zero/1.0/'}


def query(sql, parameters=()):
    try:
        with closing(sqlite3.connect(DATABASE.resolve().as_uri() + '?mode=ro', uri=True)) as connection:
            connection.row_factory = sqlite3.Row
            return [dict(row) for row in connection.execute(sql, parameters)]
    except sqlite3.OperationalError:
        if DATABASE.exists():
            raise
        return []


def history_path(year):
    return f'/history/{year}-{(year + 1) % 100:02}'


@lru_cache(maxsize=1)
def season_summaries():
    return query('''
        SELECT s.year, s.label, s.clubs, s.expected_matches, s.stored_matches, s.scoring_leaders,
               c.name AS champion, c.slug AS champion_slug, t.points AS champion_points,
               r.name AS runner_up, bronze.name AS third_place
        FROM season s
        JOIN standing t ON t.year = s.year AND t.position = 1
        JOIN club c ON c.id = t.club_id
        JOIN standing u ON u.year = s.year AND u.position = 2
        JOIN club r ON r.id = u.club_id
        JOIN standing v ON v.year = s.year AND v.position = 3
        JOIN club bronze ON bronze.id = v.club_id
        ORDER BY s.year DESC
    ''')


@lru_cache(maxsize=1)
def title_counts():
    return query('''
        SELECT c.name AS club, c.slug, count(*) AS titles, max(s.label) AS latest_title
        FROM standing t JOIN club c ON c.id = t.club_id JOIN season s ON s.year = t.year
        WHERE t.position = 1
        GROUP BY c.id ORDER BY titles DESC, c.name
    ''')


def source_for(year):
    return query('''
        SELECT src.provider, src.title, src.url, src.license, src.license_url, src.retrieved_at
        FROM season s JOIN source src ON src.id IN (s.table_source, s.score_source)
        WHERE s.year = ? ORDER BY src.id
    ''', (year,))


def season_report(year):
    season = next((row for row in season_summaries() if row['year'] == year), None)
    if not season:
        return None
    rows = query('''
        SELECT t.position, c.name AS club, c.slug, t.played, t.wins, t.draws, t.losses,
               t.goals_for, t.goals_against, t.points
        FROM standing t JOIN club c ON c.id = t.club_id
        WHERE t.year = ? ORDER BY t.position
    ''', (year,))
    return {**season, 'standings': rows, 'sources': source_for(year)}


def season_scores(year, club_slugs=()):
    season = next((row for row in season_summaries() if row['year'] == year), None)
    if not season:
        return None
    sql = '''
        SELECT m.played_on AS date, m.matchweek, h.name AS home, a.name AS away,
               m.home_goals, m.away_goals
        FROM match m JOIN club h ON h.id = m.home_id JOIN club a ON a.id = m.away_id
        WHERE m.year = ?
    '''
    parameters = [year]
    if len(club_slugs) == 1:
        sql += ' AND (? = h.slug OR ? = a.slug)'
        parameters += [club_slugs[0], club_slugs[0]]
    elif len(club_slugs) == 2:
        sql += ' AND ((h.slug = ? AND a.slug = ?) OR (a.slug = ? AND h.slug = ?))'
        parameters += list(club_slugs) * 2
    sql += ' ORDER BY m.played_on, m.matchweek, h.name'
    return {'year': year, 'label': season['label'], 'coverage': season['stored_matches'],
            'expected_matches': season['expected_matches'], 'matches': query(sql, parameters),
            'sources': [source for source in source_for(year) if source['provider'] == 'OpenFootball']}


@lru_cache(maxsize=1)
def historical_clubs():
    return {row['slug']: row['name'] for row in query('SELECT slug, name FROM club ORDER BY name')}


def club_report(slug):
    if slug not in historical_clubs():
        return None
    rows = query('''
        SELECT s.year, s.label, t.position, t.played, t.wins, t.draws, t.losses,
               t.goals_for, t.goals_against, t.points, src.url AS source
        FROM standing t JOIN season s ON s.year = t.year JOIN club c ON c.id = t.club_id
        JOIN source src ON src.id = s.table_source
        WHERE c.slug = ? ORDER BY s.year DESC
    ''', (slug,))
    return {'club': historical_clubs()[slug], 'slug': slug, 'seasons': rows,
            'titles': sum(row['position'] == 1 for row in rows), 'sources': [TABLE_CREDIT]}


def history_api(path):
    if path == '/api/history':
        seasons = season_summaries()
        return {'seasons': seasons, 'titles': title_counts(), 'season_count': len(seasons),
                'sources': [TABLE_CREDIT, SCORE_CREDIT]}
    segments = path.removeprefix('/api/history/').split('/')
    if segments[0] == 'clubs' and len(segments) == 2:
        return club_report(segments[1])
    if segments[0] != 'seasons' or len(segments) not in (2, 3):
        return None
    year = segments[1]
    if len(year) != 4 or not year.isascii() or not year.isdecimal():
        return None
    if len(segments) == 2:
        return season_report(int(year))
    if segments[2] == 'matches':
        return season_scores(int(year))
    return None
