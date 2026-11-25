"""Load the fixture archive once and derive reusable analytics from its rows."""

import json
import re
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / 'static' / 'data'


@lru_cache(maxsize=2)
def read_data(filename):
    return json.loads((DATA_DIR / filename).read_text(encoding='utf-8'))


@lru_cache(maxsize=1)
def match_seasons():
    seasons = defaultdict(list)
    for match in read_data('matches_2021_2026.json'):
        seasons[match['season']].append(match)
    return dict(sorted(seasons.items(), reverse=True))


@lru_cache(maxsize=1)
def player_seasons():
    seasons = defaultdict(list)
    for player in read_data('players_2025_2026.json'):
        seasons[str(player['season'])].append(player)
    return dict(seasons)


def slug(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')


def empty_totals():
    return dict(played=0, wins=0, draws=0, losses=0, gf=0, ga=0, xg=0, xga=0, points=0, clean_sheets=0)


def add_result(totals, match, side, opponent):
    scored, conceded = match[f'{side}_goals'], match[f'{opponent}_goals']
    win, draw = scored > conceded, scored == conceded
    totals['played'] += 1
    totals['wins'] += win
    totals['draws'] += draw
    totals['losses'] += scored < conceded
    totals['gf'] += scored
    totals['ga'] += conceded
    totals['xg'] += match[f'{side}_xg']
    totals['xga'] += match[f'{opponent}_xg']
    totals['points'] += 3 * win + draw
    totals['clean_sheets'] += conceded == 0


@lru_cache(maxsize=None)
def standings(season):
    clubs = {}
    for match in match_seasons()[season]:
        for side, opponent in [('home', 'away'), ('away', 'home')]:
            club = match[f'{side}_team']
            if club not in clubs:
                clubs[club] = dict(name=club, total=empty_totals(), home=empty_totals(), away=empty_totals())
            add_result(clubs[club]['total'], match, side, opponent)
            add_result(clubs[club][side], match, side, opponent)
    rows = sorted(clubs.values(), key=lambda club: (
        -club['total']['points'], club['total']['ga'] - club['total']['gf'], -club['total']['gf'], club['name']
    ))
    return [dict(club, rank=rank) for rank, club in enumerate(rows, 1)]


@lru_cache(maxsize=1)
def club_names():
    return {slug(name): name for name in sorted({
        match[side] for fixtures in match_seasons().values()
        for match in fixtures for side in ('home_team', 'away_team')
    })}


def season_trends(matches):
    home_goals = sum(match['home_goals'] for match in matches)
    away_goals = sum(match['away_goals'] for match in matches)
    home_wins = sum(match['home_goals'] > match['away_goals'] for match in matches)
    away_wins = sum(match['home_goals'] < match['away_goals'] for match in matches)
    return {
        'matches': len(matches), 'goals': home_goals + away_goals,
        'xg': sum(match['home_xg'] + match['away_xg'] for match in matches),
        'home_wins': home_wins, 'away_wins': away_wins,
        'draws': len(matches) - home_wins - away_wins,
    }


@lru_cache(maxsize=1)
def archive_summary():
    metrics = {
        'goals': lambda player: player['goals'],
        'assists': lambda player: player['assists'],
        'key_passes': lambda player: player['key_passes'],
        'xg_xa': lambda player: player['xg'] + player['xa'],
    }
    fields = ('name', 'club', 'position', 'goals', 'assists', 'xg', 'xa',
              'key_passes', 'progressive_carries', 'minutes', 'shots')

    def brief(player):
        return {field: player[field] for field in fields}

    seasons = player_seasons()
    players = seasons[max(seasons)]
    duel = [next((p for p in players if name in p['name']), players[index])
            for index, name in enumerate(('Haaland', 'Saka'))]
    return {
        'leaders': {
            year: {metric: [brief(player) for player in sorted(players, key=key, reverse=True)[:5]]
                   for metric, key in metrics.items()}
            for year, players in seasons.items()
        },
        'duel': [brief(player) for player in duel],
    }


def dataset(path):
    if path == 'archive-summary':
        return archive_summary()
    collection, _, key = path.partition('/')
    if collection == 'matches':
        if key == 'all':
            return read_data('matches_2021_2026.json')
        return match_seasons().get(key.replace('-', '/'))
    if collection == 'players':
        return player_seasons().get(key)
    return None
