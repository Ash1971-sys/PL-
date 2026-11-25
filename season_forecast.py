"""Goal-rate model for a provisional 20-team Premier League season."""

from bisect import bisect_left
from functools import lru_cache
from math import exp
from random import Random
from threading import Lock

from league_feed import bundled_table, current_table, season_label, season_year, utcnow

SIMULATIONS = 1500
forecast_lock = Lock()


def goal_distribution(rate):
    likelihood = exp(-rate)
    cumulative = [likelihood]
    for goals in range(1, 16):
        likelihood *= rate / goals
        cumulative.append(cumulative[-1] + likelihood)
    cumulative[-1] = 1.0
    return cumulative


def ratings(teams):
    matches = sum(played for _, played, _, _ in teams)
    goals = sum(scored for _, _, scored, _ in teams)
    average = max(0.6, (goals + 20 * 1.35) / (matches + 20))
    return average, [
        ((scored + 6 * average) / (played + 6) / average,
         (conceded + 6 * average) / (played + 6) / average)
        for _, played, scored, conceded in teams
    ]


@lru_cache(maxsize=8)
def simulate_season(year, teams):
    average, strengths = ratings(teams)
    count = len(teams)
    fixtures = []
    for home, (home_attack, home_concedes) in enumerate(strengths):
        for away, (away_attack, away_concedes) in enumerate(strengths):
            if home == away:
                continue
            home_rate = min(4.2, max(0.2, average * home_attack * away_concedes * 1.14))
            away_rate = min(4.2, max(0.2, average * away_attack * home_concedes * 0.86))
            fixtures.append((home, away, goal_distribution(home_rate), goal_distribution(away_rate)))

    random = Random(year).random
    points_total = [0] * count
    ranks = [[0] * count for _ in teams]
    for _ in range(SIMULATIONS):
        points, difference, goals = ([0] * count for _ in range(3))
        for home, away, home_distribution, away_distribution in fixtures:
            hg = bisect_left(home_distribution, random())
            ag = bisect_left(away_distribution, random())
            goals[home] += hg
            goals[away] += ag
            difference[home] += hg - ag
            difference[away] += ag - hg
            points[home] += 3 if hg > ag else int(hg == ag)
            points[away] += 3 if ag > hg else int(hg == ag)

        order = sorted(range(count), key=lambda i: (points[i], difference[i], goals[i], random()), reverse=True)
        for finish, index in enumerate(order):
            ranks[index][finish] += 1
            points_total[index] += points[index]

    def finish_at(histogram, cutoff):
        total = 0
        for finish, frequency in enumerate(histogram, 1):
            total += frequency
            if total >= SIMULATIONS * cutoff:
                return finish
        return count

    def percent(frequency):
        return round(100 * frequency / SIMULATIONS, 1)

    results = []
    for i, (name, played, _, _) in enumerate(teams):
        histogram = ranks[i]
        results.append({'club': name, 'source_matches': played, 'points': round(points_total[i] / SIMULATIONS, 1),
                        'title': percent(histogram[0]), 'top_four': percent(sum(histogram[:4])),
                        'bottom_three': percent(sum(histogram[-3:])),
                        'finish_range': [finish_at(histogram, 0.10), finish_at(histogram, 0.90)]})
    return sorted(results, key=lambda row: (-row['points'], -row['title'], row['club']))


def season_forecast(now=None):
    season = season_year(now or utcnow())
    source, snapshot = current_table(season)
    table = snapshot.value or []
    status = 'cached' if snapshot.stale else 'fresh'
    checked_at = snapshot.checked_at
    if not table:
        fallback = bundled_table()
        if fallback and fallback['season'] == season:
            table = fallback['table']
            source, checked_at, status = 'OpenLigaDB', fallback['checked_at'], 'bundled'

    teams = tuple(sorted((row['club'], row['played'], row['gf'], row['ga']) for row in table))
    recorded = sum(played for _, played, _, _ in teams) // 2
    with forecast_lock:
        rows = simulate_season(season + 1, teams) if len(teams) == 20 and recorded else []
    return {'season': season_label(season + 1), 'input_season': season_label(season), 'source': source,
            'checked_at': checked_at, 'input_status': status if rows else 'unavailable',
            'input_matches': recorded, 'simulations': SIMULATIONS, 'rows': rows}
