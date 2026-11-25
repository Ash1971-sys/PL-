"""Server-rendered reports for the bundled, modelled Premier League archive."""

from html import escape
from math import ceil

from football_data import club_names, match_seasons, season_trends, slug, standings
from league_history import history_path, season_report, season_scores, season_summaries, title_counts


def link(path, name):
    return f'<a href="{escape(path, quote=True)}">{escape(name)}</a>'


def table(title, headers, rows):
    head = ''.join(f'<th scope="col">{escape(label)}</th>' for label in headers)
    body = ''.join(
        f'<tr><th scope="row">{row[0]}</th>' + ''.join(f'<td>{value}</td>' for value in row[1:]) + '</tr>'
        for row in rows
    )
    return (f'<section class="analysis-section"><h2>{escape(title)}</h2>'
            f'<div class="analysis-table" tabindex="0" role="region" aria-label="{escape(title)}">'
            f'<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div></section>')


def cards(items):
    return '<dl class="analysis-cards">' + ''.join(
        f'<div><dt>{escape(label)}</dt><dd>{escape(str(value))}</dd></div>' for label, value in items
    ) + '</dl>'


def chart_legend(series):
    return '<ul class="plot-legend" aria-label="Chart series">' + ''.join(
        f'<li class="plot-series-{index}">{escape(label)}</li>' for index, label in enumerate(series)
    ) + '</ul>'


def paired_bars(title, series, rows, maximum):
    groups = []
    for label, values in rows:
        bars = ''.join(
            f'<div class="plot-bar"><meter class="plot-series-{index}" min="0" max="{maximum}" value="{value:.4f}" '
            f'aria-label="{escape(label)} {escape(name)}"></meter><strong>{value:.2f}</strong></div>'
            for index, (name, value) in enumerate(zip(series, values))
        )
        groups.append(f'<li class="plot-row"><span>{escape(label)}</span><div class="plot-bars">{bars}</div></li>')
    return (f'<section class="analysis-section chart-panel"><h2>{escape(title)}</h2>{chart_legend(series)}'
            f'<div class="plot-scale"><span>0</span><span>{maximum:g}</span></div>'
            f'<ul class="plot-rows">{"".join(groups)}</ul></section>')


def result_distribution(seasons):
    labels = ('Home wins', 'Draws', 'Away wins')
    rows = []
    for year, totals in seasons:
        shares = [100 * totals[key] / totals['matches'] for key in ('home_wins', 'draws', 'away_wins')]
        scores = ', '.join(f'{name} {share:.1f}%' for name, share in zip(labels, shares))
        segments = ''.join(
            f'<span class="plot-series-{index}" style="flex-basis:{share:.4f}%" aria-hidden="true">{share:.1f}%</span>'
            for index, share in enumerate(shares)
        )
        rows.append(f'<li class="plot-row"><span>{year}</span><div class="plot-stack" role="img" aria-label="{year}, {scores}">{segments}</div></li>')
    return ('<section class="analysis-section chart-panel"><h2>Results by venue</h2>' + chart_legend(labels) +
            '<ul class="plot-rows">' + ''.join(rows) + '</ul></section>')


def standings_scatter(clubs):
    points = [(club['name'], club['total']['xg'] - club['total']['xga'], club['total']['points']) for club in clubs]
    limit_x = 5 + ceil(max(abs(xg) for _, xg, _ in points) / 10) * 10
    limit_y = 10 + ceil(max(total for _, _, total in points) / 10) * 10
    dots = []
    for name, xg, total in points:
        left = 50 + 50 * xg / limit_x
        bottom = 100 * total / limit_y
        label = escape(f'{name} · {xg:+.1f} xGD · {total} points')
        dots.append(f'<span class="scatter-dot" tabindex="0" role="img" aria-label="{label}" '
                    f'style="left:{left:.3f}%;bottom:{bottom:.3f}%"><span class="scatter-label" aria-hidden="true">{label}</span></span>')
    return (f'<section class="analysis-section chart-panel"><h2>Expected goal difference vs points</h2>'
            f'<p class="scatter-note">Each point represents one club. Hover or focus a point to see its values.</p>'
            f'<div class="scatter-area"><div class="scatter-y" aria-label="Points"><span>{limit_y}</span>'
            f'<span>{limit_y // 2}</span><span>0</span></div>'
            f'<div class="scatter-field" role="group" aria-label="Club points by expected goal difference">'
            f'<span class="scatter-zero" aria-hidden="true"></span>{"".join(dots)}</div>'
            f'<div class="scatter-x" aria-label="Expected goal difference"><span>−{limit_x}</span><span>0 xGD</span>'
            f'<span>+{limit_x}</span></div></div></section>')


def standings_path(season):
    return '/standings' if season == next(iter(match_seasons())) else f'/standings/{slug(season)}'


def standings_page(season):
    navigation = '<nav class="season-links" aria-label="Standings season">' + ''.join(
        f'<a href="{standings_path(year)}"' + (' aria-current="page"' if year == season else '') + f'>{year}</a>'
        for year in match_seasons()
    ) + '</nav>'
    clubs = standings(season)
    rows = []
    for club in clubs:
        totals = club['total']
        rows.append((club['rank'], link('/clubs/' + slug(club['name']), club['name']), totals['played'],
                     totals['wins'], totals['draws'], totals['losses'], totals['gf'], totals['ga'],
                     f"{totals['gf'] - totals['ga']:+d}", totals['points'], f"{totals['xg']:.1f}",
                     f"{totals['xga']:.1f}", f"{totals['xg'] - totals['xga']:+.1f}"))
    content = navigation + table('Season table',
        ['Rank', 'Club', 'P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts', 'xG', 'xGA', 'xGD'], rows)
    content += standings_scatter(clubs)
    content += '<p class="analysis-note">P = played, GF = goals for, GA = goals against, GD = goal difference, and xGD = xG minus xGA. <a href="/methodology">How these figures are calculated</a></p>'
    return f'Premier League Standings {season}', (
        f'Explore the {season} modelled table with points, goal difference, and expected goals for all 20 clubs.'
    ), content


def trends_page():
    seasons = [(year, season_trends(matches)) for year, matches in match_seasons().items()]
    rows = []
    goal_rates = []
    for year, totals in seasons:
        matches = totals['matches']
        rate = totals['goals'] / matches
        xg_rate = totals['xg'] / matches
        rows.append((link(standings_path(year), year), matches, totals['goals'], f'{rate:.2f}',
                     f'{xg_rate:.2f}', *(f"{totals[key] / matches:.1%}" for key in ('home_wins', 'draws', 'away_wins'))))
        goal_rates.append((year, (rate, xg_rate)))
    limit = ceil(2 * max(max(rates) for _, rates in goal_rates)) / 2
    content = cards([('Seasons', len(seasons)), ('Matches', f"{sum(totals['matches'] for _, totals in seasons):,}"),
                     ('Goals', f"{sum(totals['goals'] for _, totals in seasons):,}")])
    content += '<div class="chart-grid">' + paired_bars('Goals and xG per match', ('Goals', 'Expected goals'), goal_rates, limit)
    content += result_distribution(seasons) + '</div>'
    content += table('Season comparison', ['Season', 'Matches', 'Goals', 'Goals / match', 'xG / match', 'Home wins', 'Draws', 'Away wins'], rows)
    content += '<p class="analysis-note">Win and draw rates use the number of matches in each season. <a href="/methodology">Read the data notes</a></p>'
    return 'Premier League Season Trends', 'Compare scoring rates, expected goals, and home advantage across five modelled Premier League seasons.', content


def clubs_page():
    links = ''.join(f'<li>{link("/clubs/" + key, name)}</li>' for key, name in club_names().items())
    return ('Premier League Club Profiles', 'Browse club records across the 2021/22–2025/26 modelled archive, including home and away splits.',
            f'<ul class="club-grid">{links}</ul>')


def club_page(name):
    history = [(year, next((club for club in standings(year) if club['name'] == name), None)) for year in match_seasons()]
    history = [(year, club) for year, club in history if club]
    latest, club = history[0]
    total = club['total']
    content = '<p class="analysis-note"><a href="/clubs">All clubs</a></p>'
    content += cards([('Latest archive season', latest), ('Points', total['points']), ('Goals scored', total['gf']),
                      ('Clean sheets', total['clean_sheets'])])
    venue_rates = [(year, tuple(row[side]['points'] / max(1, row[side]['played']) for side in ('home', 'away')))
                   for year, row in history]
    content += paired_bars('Points per match by venue', ('Home', 'Away'), venue_rates, 3)
    content += table('Season history', ['Season', 'Rank', 'Played', 'Points', 'Goals for', 'Goals against', 'xG', 'xGA'], [
        (link(standings_path(year), year), row['rank'], t['played'], t['points'], t['gf'], t['ga'],
         f"{t['xg']:.1f}", f"{t['xga']:.1f}") for year, row in history for t in (row['total'],)
    ])
    content += table(f'{latest} home and away splits', ['Venue', 'Played', 'Wins', 'Draws', 'Losses', 'Points / match', 'Goals for', 'Goals against'], [
        (side.title(), t['played'], t['wins'], t['draws'], t['losses'], f"{t['points'] / max(1, t['played']):.2f}", t['gf'], t['ga'])
        for side in ('home', 'away') for t in (club[side],)
    ])
    fixtures = [match for match in reversed(match_seasons()[latest]) if name in (match['home_team'], match['away_team'])][:5]
    content += table(f'Last five matches in {latest}', ['Date', 'Home', 'Score', 'Away'], [
        (m['date'], escape(m['home_team']), f"{m['home_goals']}–{m['away_goals']}", escape(m['away_team'])) for m in fixtures
    ])
    return f'{name} Statistics', f'Explore {name} across the modelled archive, including season finishes, home and away performance, and recent results.', content


def history_credits(sources):
    items = ''.join(f'<li>{link(source["url"], source["title"])} · {link(source["license_url"], source["license"])}</li>'
                    for source in sources)
    return '<section class="analysis-section prose-section"><h2>Sources</h2><ul>' + items + '</ul></section>'


def league_history_page():
    seasons = season_summaries()
    title = 'Premier League History'
    if not seasons:
        return title, 'Browse finished Premier League seasons.', '<p class="analysis-note">The historical database is unavailable.</p>'
    description = f'Explore recorded results and final tables from {seasons[-1]["label"]} to {seasons[0]["label"]}.'
    matches = sum(season['stored_matches'] for season in seasons)
    content = cards([('Completed seasons', len(seasons)), ('Match results', f'{matches:,}'), ('Title-winning clubs', len(title_counts()))])
    content += table('Completed seasons', ['Season', 'Champion', 'Runner-up', 'Third place', 'Title points'], [
        (link(history_path(row['year']), row['label']), escape(row['champion']), escape(row['runner_up']),
         escape(row['third_place']), row['champion_points']) for row in seasons
    ])
    content += table('Premier League titles by club', ['Club', 'Titles', 'Latest title'], [
        (escape(row['club']), row['titles'], row['latest_title']) for row in title_counts()
    ])
    content += '<p class="analysis-note">The historical database uses Wikipedia’s published tables and open match scores from OpenFootball. Each season links directly to its sources. <a href="/api/history">Season index API</a></p>'
    return title, description, content


def historical_season_page(record, results_only=False):
    year, label = record['year'], record['label']
    parent = '<p class="analysis-note"><a href="/history">All completed seasons</a>'
    if results_only:
        scores = season_scores(year)
        content = parent + f' · {link(history_path(year), "Final table")}</p>'
        content += table('Match results', ['Date', 'Home', 'Score', 'Away'], [
            (match['date'], escape(match['home']), f"{match['home_goals']}–{match['away_goals']}", escape(match['away']))
            for match in scores['matches']
        ]) if scores['matches'] else '<p class="analysis-note">Match scores are unavailable for this season.</p>'
        return f'{label} Premier League Results', f'Historical match scores from the {label} Premier League season.', content + history_credits(record['sources'])

    content = parent + f' · {link(history_path(year) + "/results", "Match results")}</p>'
    summary = [('Champion', record['champion']), ('Runner-up', record['runner_up']),
               ('Title points', record['champion_points']), ('Match results', record['stored_matches'])]
    if record['scoring_leaders']:
        summary.append(('Leading scorers', record['scoring_leaders']))
    content += cards(summary)
    content += table('Final league table', ['Pos', 'Club', 'P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'], [
        (row['position'], escape(row['club']), row['played'], row['wins'], row['draws'], row['losses'],
         row['goals_for'], row['goals_against'], f"{row['goals_for'] - row['goals_against']:+d}", row['points'])
        for row in record['standings']
    ])
    content += '<p class="analysis-note">Points and positions follow the published table, including any deductions.</p>'
    return f'{label} Premier League Final Table', f'{record["champion"]} won the {label} Premier League. See the full table and recorded results.', content + history_credits(record['sources'])


METHODOLOGY = '''
<section class="analysis-section prose-section">
  <h2>Where the data comes from</h2>
  <p>The match archive contains modelled fixtures and results for five seasons, using generated schedules, scores, and match statistics. The player hub combines the bundled 2024/25 player data with modelled 2025/26 projections. The site is an independent project.</p>
  <p>The <a href="/history">historical database</a> contains published final tables from Wikipedia and recorded scores from OpenFootball. Use it for actual historical results. The modelled archive remains available for xG, possession, and other illustrative metrics.</p>
  <h2>How the tables are calculated</h2>
  <p>Teams earn three points for a win and one for a draw. The season table sorts by points, goal difference, and goals scored. Club pages use the same match rows for home and away splits. A clean sheet means conceding zero goals.</p>
  <h2>Expected goals and per-90 rates</h2>
  <p>Expected goals (xG) and expected goals against (xGA) total the modelled chances for and against a club. Player per-90 rates divide an event total by minutes played and multiply by 90. Shot conversion divides goals by recorded shots.</p>
  <h2>Tactical 11</h2>
  <p>The simulator uses its own shot and possession rules. Club squads come from the 2024/25 player data, and challenge results are saved in the current browser.</p>
  <h2>Live data and forecasts</h2>
  <p>The <a href="/live">live match centre</a> shows reported fixtures, scores, and tables. The <a href="/predictions">next-season forecast</a> estimates club scoring and conceding rates from real results and simulates a home and away meeting for every pairing. The current clubs are taken as a provisional lineup.</p>
</section>
'''

FEED_CREDITS = '''
<p class="analysis-note">Community data from <a href="https://www.openligadb.de/">OpenLigaDB</a>, licensed under <a href="https://www.openligadb.de/en/license">ODbL 1.0</a>. Optional feed data provided by <a href="https://www.football-data.org/">football-data.org</a>.</p>
'''

LIVE_PAGE = '''
<div class="data-controls">
  <button type="button" class="data-refresh">Refresh</button>
  <a href="https://www.premierleague.com/en/matches">Official match centre</a>
  <a href="https://www.premierleague.com/en/tables">Official table</a>
</div>
<p class="data-status" role="status" data-status>Checking the score and standings feeds…</p>
<div id="league-hub" data-view="live" aria-busy="true"></div>
<noscript><p>Use the official links above for scores and standings without JavaScript.</p></noscript>
''' + FEED_CREDITS + '<script defer src="/static/js/league-hub.js"></script>'

PREDICTIONS_PAGE = '''
<div class="data-controls">
  <button type="button" class="data-refresh">Refresh forecast</button>
  <a href="/live">View current results</a>
</div>
<p class="data-status" role="status" data-status>Loading the next-season model…</p>
<div id="league-hub" data-view="forecast" aria-busy="true"></div>
<section class="analysis-section prose-section">
  <h2>How to read the forecast</h2>
  <p>The model fits scoring and conceding rates from reported results, pulling small samples toward the league average. It simulates 1,500 full seasons with home advantage and ranks teams by points, goal difference, and goals scored.</p>
  <p>The finish range shows the middle 80% of simulated positions. The current 20 clubs are a provisional lineup. Promotion, transfers, injuries, and managerial changes can change the outlook.</p>
</section>
<noscript><p>Enable JavaScript to see the latest projected table.</p></noscript>
''' + FEED_CREDITS + '<script defer src="/static/js/league-hub.js"></script>'


def analysis_page(path):
    if path == '/history':
        return league_history_page()
    for item in season_summaries() if path.startswith('/history/') else ():
        base = history_path(item['year'])
        if path in (base, base + '/results'):
            return historical_season_page(season_report(item['year']), path.endswith('/results'))
    if path == '/live':
        return ('Premier League Live Scores and Standings',
                'Follow reported scores, recent results, upcoming Premier League fixtures, and the current league table. Community coverage can be delayed.',
                LIVE_PAGE)
    if path == '/predictions':
        return ('Premier League Next-Season Predictions',
                'Explore a projected Premier League table with title, top-four, and bottom-three chances based on actual results and 1,500 season simulations.',
                PREDICTIONS_PAGE)
    if path == '/trends':
        return trends_page()
    if path == '/clubs':
        return clubs_page()
    if path == '/methodology':
        return 'Data and Methodology', 'Learn how the modelled Premier League archive, player projections, and Tactical 11 simulation are built.', METHODOLOGY
    for year in match_seasons():
        if standings_path(year) == path:
            return standings_page(year)
    if path.startswith('/clubs/') and (name := club_names().get(path.removeprefix('/clubs/'))):
        return club_page(name)
    return None
