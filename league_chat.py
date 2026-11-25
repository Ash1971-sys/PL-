"""Source-backed answers for Premier League history, archive data, and site help."""

import json
import os
import re
import unicodedata
from collections import deque
from threading import Lock
from time import monotonic
from urllib.request import Request, urlopen

from analysis_pages import standings_path
from football_data import club_names, match_seasons, season_trends, slug, standings
from league_feed import current_table, live_dashboard, season_label, season_year, utcnow
from league_history import club_report, historical_clubs, history_path, season_report, season_scores, season_summaries, title_counts
from season_forecast import season_forecast

MAX_CHAT_BODY = 8192
MAX_MESSAGE = 500
OFFICIAL = 'https://www.premierleague.com/en'
HISTORY = ('Premier League history', OFFICIAL + '/history')
HISTORY_DATABASE = ('Historical seasons', '/history')
RECORDS = ('Official Premier League records', OFFICIAL + '/stats/records')
HONOURS = ('Official list of champions', OFFICIAL + '/news/58905')
ARCHIVE = ('Modelled match archive', '/#match-archive')
LIVE = ('Live scores and standings', '/live')
FORECAST = ('Next-season predictions', '/predictions')
METHODOLOGY = ('Data and methodology', '/methodology')

FACTS = (
    (r'\binvincibles?\b|unbeaten season|undefeated season',
     'Arsenal went unbeaten in 2003/04 under Arsène Wenger. They won 26 matches, drew 12 and finished with 90 points.',
     ('2003/04 official season review', OFFICIAL + '/news/693629')),
    (r'centurions?|100 points|most points|points record',
     'Manchester City set the Premier League points record with 100 in 2017/18 under Pep Guardiola.', RECORDS),
    (r'first goal|first scorer|\bbrian deane\b',
     'Brian Deane scored the first Premier League goal for Sheffield United against Manchester United on 15 August 1992.', RECORDS),
    (r'when.*\b(?:league|pl)\b.*(?:start|form|found|began|begin|creat)|league origins|inaugural teams|founding clubs',
     'The Premier League was established on 27 May 1992 and its first matches took place on 15 August. The inaugural 1992/93 season had 22 clubs.', HISTORY),
    (r'\bclean sheets?\b',
     'Petr Čech recorded an all-time Premier League high of 202 clean sheets for Chelsea and Arsenal, including 24 in Chelsea’s 2004/05 season.', RECORDS),
    (r'most assists.*(?:season|single)|assist record.*season',
     'Bruno Fernandes holds the Premier League single-season assists record with 21 for Manchester United in 2025/26.', RECORDS),
    (r'most assists|all time assists|assist record|\bryan giggs\b',
     'Ryan Giggs holds the Premier League career assists record with 162, all for Manchester United.', RECORDS),
    (r'(?:most|record|highest).*goals.*(?:season|campaign)|\bhaaland\b.*(?:record|36)',
     'Erling Haaland scored 36 Premier League goals for Manchester City in 2022/23, the single-season record.', RECORDS),
    (r'goal.?scor(?:er|ing) record|top goal.?scorer|(?:top scorer|most goals).*(?:history|all time)|all.?time.*scorer|\b(?:alan )?shearer\b',
     'Alan Shearer is the Premier League’s all-time top scorer with 260 goals for Blackburn Rovers and Newcastle United.', RECORDS),
    (r'ag(?:u|ü)ero|93[: ]20|(?:manchester|man) city.*2011.12.*(?:how|final day)',
     'Sergio Agüero scored in stoppage time against Queens Park Rangers on the final day of 2011/12. Manchester City won 3–2 and took the title on goal difference.',
     ('Premier League historical moments', OFFICIAL + '/news/2714336')),
    (r'(?:leicester.*(?:fairytale|how|2015.16))|(?:2015.16.*leicester)|(?:fairytale.*title)',
     'Leicester City won the 2015/16 Premier League under Claudio Ranieri. It was their first Premier League title.', HONOURS),
)

CLUB_ALIASES = {
    'man city': 'Manchester City', 'man utd': 'Manchester United', 'man united': 'Manchester United',
    'spurs': 'Tottenham Hotspur', 'tottenham': 'Tottenham Hotspur', 'wolves': 'Wolverhampton Wanderers',
    'brighton': 'Brighton & Hove Albion', 'newcastle': 'Newcastle United', 'leicester': 'Leicester City',
    'forest': 'Nottingham Forest', 'west ham': 'West Ham United', 'blackburn': 'Blackburn Rovers',
    'ipswich': 'Ipswich Town', 'hull': 'Hull City', 'coventry': 'Coventry City', 'sunderland': 'Sunderland',
}


def reply(answer, *sources):
    return {'answer': answer, 'sources': [{'title': title, 'url': url} for title, url in sources]}


def normalize(text):
    text = ''.join(ch for ch in unicodedata.normalize('NFKD', text.lower()) if not unicodedata.combining(ch))
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9/–—:\- ]', ' ', text)).strip()


def named_clubs(query):
    candidates = {normalize(club): club for club in {**club_names(), **historical_clubs()}.values()}
    candidates.update(CLUB_ALIASES)
    found = []
    for name, club in sorted(candidates.items(), key=lambda item: -len(item[0])):
        query, matches = re.subn(r'\b' + re.escape(name) + r'\b', ' ', query)
        if matches and club not in found:
            found.append(club)
    return found


def mentioned_year(query):
    pair = re.search(r'\b((?:19|20)\d{2})\s*[/–—-]\s*((?:19|20)\d{2}|\d{2})\b', query)
    if pair:
        year, end = map(int, pair.groups())
        return year if end in (year + 1, (year + 1) % 100) else None
    single = re.search(r'\b((?:19|20)\d{2})\b', query)
    if single:
        year = int(single[1])
        return year if year == 1992 or 'season' in query else year - 1
    short = re.search(r'\b(\d{2})\s*[/–—-]\s*(\d{2})\b', query)
    if short:
        start, end = map(int, short.groups())
        if end == (start + 1) % 100:
            return (1900 if start >= 92 else 2000) + start
    return None


def board_answer(clubs, fixtures=False):
    year = season_year(utcnow())
    if fixtures:
        board = live_dashboard()
        upcoming = [game for game in board['upcoming'] if not clubs or any(
            club in named_clubs(normalize(f"{game['home']} {game['away']}")) for club in clubs
        )]
        if not upcoming:
            return reply('The connected feed has no matching upcoming fixtures in its current window.', LIVE)
        games = [f"{game['home']} vs {game['away']} on {game['kickoff'][:10]}" for game in upcoming[:3]]
        return reply('Upcoming according to ' + board['match_source'] + ': ' + '; '.join(games) + '.', LIVE)

    source, snapshot = current_table(year)
    if not snapshot.value:
        return reply('The current standings feed is temporarily unavailable.', LIVE)
    rows = [(index, row) for index, row in enumerate(snapshot.value, 1) if not clubs or any(
        club in named_clubs(normalize(row['club'])) for club in clubs
    )][:3]
    if not rows:
        return reply('That club is not in the current Premier League table returned by the feed.', LIVE)
    ranking = '; '.join(f"{index}. {row['club']} — {row['points']} points from {row['played']} matches" for index, row in rows)
    label = 'Last available' if snapshot.stale else 'Latest reported'
    return reply(f'{label} {season_label(year)} table from {source}: {ranking}. Community updates can lag.', LIVE)


def archive_answer(query, season, clubs):
    matches = match_seasons()[season]
    if len(clubs) == 2 and re.search(r'\b(?:vs|v|versus|against|head.to.head)\b', query):
        games = [game for game in matches if {game['home_team'], game['away_team']} == set(clubs)]
        if games:
            scores = '; '.join(f"{game['home_team']} {game['home_goals']}–{game['away_goals']} {game['away_team']}" for game in games)
            return reply(f'In the {season} modelled archive: {scores}. These are generated scores rather than official results.', ARCHIVE, METHODOLOGY)
    if clubs:
        club = next((row for row in standings(season) if row['name'] == clubs[0]), None)
        if club:
            totals = club['total']
            return reply(f"In the {season} modelled archive, {club['name']} finished {club['rank']} with {totals['points']} points, "
                         f"{totals['wins']} wins and {totals['gf']} goals in {totals['played']} games.",
                         ('Modelled season standings', standings_path(season)), ('Club profile', '/clubs/' + slug(club['name'])))
        return reply(f'{clubs[0]} has no records in the {season} modelled archive.', ARCHIVE, METHODOLOGY)
    totals = season_trends(matches)
    return reply(f"The {season} modelled archive contains {totals['matches']} fixtures and {totals['goals']} goals, "
                 f"an average of {totals['goals'] / totals['matches']:.2f} per match.", ('Season trends', '/trends'), METHODOLOGY)


def history_sources(record, results=False):
    year, label = record['year'], record['label']
    link = (f'{label} match results', history_path(year) + '/results') if results else (f'{label} final table', history_path(year))
    provider = 'OpenFootball' if results else 'Wikipedia'
    return (link, *((source['title'], source['url']) for source in record['sources'] if source['provider'] == provider))


def recorded_answer(query, year, clubs):
    years = season_summaries()
    if not years:
        return reply('The historical database is temporarily unavailable.', HISTORY_DATABASE, HONOURS)
    season = season_report(year) if year is not None else None
    if year is not None and not season:
        return reply(f'The database covers completed seasons from {years[-1]["label"]} to {years[0]["label"]}.', HISTORY_DATABASE, LIVE)

    if season and re.search(r'runner.?up|(?:finished|came) second|second place|finished (?:in )?2nd|third.place|(?:finished|came) third', query):
        rank = 'third' if 'third' in query else 'second'
        name = season['third_place'] if rank == 'third' else season['runner_up']
        return reply(f'{name} finished {rank} in the {season["label"]} Premier League.', *history_sources(season))
    if season and re.search(r'golden boot|top (?:goal)?scorer|scored the most goals|leading scorer', query):
        if season['scoring_leaders']:
            return reply(f'The league-wide scoring leader information for {season["label"]}: {season["scoring_leaders"]}.', *history_sources(season))
        return reply(f'There is no scoring leader recorded for {season["label"]} in this database.', *history_sources(season))
    if len(clubs) == 2 and re.search(r'\b(?:vs|v|versus|against|head.to.head)\b', query):
        if season is None:
            season = season_report(years[0]['year'])
        records = season_scores(season['year'], tuple(slug(club) for club in clubs))
        if not records['matches']:
            return reply(f'There are no recorded league meetings between those clubs in {season["label"]}.', *history_sources(season, results=True))
        scores = '; '.join(f"{row['date']}: {row['home']} {row['home_goals']}–{row['away_goals']} {row['away']}"
                           for row in records['matches'])
        return reply(f'{season["label"]} Premier League results: {scores}.', *history_sources(season, results=True))
    if season and re.search(r'who won|champion|\btitle\b|what about|^\d{2,4}', query) and not re.search(r'goals|matches|games|points did', query):
        return reply(f'{season["champion"]} won the {season["label"]} Premier League with {season["champion_points"]} points. {season["runner_up"]} finished second.', HONOURS, *history_sources(season))
    if clubs:
        report = club_report(slug(clubs[0]))
        row = next((item for item in (report['seasons'] if report else []) if year is None or item['year'] == year), None)
        if not row:
            return reply(f'{clubs[0]} has no matching season in the history database.', HISTORY_DATABASE)
        season = season or season_report(row['year'])
        return reply(f"{clubs[0]} finished position {row['position']} in {row['label']} with {row['points']} points, "
                     f"{row['wins']} wins and {row['goals_for']} goals in {row['played']} games.", *history_sources(season))
    if season:
        goals = sum(row['goals_for'] for row in season['standings'])
        return reply(f'The {season["label"]} Premier League had {season["clubs"]} clubs, {season["stored_matches"]} matches and {goals:,} goals. {season["champion"]} finished first with {season["champion_points"]} points.', *history_sources(season))
    return None


def league_answer(message):
    query = normalize(message)
    clubs = named_clubs(query)
    year = mentioned_year(query)
    season = season_label(year) if year is not None else None
    if re.search(r'modelled|modeled|synthetic|generated', query) and (clubs or season in match_seasons()):
        return archive_answer(query, season if season in match_seasons() else next(iter(match_seasons())), clubs)

    if re.search(r'predict|forecast|next season|who will win', query):
        report = season_forecast()
        if not report['rows']:
            return reply(f"The {report['season']} forecast is waiting for enough reported results.", FORECAST)
        favorite = max(report['rows'], key=lambda row: row['title'])
        return reply(f"The {report['season']} simulation gives {favorite['club']} the highest title probability, "
                     f"at {favorite['title']}%. The model uses the current clubs as a provisional lineup.", FORECAST, METHODOLOGY)
    if re.search(r'upcoming|next (?:match|game|fixture)|fixtures? today', query):
        return board_answer(clubs, fixtures=True)
    if re.search(r'live score|latest score|recent results|results today', query):
        board = live_dashboard()
        games = board['playing'] or board['recent']
        if clubs:
            games = [game for game in games if any(club in named_clubs(normalize(f"{game['home']} {game['away']}")) for club in clubs)]
        scores = '; '.join(f"{game['home']} {game['score'][0]}–{game['score'][1]} {game['away']}"
                           for game in games[:3] if game['score'] is not None)
        return reply(f"Reported by {board['match_source']}: {scores}." if scores else 'The feed has no matching score to show.', LIVE)
    if re.search(r'current table|live table|current standings|live standings|top of the (?:premier league|league|table)|leading the (?:premier league|league)', query):
        return board_answer(clubs)
    if re.search(r'tactical 11|simulator|\b(?:play|controls|dribble)\b.*\bgame\b', query):
        return reply('In Tactical 11, tap a teammate to pass or tap the pitch to dribble. Press P to pass, S to shoot, D to dribble and T to press. Use Start for continuous play or Next play for one turn at a time.', ('Tactical 11 simulator', '/simulator'))
    if re.search(r'what (?:is|does) (?:an? )?x[ga]\b|expected goals|\bxg mean', query):
        return reply('Expected goals (xG) estimates the chance that a shot becomes a goal. A 0.25 xG chance is estimated to score one time in four. Expected assists (xA) describes the scoring likelihood associated with a pass.', METHODOLOGY)
    if re.search(r'modelled|modeled|synthetic|official data|data source|archive cover', query):
        return reply('The 2021/22–2025/26 match archive contains 1,900 generated fixtures and results. Live scores come from a separate feed. League-history answers use official Premier League references.', METHODOLOGY, LIVE, HISTORY)
    if re.search(r'how many.*(?:different )?(?:clubs|teams).*won', query):
        years = season_summaries()
        if years:
            return reply(f'{len(title_counts())} clubs won a Premier League title from {years[-1]["label"]} through {years[0]["label"]}.', HONOURS, HISTORY_DATABASE)
    if re.search(r'most (?:league |premier league )?titles|titles record|most championships', query):
        leaders = title_counts()
        if leaders:
            return reply(f'{leaders[0]["club"]} won the most Premier League titles, with {leaders[0]["titles"]}.', HONOURS, HISTORY_DATABASE)
    if clubs and re.search(r'how many.*(?:titles|championships)|(?:titles|championships).*how many|when did.*win.*title', query):
        years = [row['label'] for row in reversed(season_summaries()) if row['champion'] == clubs[0]]
        answer = f'{clubs[0]} won {len(years)} Premier League title{"s" if len(years) != 1 else ""} in the completed seasons covered here.'
        return reply(answer + (' Winning seasons: ' + ', '.join(years) + '.' if years else ''), HONOURS, HISTORY_DATABASE)
    if year is not None and re.search(r'golden boot|top (?:goal)?scorer|scored the most goals|leading scorer|runner.?up|finished second|finished (?:in )?2nd|third.place|finished third', query):
        return recorded_answer(query, year, clubs)
    for pattern, answer, source in FACTS:
        if re.search(pattern, query):
            return reply(answer, source)
    if re.search(r'how (?:does|is).*league|promotion|relegation|how many teams|league rules|tiebreak', query):
        return reply('Twenty clubs play each other home and away, for 38 matches each. A win earns three points and a draw earns one. The bottom three clubs are relegated.', HONOURS)
    if re.search(r'first (?:premier league )?(?:title|champions?|season)|inaugural|(?:most recent|reigning|last season).*champion|who won.*last season', query) and not clubs:
        years = season_summaries()
        if years:
            if re.search(r'first|inaugural', query):
                first = years[-1]
                return reply(f'{first["champion"]} won the first Premier League season in {first["label"]} with {first["champion_points"]} points.',
                             ('1992/93 official season review', OFFICIAL + '/news/58731'), *history_sources(season_report(first['year'])))
            return reply(f'{years[0]["champion"]} won the {years[0]["label"]} Premier League, the latest completed season in the database.', HONOURS, HISTORY_DATABASE)
    if year is not None or (clubs and re.search(r'stat|record|archive|history|goals|won|match|results?|\bvs\b|versus|against', query)):
        return recorded_answer(query, year, clubs)
    if re.search(r'\b(?:history|historic|origins)\b|give me.*overview', query):
        return reply('The Premier League began in 1992 with 22 clubs. Manchester United won the first season. Landmark seasons include Arsenal’s unbeaten 2003/04, Leicester City’s 2015/16 title and Manchester City’s 100 points in 2017/18.', HISTORY, HONOURS)
    if query in ('hi', 'hey', 'hello', 'help', 'what can you do', 'what can i ask'):
        return reply('Ask me about Premier League champions, records, the modelled archive, current standings or how to play Tactical 11.', HISTORY, LIVE)
    return None


general_calls = deque()
general_lock = Lock()


def general_answer(message, key):
    now = monotonic()
    with general_lock:
        while general_calls and now - general_calls[0] >= 60:
            general_calls.popleft()
        if len(general_calls) >= 6:
            return reply('General questions are busy right now. Try again in a minute.')
        general_calls.append(now)
    body = json.dumps({
        'model': os.getenv('PL_CHAT_OPENAI_MODEL', 'gpt-5-mini'), 'store': False,
        'instructions': 'Answer clearly and briefly in plain text. You have no live feed or search in this mode. State uncertainty about recent football results. Do not invent citations or claim to speak for the Premier League.',
        'input': message, 'max_output_tokens': 800,
    }).encode()
    request = Request('https://api.openai.com/v1/responses', data=body, headers={'Content-Type': 'application/json'})
    request.add_unredirected_header('Authorization', 'Bearer ' + key)
    try:
        with urlopen(request, timeout=12) as response:
            result = json.loads(response.read(64 * 1024))
        text = '\n'.join(part['text'] for item in result['output'] if item['type'] == 'message'
                         for part in item['content'] if part['type'] == 'output_text').strip()
    except (OSError, ValueError, KeyError, TypeError):
        text = ''
    if not text:
        return reply('General questions are temporarily unavailable. Premier League history and site help are still available.')
    return {**reply(text[:2400]), 'mode': 'general'}


def chat_response(body):
    if len(body) > MAX_CHAT_BODY:
        return 413, reply('That request is too large.')
    try:
        request = json.loads(body)
        message = request.get('message')
    except (ValueError, AttributeError):
        message = None
    if not isinstance(message, str) or not message.strip() or len(message) > MAX_MESSAGE:
        return 400, reply(f'Enter a question of 1 to {MAX_MESSAGE} characters.')
    answer = league_answer(message.strip())
    if answer:
        return 200, answer
    key = os.getenv('PL_CHAT_OPENAI_KEY', '').strip()
    if key:
        return 200, general_answer(message.strip(), key)
    return 200, reply('I don’t have that answer. I can look up Premier League champions and records, explain xG, guide you through Tactical 11, or check the connected league feed. Try “Who won in 2015/16?”', HISTORY, LIVE)
