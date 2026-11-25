(() => {
  const hub = document.getElementById('league-hub');
  const status = document.querySelector('[data-status]');
  const refresh = document.querySelector('.data-refresh');
  const live = hub.dataset.view === 'live';
  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const labels = {
    scheduled: 'Scheduled', playing: 'In progress', reported: 'Score reported',
    finished: 'Full time', awaiting: 'Awaiting result', postponed: 'Postponed',
    suspended: 'Suspended', cancelled: 'Cancelled'
  };
  let timer;
  let loading = false;

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function table(title, headings, rows, empty) {
    const section = element('section', undefined, 'analysis-section');
    section.append(element('h2', title));
    if (!rows.length) {
      section.append(element('p', empty, 'analysis-note'));
      return section;
    }

    const region = element('div', undefined, 'analysis-table');
    region.tabIndex = 0;
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', title);
    const grid = element('table');
    const header = grid.createTHead().insertRow();
    headings.forEach(label => {
      const cell = element('th', label);
      cell.scope = 'col';
      header.append(cell);
    });
    const body = grid.createTBody();
    rows.forEach(values => {
      const row = body.insertRow();
      values.forEach((value, i) => {
        const cell = element(i === 0 ? 'th' : 'td', value);
        if (i === 0) cell.scope = 'row';
        row.append(cell);
      });
    });
    region.append(grid);
    section.append(region);
    return section;
  }

  function date(value) {
    return value ? dateFormat.format(new Date(value)) : 'unavailable';
  }

  function fixtureTable(title, matches, empty) {
    const rows = matches.map(match => {
      const score = ['finished', 'playing', 'reported'].includes(match.state) && match.score;
      return [`${match.home} vs ${match.away}`, score ? score.join('–') : '—',
        labels[match.state], match.week ?? '—', date(match.kickoff)];
    });
    return table(title, ['Match', 'Score', 'Status', 'Week', 'Kickoff (local time)'], rows, empty);
  }

  function renderLive(data) {
    const hasFeed = data.match_state !== 'unavailable';
    const message = hasFeed
      ? `${data.season} · ${data.match_source} scores checked ${date(data.match_checked_at)}.`
      : `${data.season} · The connected score feed is temporarily unavailable. Try Refresh or use the official match centre.`;
    let detail = '';
    if (data.match_state === 'stale') detail = ' Some fixtures show the last successful refresh.';
    else if (hasFeed && data.match_source === 'OpenLigaDB') detail = ' Community reports can arrive after kickoff or full time.';
    else if (hasFeed) detail = ' Score timing depends on the provider plan.';
    status.textContent = message + detail;

    const sections = [];
    if (hasFeed) {
      sections.push(fixtureTable('Matches in progress', data.playing, 'The provider has reported no matches in progress.'));
      sections.push(fixtureTable('Recent confirmed results', data.recent, 'The provider has not confirmed any results in this fixture window.'));
      sections.push(fixtureTable('Upcoming fixtures', data.upcoming, 'The provider has no upcoming fixtures in this window.'));
      if (data.awaiting.length) sections.push(fixtureTable('Awaiting updates', data.awaiting));
    }
    const standings = table(`${data.season} standings`, ['Club', 'Pos', 'P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'],
      data.standings.map((team, i) => [team.club, i + 1, team.played, team.wins, team.draws, team.losses,
        team.gf, team.ga, team.gf - team.ga, team.points]), 'The connected standings feed is temporarily unavailable.');
    if (data.standings.length) {
      const qualifier = data.table_stale ? ' · Last successful refresh' : '';
      standings.append(element('p', `${data.table_source} · Table checked ${date(data.table_checked_at)}${qualifier}`, 'analysis-note'));
    }
    sections.push(standings);
    hub.replaceChildren(...sections);
  }

  function renderForecast(data) {
    if (!data.rows.length) {
      status.textContent = `The ${data.season} forecast is waiting for enough reported results. Check back after matches have been recorded.`;
      hub.replaceChildren();
      return;
    }

    const snapshot = data.input_status === 'bundled' ? 'Saved standings snapshot' :
      data.input_status === 'cached' ? 'Last available standings' : 'Connected standings';
    status.textContent = `${data.season} forecast · ${snapshot}: ${data.input_matches} ${data.input_season} matches from ${data.source}, checked ${date(data.checked_at)}.`;
    const favorite = data.rows.reduce((best, row) => row.title > best.title ? row : best);
    const cards = element('dl', undefined, 'analysis-cards forecast-cards');
    [['Season forecast', data.season], ['Title favorite', favorite.club],
      ['Favorite’s title chance', `${favorite.title}%`], ['Simulated seasons', data.simulations.toLocaleString()]].forEach(([label, value]) => {
      const card = element('div');
      card.append(element('dt', label), element('dd', value));
      cards.append(card);
    });
    const rankings = table('Projected table',
      ['Club', 'Pos', 'Expected pts', '80% finish range', 'Title', 'Top four', 'Bottom three', 'Matches used'],
      data.rows.map((row, i) => [row.club, i + 1, row.points.toFixed(1), row.finish_range.join('–'),
        `${row.title}%`, `${row.top_four}%`, `${row.bottom_three}%`, row.source_matches]));
    hub.replaceChildren(cards, forecastPlot(data.rows), rankings);
  }

  function forecastPlot(clubs) {
    const metrics = {
      title: { label: 'Title chance', max: 100, suffix: '%' },
      top_four: { label: 'Top-four chance', max: 100, suffix: '%' },
      bottom_three: { label: 'Bottom-three risk', max: 100, suffix: '%' },
      points: { label: 'Expected points', max: 114, suffix: '' }
    };
    const panel = element('section', undefined, 'analysis-section chart-panel forecast-plot');
    const label = element('label', 'Show');
    const select = element('select');
    select.id = 'forecast-metric';
    label.htmlFor = select.id;
    for (const [value, metric] of Object.entries(metrics)) {
      const option = element('option', metric.label);
      option.value = value;
      select.append(option);
    }
    label.append(select);
    const scale = element('div', undefined, 'plot-scale');
    const list = element('ul', undefined, 'plot-rows');

    function draw(key) {
      const metric = metrics[key];
      scale.replaceChildren(element('span', `0${metric.suffix}`), element('span', `${metric.max}${metric.suffix}`));
      const sorted = clubs.slice().sort((a, b) => b[key] - a[key]).slice(0, 8);
      const rows = sorted.map(team => {
        const row = element('li', undefined, 'plot-row');
        const bar = element('div', undefined, 'plot-bar');
        const meter = element('meter', undefined, 'plot-series-0');
        meter.min = 0;
        meter.max = metric.max;
        meter.value = team[key];
        meter.setAttribute('aria-label', `${team.club} ${metric.label.toLowerCase()}`);
        bar.append(meter, element('strong', `${team[key].toFixed(1)}${metric.suffix}`));
        row.append(element('span', team.club), bar);
        return row;
      });
      list.replaceChildren(...rows);
    }

    select.addEventListener('change', () => draw(select.value));
    draw('title');
    panel.append(element('h2', 'Forecast comparison · top eight'), label, scale, list);
    return panel;
  }

  async function load() {
    if (loading) return;
    clearTimeout(timer);
    loading = true;
    refresh.disabled = true;
    let wait = 120;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch(live ? '/api/live' : '/api/predictions', {
        cache: 'no-cache', signal: controller.signal
      });
      if (!response.ok) throw new Error('Data request failed');
      const data = await response.json();
      if (live) {
        renderLive(data);
        wait = Math.max(67, data.refresh_after || 300);
      } else {
        renderForecast(data);
      }
    } catch (_) {
      status.textContent = hub.childElementCount
        ? 'Refresh failed. Showing the last data this page received.'
        : 'Data could not load. Use Refresh to try again.';
    } finally {
      clearTimeout(timeout);
      hub.setAttribute('aria-busy', 'false');
      refresh.disabled = false;
      loading = false;
      if (live && !document.hidden) timer = setTimeout(load, wait * 1000);
    }
  }

  refresh.addEventListener('click', load);
  if (live) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearTimeout(timer);
      else load();
    });
  }
  load();
})();
