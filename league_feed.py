"""Fetch Premier League scores and tables without exposing provider credentials."""

import json
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from threading import Lock
from time import monotonic
from urllib.parse import urlencode
from urllib.request import Request, urlopen

OPENLIGA = 'https://api.openligadb.de/'
FOOTBALL_DATA = 'https://api.football-data.org/v4/competitions/PL/'
SCORES_TTL = 67
IDLE_TTL = 3600
TERMINAL_STATES = ('finished', 'postponed', 'suspended', 'cancelled')
SNAPSHOT_FILE = Path(__file__).resolve().parent / 'data' / 'openligadb-table.json'
week_workers = ThreadPoolExecutor(max_workers=3)


def utcnow():
    return datetime.now(timezone.utc)


def season_year(now):
    return now.year if now.month >= 8 else now.year - 1


def season_label(year):
    return f'{year}/{(year + 1) % 100:02}'


def kickoff_time(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(timezone.utc)


def get_json(url, token=None):
    headers = {'Accept': 'application/json', 'User-Agent': 'PL-Analytics/1.0'}
    request = Request(url, headers=headers)
    if token:
        request.add_unredirected_header('X-Auth-Token', token)
    with urlopen(request, timeout=4) as response:
        # Each request covers at most three matchweeks or one table.
        data = response.read(2 * 1024 * 1024 + 1)
    if len(data) > 2 * 1024 * 1024:
        raise ValueError('Provider response exceeded limit')
    return json.loads(data)


@dataclass(frozen=True)
class Snapshot:
    value: object = None
    checked_at: str = ''
    stale: bool = False


class CachedRequest:
    def __init__(self):
        self.lock = Lock()
        self.expiry = 0
        self.current = Snapshot()
        self.marker = None

    def get(self, read, ttl, marker=None):
        with self.lock:
            if monotonic() < self.expiry:
                return self.current
            try:
                stamp = marker() if marker and self.current.value is not None else None
                if stamp is not None and stamp == self.marker:
                    value = self.current.value
                else:
                    value = read()
            except (OSError, ValueError, TypeError, KeyError, IndexError, AttributeError):
                self.current = Snapshot(self.current.value, self.current.checked_at, True)
                self.expiry = monotonic() + 120
            else:
                self.marker = stamp
                self.current = Snapshot(value, utcnow().isoformat())
                self.expiry = monotonic() + (ttl(value) if callable(ttl) else ttl)
            return self.current


@lru_cache(maxsize=64)
def cache_for(key):
    return CachedRequest()


def require_league(rows):
    if len(rows) != 20 or len({row['id'] for row in rows}) != 20:
        raise ValueError('Incomplete Premier League table')
    for row in rows:
        stats = [row[key] for key in ('played', 'wins', 'draws', 'losses', 'gf', 'ga')]
        valid_stats = all(type(value) is int and value >= 0 for value in stats)
        if not isinstance(row['club'], str) or not row['club'].strip() or not valid_stats:
            raise ValueError('Invalid standings row')
        if type(row['points']) is not int or row['played'] > 38:
            raise ValueError('Invalid standing totals')
    return rows


def openliga_table(season):
    raw = get_json(f'{OPENLIGA}getbltable/pl/{season}')
    return require_league([
        {'id': row['teamInfoId'], 'club': row.get('shortName') or row['teamName'],
         'played': row['matches'], 'wins': row['won'], 'draws': row['draw'], 'losses': row['lost'],
         'gf': row['goals'], 'ga': row['opponentGoals'], 'points': row['points']}
        for row in raw
    ])


def scored_pair(home, away):
    return [home, away] if type(home) is int and type(away) is int and min(home, away) >= 0 else None


def openliga_matches(season, week):
    raw = get_json(f'{OPENLIGA}getmatchdata/pl/{season}/{week}')
    if not raw:
        raise ValueError('No fixtures for matchweek')
    matches = []
    for row in raw:
        teams = [row[key].get('shortName') or row[key]['teamName'] for key in ('team1', 'team2')]
        latest = max(row['matchResults'], key=lambda result: result['resultOrderID'], default=None)
        final = bool(row['matchIsFinished'])
        if final and latest and latest.get('resultTypeKind') == 'HalfTime':
            latest = None
        score = scored_pair(latest['pointsTeam1'], latest['pointsTeam2']) if latest else None
        if not final and not score and row.get('goals'):
            goal = max(row['goals'], key=lambda event: (event.get('matchMinute') or 0, event.get('goalID') or 0))
            score = scored_pair(goal.get('scoreTeam1'), goal.get('scoreTeam2'))
        matches.append({'id': row['matchID'], 'week': row['group']['groupOrderID'],
                        'kickoff': kickoff_time(row['matchDateTimeUTC']).isoformat(),
                        'home': teams[0], 'away': teams[1], 'score': score,
                        'state': 'finished' if final and score else 'scheduled'})
    return matches


def refresh_interval(matches):
    if any(match['state'] == 'playing' for match in matches):
        return SCORES_TTL
    now = utcnow()
    gaps = [(kickoff_time(match['kickoff']) - now).total_seconds() for match in matches
            if match['state'] not in TERMINAL_STATES]
    if any(-3 * 3600 <= seconds <= 0 for seconds in gaps):
        return SCORES_TTL
    next_kickoff = min((seconds for seconds in gaps if seconds > 0), default=IDLE_TTL)
    return max(SCORES_TTL, min(IDLE_TTL, next_kickoff))


def openliga_week(season, week):
    def updated_at():
        try:
            return get_json(f'{OPENLIGA}getlastchangedate/pl/{season}/{week}')
        except (OSError, ValueError):
            return None

    return cache_for(('openliga-week', season, week)).get(
        lambda: openliga_matches(season, week), refresh_interval, updated_at
    )


def football_data_table(season, token):
    raw = get_json(f'{FOOTBALL_DATA}standings?season={season}', token)
    rows = next((group['table'] for group in raw['standings'] if group['type'] == 'TOTAL'), [])
    return require_league([
        {'id': row['team']['id'], 'club': row['team'].get('shortName') or row['team']['name'],
         'played': row['playedGames'], 'wins': row['won'], 'draws': row['draw'], 'losses': row['lost'],
         'gf': row['goalsFor'], 'ga': row['goalsAgainst'], 'points': row['points']}
        for row in rows
    ])


def football_data_matches(now, token):
    dates = urlencode({'dateFrom': (now - timedelta(days=10)).date(),
                       'dateTo': (now + timedelta(days=10)).date()})
    raw = get_json(f'{FOOTBALL_DATA}matches?{dates}', token)
    states = {'IN_PLAY': 'playing', 'PAUSED': 'playing', 'FINISHED': 'finished',
              'POSTPONED': 'postponed', 'SUSPENDED': 'suspended', 'CANCELLED': 'cancelled'}
    matches = []
    for row in raw['matches']:
        goals = row['score']['fullTime']
        score = scored_pair(goals['home'], goals['away'])
        state = states.get(row['status'], 'scheduled')
        if state == 'finished' and score is None:
            state = 'scheduled'
        matches.append({'id': row['id'], 'week': row['matchday'], 'kickoff': kickoff_time(row['utcDate']).isoformat(),
                        'home': row['homeTeam'].get('shortName') or row['homeTeam']['name'],
                        'away': row['awayTeam'].get('shortName') or row['awayTeam']['name'],
                        'score': score, 'state': state})
    return matches


def current_table(season):
    token = os.getenv('FOOTBALL_DATA_TOKEN', '').strip()
    if token:
        result = cache_for(('fd-table', season)).get(lambda: football_data_table(season, token), 900)
        if result.value is not None and not result.stale:
            return 'football-data.org', result
    return 'OpenLigaDB', cache_for(('openliga-table', season)).get(lambda: openliga_table(season), 1800)


@lru_cache(maxsize=1)
def bundled_table():
    if SNAPSHOT_FILE.is_file():
        return json.loads(SNAPSHOT_FILE.read_text(encoding='utf-8'))
    return None


def match_state(match, now, stale):
    if match['state'] in TERMINAL_STATES:
        return match['state']
    elapsed = (now - kickoff_time(match['kickoff'])).total_seconds()
    if elapsed < 0:
        return 'scheduled'
    if not stale and match['state'] == 'playing':
        return 'playing'
    if not stale and elapsed <= 3 * 3600 and match['score'] is not None:
        return 'reported'
    return 'awaiting'


def openliga_match_window(season):
    def current_week():
        week = get_json(OPENLIGA + 'getcurrentgroup/pl')['groupOrderID']
        if type(week) is not int or not 1 <= week <= 38:
            raise ValueError('Invalid matchweek')
        return week

    current = cache_for(('openliga-week-number', season)).get(current_week, 3600)
    if current.value is None:
        return None, []
    week = current.value
    return week, list(week_workers.map(lambda value: openliga_week(season, value),
                                       range(max(1, week - 1), min(38, week + 1) + 1)))


def live_dashboard(now=None):
    now = now or utcnow()
    season = season_year(now)
    token = os.getenv('FOOTBALL_DATA_TOKEN', '').strip()
    source, week, snapshots = 'OpenLigaDB', None, []
    if token:
        result = cache_for(('fd-matches', season)).get(lambda: football_data_matches(now, token), refresh_interval)
        if result.value is not None and not result.stale:
            source, snapshots = 'football-data.org', [result]
    if not snapshots:
        week, snapshots = openliga_match_window(season)

    rows = []
    for snapshot in snapshots:
        rows.extend(dict(match, state=match_state(match, now, snapshot.stale)) for match in (snapshot.value or ()))
    rows.sort(key=lambda match: match['kickoff'])
    checked = [snapshot.checked_at for snapshot in snapshots if snapshot.checked_at]
    table_source, table = current_table(season)
    return {
        'season': season_label(season), 'week': week, 'match_source': source,
        'match_checked_at': min(checked, default=None),
        'match_state': ('unavailable' if not checked else 'stale' if any(item.stale for item in snapshots) else 'fresh'),
        'table_source': table_source, 'table_checked_at': table.checked_at,
        'table_stale': table.stale, 'standings': table.value or [],
        'playing': [row for row in rows if row['state'] in ('playing', 'reported')],
        'awaiting': [row for row in rows if row['state'] in ('awaiting', 'postponed', 'suspended', 'cancelled')][-10:],
        'recent': [row for row in reversed(rows) if row['state'] == 'finished'][:10],
        'upcoming': [row for row in rows if row['state'] == 'scheduled'][:10],
        'refresh_after': min(300, round(refresh_interval(rows))),
    }
