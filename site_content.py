"""Routes and cacheable responses shared by the standalone and Flask servers."""

import gzip
import json
import mimetypes
import os
import re
from functools import lru_cache
from hashlib import sha256
from html import escape
from pathlib import Path
from urllib.parse import urlsplit

from analysis_pages import analysis_page, standings_path
from backend.yolo_pipeline import capabilities as video_capabilities
from football_data import club_names, dataset, match_seasons
from league_feed import live_dashboard
from league_history import history_api, history_path, season_summaries
from season_forecast import season_forecast

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / 'static'
PAGES = {
    '/': ('index.html', 'Premier League Match Archive 2021–2026',
          'Explore 1,900 modelled Premier League fixtures. Filter by season, club or matchday and compare match and player statistics.'),
    '/players': ('players.html', 'Premier League Player Stats 2024/25 & 2025/26',
                 'Compare Premier League player records and projections by club, position, goals, assists, xG and xA.'),
    '/simulator': ('simulator.html', 'Tactical 11 Football Simulator',
                   'Play a tactical football match, build a starting eleven, and take on timed challenges in your browser.'),
    '/coach-board': ('coach-board.html', 'Football Coach Board',
                     'Build a custom formation, place opponents, and draw runs and passes to explain tactics on a shared pitch.'),
    '/video-analysis': ('video_analysis.html', 'Video Tactical Analysis',
                        'Turn match footage into a 2D tactical replay with tracked players, event clips and exportable reports.'),
}
NAVIGATION = [('/', 'Archive'), ('/history', 'History'), ('/live', 'Live scores'), ('/predictions', 'Predictions'),
              ('/players', 'Players'), ('/standings', 'Standings'), ('/trends', 'Trends'),
              ('/clubs', 'Clubs'), ('/simulator', 'Tactical 11'), ('/coach-board', 'Coach Board'),
              ('/video-analysis', 'Video Analysis'), ('/methodology', 'Methodology')]
ALIASES = {'/index.html': '/', '/players.html': '/players', '/simulator.html': '/simulator'}
LIVE_DATA_ROUTES = {'/api/live': (live_dashboard, 20), '/api/predictions': (season_forecast, 60)}
ASSET_LINK = re.compile(r'((?:href|src)="/static/)([\w./-]+)(#[\w-]+)?(")')
LEAGUE_BRAND = '/static/premier-league-brand.svg'


def site_origin(request_origin):
    for value in (os.environ.get('SITE_URL', ''), request_origin):
        try:
            url = urlsplit(value)
        except ValueError:
            continue
        if url.scheme in ('http', 'https') and url.hostname and not url.username and not url.password:
            if not any(character.isspace() for character in url.netloc):
                return f'{url.scheme}://{url.netloc}'
    return 'http://localhost:8000'


def canonical_path(path):
    trimmed = path.rstrip('/') or '/'
    return ALIASES.get(trimmed, trimmed)


def metadata(title, description, url):
    title, description, url = escape(title), escape(description), escape(url)
    return '\n  '.join([
        f'<title>{title} | PL Analytics</title>',
        f'<meta name="description" content="{description}">',
        '<meta name="theme-color" content="#37003c">',
        f'<link rel="canonical" href="{url}">',
        f'<link rel="icon" href="{LEAGUE_BRAND}" type="image/svg+xml" sizes="any">',
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="PL Analytics">',
        f'<meta property="og:title" content="{title}">',
        f'<meta property="og:description" content="{description}">',
        f'<meta property="og:url" content="{url}">',
        '<meta name="twitter:card" content="summary">',
    ])


def site_header(path, main_id):
    links = []
    for href, label in NAVIGATION:
        current = ' aria-current="page"' if path == href else ''
        if href != '/' and path.startswith(href + '/'):
            current = ' aria-current="true"'
        links.append(f'<a href="{href}"{current}>{label}</a>')
    return (f'<a class="skip-link" href="#{main_id}">Skip to content</a>'
            '<header class="site-header"><div class="site-header-inner">'
            '<a class="site-brand" href="/">'
            f'<img src="{LEAGUE_BRAND}#full" width="80" height="35" alt="">'
            '<span>PL Analytics</span></a>'
            f'<nav aria-label="Main navigation">{"".join(links)}</nav></div></header>')


@lru_cache(maxsize=64)
def page_details(path):
    return analysis_page(path)


def read_file(path):
    stat = path.stat()
    return cached_file(path, stat.st_mtime_ns, stat.st_size)


@lru_cache(maxsize=48)
def cached_file(path, modified, size):
    return path.read_bytes()


def version_asset(match):
    prefix, name, fragment, quote = match.groups()
    file = STATIC / name
    if not file.is_file():
        return match[0]
    if name.startswith('js/') and name.endswith('.js') and not name.endswith('.min.js'):
        compiled = STATIC / 'dist' / file.name
        if compiled.is_file() and compiled.stat().st_mtime_ns >= file.stat().st_mtime_ns:
            file, name = compiled, 'dist/' + compiled.name
    _, etag = encoded(read_file(file), False)
    return f'{prefix}{name}?v={etag[1:-1]}{fragment or ""}{quote}'


def render_page(path, origin):
    if path in PAGES:
        template, title, description = PAGES[path]
        details = ''
    else:
        report = page_details(path)
        if report is None:
            return None
        title, description, details = report
        template = 'analysis.html'

    main_id = {'/players': 'players-hub-view', '/simulator': 'main-workspace'}.get(path, 'main-content')
    html = (read_file(ROOT / 'templates' / template).decode('utf-8')
            .replace('<!-- PAGE_METADATA -->', metadata(title, description, origin + path))
            .replace('<!-- SITE_HEADER -->', site_header(path, main_id))
            .replace('<!-- PAGE_HEADING -->', escape(title))
            .replace('<!-- PAGE_DESCRIPTION -->', escape(description))
            .replace('<!-- ANALYSIS_CONTENT -->', details))
    return ASSET_LINK.sub(version_asset, html).encode('utf-8')


def sitemap(origin):
    paths = [path for path, _ in NAVIGATION]
    paths += [standings_path(year) for year in list(match_seasons())[1:]]
    paths += ['/clubs/' + key for key in club_names()]
    for season in season_summaries():
        path = history_path(season['year'])
        paths.extend((path, path + '/results'))
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            '\n'.join(f'  <url><loc>{escape(origin + path)}</loc></url>' for path in paths) +
            '\n</urlset>\n').encode('utf-8')


@lru_cache(maxsize=12)
def data_bytes(path):
    data = history_api('/api/' + path) if path == 'history' or path.startswith('history/') else dataset(path)
    if data is not None:
        return json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return None


def resource(path, origin):
    if path == '/api/analyze-video':
        return json.dumps(video_capabilities()).encode(), 'application/json; charset=utf-8', 0
    if path == '/robots.txt':
        return f'User-agent: *\nAllow: /\nSitemap: {origin}/sitemap.xml\n'.encode(), 'text/plain; charset=utf-8', 0
    if path == '/sitemap.xml':
        return sitemap(origin), 'application/xml; charset=utf-8', 0
    if path in LIVE_DATA_ROUTES:
        load, max_age = LIVE_DATA_ROUTES[path]
        payload = json.dumps(load(), ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        return payload, 'application/json; charset=utf-8', max_age
    if path.startswith('/api/'):
        data = data_bytes(path.removeprefix('/api/'))
        return (data, 'application/json; charset=utf-8', 300) if data is not None else None
    if path.startswith('/static/'):
        asset = (STATIC / path.removeprefix('/static/')).resolve()
        if asset.is_relative_to(STATIC) and asset.is_file():
            return read_file(asset), mimetypes.guess_type(asset.name)[0] or 'application/octet-stream', 300
        return None
    html = render_page(path, origin)
    return (html, 'text/html; charset=utf-8', 0) if html is not None else None


def accepts_gzip(header):
    qualities = {}
    for entry in header.lower().split(','):
        coding, _, options = entry.strip().partition(';')
        try:
            qualities[coding] = float(options.split('=', 1)[1]) if options.strip().startswith('q=') else 1
        except ValueError:
            qualities[coding] = 0
    return qualities.get('gzip', qualities.get('*', 0)) > 0


@lru_cache(maxsize=64)
def encoded(body, compress):
    payload = gzip.compress(body, compresslevel=6, mtime=0) if compress else body
    return payload, '"' + sha256(payload).hexdigest()[:24] + '"'


def representation(item, accept_encoding, if_none_match):
    body, mime, max_age = item
    compressible = len(body) >= 512 and (mime.startswith('text/') or any(
        kind in mime for kind in ('json', 'javascript', 'xml')
    ))
    compress = compressible and accepts_gzip(accept_encoding)
    payload, etag = encoded(body, compress)
    headers = {
        'Content-Type': mime,
        'Cache-Control': f'public, max-age={max_age}, must-revalidate',
        'ETag': etag,
    }
    if compressible:
        headers['Vary'] = 'Accept-Encoding'
    if compress:
        headers['Content-Encoding'] = 'gzip'
    if any(tag.strip().removeprefix('W/') in (etag, '*') for tag in if_none_match.split(',')):
        return 304, b'', headers
    headers['Content-Length'] = str(len(payload))
    return 200, payload, headers
