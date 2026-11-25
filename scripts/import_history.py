"""Build the local history database from Wikipedia tables and OpenFootball scores."""

import argparse
import json
import re
import sqlite3
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urljoin
from urllib.request import Request, urlopen

from football_data import slug
from league_history import DATABASE

WIKI = 'https://en.wikipedia.org/wiki/'
WIKI_INDEX = WIKI + 'List_of_English_football_champions'
OPENFOOTBALL = 'https://openfootball.github.io/england/'
WIKI_LICENSE = ('CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/')
SCORE_LICENSE = ('CC0 1.0', 'https://creativecommons.org/publicdomain/zero/1.0/')
SEASON = re.compile(r'^(\d{4})\s*[-–—]\s*(\d{2}|\d{4})$')
TABLE_HEADER = ('pos', 'team', 'pld', 'w', 'd', 'l', 'gf', 'ga', 'gd', 'pts')
CLUB_NAMES = {
    'afc-bournemouth': 'Bournemouth', 'brighton-and-hove-albion': 'Brighton & Hove Albion',
    'brighton-hove-albion': 'Brighton & Hove Albion', 'brighton': 'Brighton & Hove Albion',
    'man-city': 'Manchester City', 'man-united': 'Manchester United', 'man-utd': 'Manchester United',
    'newcastle': 'Newcastle United', 'notts-forest': 'Nottingham Forest', 'nottm-forest': 'Nottingham Forest',
    'qpr': 'Queens Park Rangers', 'spurs': 'Tottenham Hotspur', 'tottenham': 'Tottenham Hotspur',
    'west-brom': 'West Bromwich Albion', 'west-ham': 'West Ham United', 'wolves': 'Wolverhampton Wanderers',
    'sheffield-weds': 'Sheffield Wednesday', 'sheffield-wed': 'Sheffield Wednesday', 'sheffield-utd': 'Sheffield United',
    'bradford': 'Bradford City', 'coventry': 'Coventry City', 'derby': 'Derby County',
    'leeds': 'Leeds United', 'leicester': 'Leicester City', 'newcastle-utd': 'Newcastle United',
}

SCHEMA = '''
PRAGMA foreign_keys = ON;
PRAGMA user_version = 1;
CREATE TABLE source (
    id INTEGER PRIMARY KEY, provider TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL UNIQUE,
    license TEXT NOT NULL, license_url TEXT NOT NULL, retrieved_at TEXT NOT NULL
);
CREATE TABLE club (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE
);
CREATE TABLE season (
    year INTEGER PRIMARY KEY, label TEXT NOT NULL, clubs INTEGER NOT NULL CHECK(clubs IN (20, 22)),
    expected_matches INTEGER NOT NULL, stored_matches INTEGER NOT NULL,
    table_source INTEGER NOT NULL REFERENCES source(id), score_source INTEGER REFERENCES source(id),
    scoring_leaders TEXT
);
CREATE TABLE standing (
    year INTEGER NOT NULL REFERENCES season(year), position INTEGER NOT NULL,
    club_id INTEGER NOT NULL REFERENCES club(id), played INTEGER NOT NULL, wins INTEGER NOT NULL,
    draws INTEGER NOT NULL, losses INTEGER NOT NULL, goals_for INTEGER NOT NULL,
    goals_against INTEGER NOT NULL, points INTEGER NOT NULL,
    PRIMARY KEY (year, position), UNIQUE (year, club_id)
);
CREATE INDEX standing_club ON standing(club_id, year);
CREATE TABLE match (
    year INTEGER NOT NULL REFERENCES season(year), home_id INTEGER NOT NULL REFERENCES club(id),
    away_id INTEGER NOT NULL REFERENCES club(id), played_on TEXT NOT NULL, matchweek INTEGER,
    home_goals INTEGER NOT NULL CHECK(home_goals >= 0), away_goals INTEGER NOT NULL CHECK(away_goals >= 0),
    PRIMARY KEY (year, home_id, away_id), CHECK(home_id <> away_id)
);
CREATE INDEX match_by_away ON match(year, away_id);
'''


@dataclass
class Cell:
    chunks: list = field(default_factory=list)
    links: list = field(default_factory=list)

    @property
    def text(self):
        return ' '.join(''.join(self.chunks).split())


@dataclass
class Table:
    rows: list = field(default_factory=list)
    row: list = field(default_factory=list)
    cell: Cell = None
    link: list = None


class WikiTables(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.tables = []
        self.stack = []
        self.ignored = 0
        self.feed(html)
        self.close()

    def handle_starttag(self, tag, attributes):
        if tag in ('sup', 'script', 'style'):
            self.ignored += 1
        if self.ignored:
            return
        if tag == 'table':
            self.stack.append(Table())
        if not self.stack:
            return
        table = self.stack[-1]
        if tag == 'tr':
            table.row = []
        elif tag in ('th', 'td'):
            table.cell = Cell()
        elif tag == 'a' and table.cell is not None:
            href = dict(attributes).get('href', '')
            table.link = [href, []]
        elif tag == 'br':
            self.handle_data(' ')

    def handle_endtag(self, tag):
        if tag in ('sup', 'script', 'style') and self.ignored:
            self.ignored -= 1
            return
        if self.ignored or not self.stack:
            return
        table = self.stack[-1]
        if tag == 'a' and table.link is not None and table.cell is not None:
            href, chunks = table.link
            label = ' '.join(''.join(chunks).split())
            if label:
                table.cell.links.append((href, label))
            table.link = None
        elif tag in ('th', 'td') and table.cell is not None:
            table.row.append(table.cell)
            table.cell = None
            table.link = None
        elif tag == 'tr' and table.row:
            table.rows.append(table.row)
            table.row = []
        elif tag == 'table':
            self.tables.append(self.stack.pop().rows)

    def handle_data(self, text):
        if self.ignored or not self.stack or self.stack[-1].cell is None:
            return
        table = self.stack[-1]
        table.cell.chunks.append(text)
        if table.link is not None:
            table.link[1].append(text)


def fetch(url, cache):
    filename = cache / (sha256(url.encode()).hexdigest() + '.txt') if cache else None
    if filename and filename.is_file():
        return filename.read_text(encoding='utf-8')
    request = Request(url, headers={'User-Agent': 'PLAnalyticsHistory/1.0 (local Premier League history dataset)'})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=20) as response:
                raw = response.read(8_000_001)
            if len(raw) > 8_000_000:
                raise ValueError(f'Source exceeds import size limit: {url}')
            text = raw.decode('utf-8')
            if filename:
                filename.write_text(text, encoding='utf-8')
            return text
        except (HTTPError, URLError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def club_name(text):
    text = re.sub(r'\s*\((?:[A-Z](?:,\s*)?){1,4}\)\s*$', '', text).strip()
    text = re.sub(r'\s+A?F\.?C\.?$', '', text, flags=re.IGNORECASE)
    return CLUB_NAMES.get(slug(text), text)


def linked_club(cell):
    return club_name(next((label for href, label in cell.links if href), cell.text))


def champions_index(html):
    seasons = {}
    for table in WikiTables(html).tables:
        for row in table:
            for index, cell in enumerate(row[:-3]):
                match = SEASON.fullmatch(cell.text)
                if not match or not cell.links:
                    continue
                year = int(match[1])
                if year < 1992 or int(match[2]) not in ((year + 1) % 100, year + 1):
                    continue
                href, _ = cell.links[0]
                url = quote(urljoin(WIKI_INDEX, href), safe=':/%?&=#')
                if not url.startswith(WIKI):
                    continue
                seasons[year] = (url, tuple(linked_club(team) for team in row[index + 1:index + 4]))
    if 1992 not in seasons or 2025 not in seasons:
        raise ValueError('Could not read the Premier League rows in the champions index.')
    return seasons


def wiki_standings(tables, year, podium):
    count = 22 if year <= 1994 else 20
    for table in tables:
        rows = []
        for row in table:
            if len(row) < len(TABLE_HEADER) or not re.fullmatch(r'\d{1,2}', row[0].text):
                continue
            try:
                metrics = [int(cell.text.replace('−', '-')) for cell in row[2:10]]
            except ValueError:
                continue
            played, wins, draws, losses, gf, ga, difference, points = metrics
            if played != (count - 1) * 2 or played != wins + draws + losses or difference != gf - ga:
                continue
            rows.append((int(row[0].text), linked_club(row[1]), played, wins, draws, losses, gf, ga, points))
        if (len(rows) == count and [row[0] for row in rows] == list(range(1, count + 1))
                and tuple(slug(row[1]) for row in rows[:3]) == tuple(slug(name) for name in podium)
                and sum(row[6] for row in rows) == sum(row[7] for row in rows)
                and sum(row[3] for row in rows) == sum(row[5] for row in rows)):
            return rows
    raise ValueError(f'Could not validate the final Wikipedia table for {year}: {podium!r}')


def scoring_leaders(tables):
    for table in tables:
        for row in table:
            if len(row) >= 2 and 'top goalscorer' in row[0].text.casefold():
                names = ', '.join(label for _, label in row[1].links if label)
                goals = re.search(r'\b(\d+)\s*goals?\b', row[1].text, re.I)
                if goals:
                    names = names or row[1].text[:goals.start()].rstrip(' (')
                    if names:
                        return f'{names} ({goals[1]} goals{" each" if " each" in row[1].text else ""})'
    return None


def score_rows(text, standings):
    clubs = {slug(name): name for _, name, *_ in standings}
    records = {}
    for row in json.loads(text)['matches']:
        home, away = [slug(club_name(row[key])) for key in ('team1', 'team2')]
        if home not in clubs or away not in clubs or home == away:
            continue
        scores = row.get('score')
        if isinstance(scores, dict):
            scores = scores.get('ft')
        if not isinstance(scores, list) or len(scores) != 2 or any(type(goal) is not int or goal < 0 for goal in scores):
            continue
        if (home, away) in records:
            raise ValueError(f'Duplicate fixture: {home} vs {away}')
        round_no = re.search(r'(\d+)\s*$', row.get('round') or '')
        played_on = date.fromisoformat(row['date']).isoformat()
        records[(home, away)] = (home, away, played_on, int(round_no[1]) if round_no else None, *scores)
    return list(records.values())


def validate_scores(rows, standings):
    totals = defaultdict(Counter)
    for home, away, _, _, hg, ag in rows:
        for club, scored, allowed in ((home, hg, ag), (away, ag, hg)):
            totals[club]['played'] += 1
            totals[club]['gf'] += scored
            totals[club]['ga'] += allowed
            totals[club]['wins'] += scored > allowed
            totals[club]['draws'] += scored == allowed
            totals[club]['losses'] += scored < allowed
    return [name for _, name, *expected, _ in standings
            if expected != [totals[slug(name)][key] for key in ('played', 'wins', 'draws', 'losses', 'gf', 'ga')]]


def obtain_season(year, metadata, cache):
    url, podium = metadata
    html = fetch(url, cache)
    tables = WikiTables(html).tables
    standings = wiki_standings(tables, year, podium)
    revision = re.search(r'"wgRevisionId":\s*(\d+)', html)
    table_url = WIKI + 'Special:PermanentLink/' + revision[1] if revision else url
    label = f'{year}/{(year + 1) % 100:02}'
    scores_url = OPENFOOTBALL + label.replace('/', '-') + '_1-premierleague.json'
    scores = score_rows(fetch(scores_url, cache), standings)
    return year, label, table_url, scores_url, standings, scores, scoring_leaders(tables)


def write_database(destination, seasons):
    retrieved_at = datetime.now(timezone.utc).isoformat(timespec='seconds')
    with NamedTemporaryFile(dir=destination.parent, prefix='.history-', suffix='.sqlite3', delete=False) as handle:
        temporary = Path(handle.name)
    try:
        with closing(sqlite3.connect(temporary)) as connection:
            connection.executescript(SCHEMA)
            club_ids = {}

            def add_source(provider, title, url, license_info):
                return connection.execute('INSERT INTO source VALUES (NULL, ?, ?, ?, ?, ?, ?)',
                                          (provider, title, url, *license_info, retrieved_at)).lastrowid

            for year, label, table_url, scores_url, standings, scores, leaders in seasons:
                expected = len(standings) * (len(standings) - 1)
                problems = validate_scores(scores, standings)
                if problems or len(scores) != expected:
                    raise ValueError(f'{label}: {len(scores)}/{expected} match scores, conflicting teams: {", ".join(problems)}')
                table_source = add_source('Wikipedia', f'{label} Premier League final table', table_url, WIKI_LICENSE)
                score_source = add_source('OpenFootball', f'{label} Premier League results', scores_url, SCORE_LICENSE)
                connection.execute('INSERT INTO season VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                                   (year, label, len(standings), expected, len(scores), table_source, score_source, leaders))
                for position, club, *metrics in standings:
                    key = slug(club)
                    if key not in club_ids:
                        club_ids[key] = connection.execute('INSERT INTO club VALUES (NULL, ?, ?)', (club, key)).lastrowid
                    connection.execute('INSERT INTO standing VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                                       (year, position, club_ids[key], *metrics))
                connection.executemany('INSERT INTO match VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [(year, club_ids[home], club_ids[away], played, week, hg, ag)
                     for home, away, played, week, hg, ag in scores])
                print(f'{label}: {len(standings)} clubs, {len(scores)} checked matches', flush=True)
            connection.commit()
            if connection.execute('PRAGMA integrity_check').fetchone() != ('ok',):
                raise ValueError('SQLite integrity check failed')
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--through', type=int, help='Last starting year to import (default: newest season in the champions index).')
    parser.add_argument('--cache-dir', type=Path, help='Reuse a scratch directory for downloaded source copies.')
    parser.add_argument('--output', type=Path, default=DATABASE)
    args = parser.parse_args()
    if args.cache_dir:
        args.cache_dir.mkdir(parents=True, exist_ok=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    index = champions_index(fetch(WIKI_INDEX, args.cache_dir))
    final_year = args.through or max(index)
    years = list(range(1992, final_year + 1))
    if not years or any(year not in index for year in years):
        raise ValueError('The Wikipedia champions index does not cover the requested completed seasons.')
    print(f'Reading {len(years)} completed seasons.', flush=True)
    with ThreadPoolExecutor(max_workers=3) as pool:
        records = list(pool.map(lambda year: obtain_season(year, index[year], args.cache_dir), years))
    write_database(args.output, records)
    print(f'Database built at {args.output}', flush=True)


if __name__ == '__main__':
    main()
