/**
 * Premier League Analytics Archive & Player Hub
 * High-Density Data Engine powered by Radash (<15KB)
 * 100% Data-Integrated for 2021–2026 Matches & 2025/2026 Players
 */

(function() {
  'use strict';

  // Venue map for authentic stadium names
  var VENUES = {
    'Arsenal': 'Emirates Stadium',
    'Aston Villa': 'Villa Park',
    'Bournemouth': 'Vitality Stadium',
    'Brentford': 'Gtech Community Stadium',
    'Brighton & Hove Albion': 'Amex Stadium',
    'Chelsea': 'Stamford Bridge',
    'Crystal Palace': 'Selhurst Park',
    'Everton': 'Goodison Park',
    'Fulham': 'Craven Cottage',
    'Ipswich Town': 'Portman Road',
    'Leicester City': 'King Power Stadium',
    'Liverpool': 'Anfield',
    'Manchester City': 'Etihad Stadium',
    'Manchester United': 'Old Trafford',
    'Newcastle United': "St. James' Park",
    'Nottingham Forest': 'City Ground',
    'Southampton': "St. Mary's Stadium",
    'Tottenham Hotspur': 'Tottenham Hotspur Stadium',
    'West Ham United': 'London Stadium',
    'Wolverhampton Wanderers': 'Molineux Stadium',
    'Leeds United': 'Elland Road',
    'Burnley': 'Turf Moor',
    'Watford': 'Vicarage Road',
    'Norwich City': 'Carrow Road',
    'Luton Town': 'Kenilworth Road',
    'Sheffield United': 'Bramall Lane'
  };

  // Club short codes
  var CLUB_CODES = {
    'Arsenal': 'ARS',
    'Aston Villa': 'AVL',
    'Bournemouth': 'BOU',
    'Brentford': 'BRE',
    'Brighton & Hove Albion': 'BHA',
    'Chelsea': 'CHE',
    'Crystal Palace': 'CRY',
    'Everton': 'EVE',
    'Fulham': 'FUL',
    'Ipswich Town': 'IPS',
    'Leicester City': 'LEI',
    'Liverpool': 'LIV',
    'Manchester City': 'MCI',
    'Manchester United': 'MUN',
    'Newcastle United': 'NEW',
    'Nottingham Forest': 'NFO',
    'Southampton': 'SOU',
    'Tottenham Hotspur': 'TOT',
    'West Ham United': 'WHU',
    'Wolverhampton Wanderers': 'WOL',
    'Leeds United': 'LEE',
    'Burnley': 'BUR',
    'Watford': 'WAT',
    'Norwich City': 'NOR',
    'Luton Town': 'LUT',
    'Sheffield United': 'SHU'
  };

  // Global State Store
  var state = {
    matches: [],
    players: [],
    
    // Match Archive State
    matchSeason: '2025/26',
    matchClub: 'All',
    matchRound: 'All',
    matchResult: 'All',
    matchSearch: '',
    matchPage: 1,
    matchPerPage: 10,
    expandedMatchIndex: null,

    // Home Right Panel Leaderboard State
    leaderboardSeason: 2026,
    leaderboardMetric: 'goals',
    pitchMode: 'attacking',

    // Player Hub State
    playerSeason: 2025,
    playerPosition: 'All',
    playerClub: 'All',
    playerSearch: '',
    playerSortKey: 'goals',
    playerSortDesc: true,
    playerPage: 1,
    playerPerPage: 25,
    activePitchPlayer: null,
    comparePlayerIdA: null,
    comparePlayerIdB: null
  };

  // -------------------------------------------------------------
  // Only request the selected season. Reuse in-flight and previously loaded requests.
  var requests = {};
  var leaders;
  var duel;
  var loadVersion = 0;

  function fetchData(path) {
    if (!requests[path]) {
      requests[path] = fetch('/api/' + path).then(function(response) {
        if (!response.ok) throw new Error('Archive request failed');
        return response.json();
      }).catch(function(error) {
        delete requests[path];
        throw error;
      });
    }
    return requests[path];
  }

  function loadSeason(kind, season) {
    var version = ++loadVersion;
    var status = document.getElementById('dataset-status');
    var table = document.getElementById(kind === 'matches' ? 'matchesTableBody' : 'playersTableBody');
    status.textContent = 'Loading ' + (season === 'all' ? 'all seasons' : season) + '…';
    status.hidden = false;
    table.setAttribute('aria-busy', 'true');
    state[kind] = [];
    var render = kind === 'matches' ? renderMatchArchive : renderPlayerHub;
    var renderTable = kind === 'matches' ? renderMatchesTable : renderPlayerTable;
    renderTable([]);

    fetchData(kind + '/' + String(season).replace('/', '-')).then(function(rows) {
      if (version !== loadVersion) return;
      state[kind] = rows;
      if (kind === 'matches') {
        fillMatchClubFilter();
      } else {
        fillPlayerClubFilter();
      }
      status.hidden = true;
      table.removeAttribute('aria-busy');
      render();
    }).catch(function() {
      if (version !== loadVersion) return;
      table.removeAttribute('aria-busy');
      status.textContent = 'This season could not load. ';
      var retry = document.createElement('button');
      retry.textContent = 'Retry';
      retry.className = 'underline font-bold';
      retry.addEventListener('click', function() { loadSeason(kind, season); });
      status.appendChild(retry);
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('matchesTableBody')) {
      initOpeningCurtain();
      initMatchArchiveView();
      fetchData('archive-summary').then(function(summary) {
        leaders = summary.leaders;
        duel = summary.duel;
        renderHeroKPICards(getFilteredMatches());
        renderRightLeaderboard();
        renderHeadToHeadDuel();
      }).catch(function() {
        document.getElementById('leaderboardList').textContent = 'Player leaders are temporarily unavailable.';
        document.getElementById('h2hMetricsContainer').textContent = 'Comparison temporarily unavailable.';
      });
    } else if (document.getElementById('playersTableBody')) {
      initPlayerHubView();
    }
  });

  function initOpeningCurtain() {
    var curtain = document.getElementById('broadcastCurtain');
    if (!curtain || typeof curtain.showModal !== 'function') return;

    var topPanel = document.getElementById('curtainTop');
    var enter = document.getElementById('enterHubBtn');
    var replay = document.getElementById('replayIntroBtn');
    var returnFocus = document.getElementById('main-content');
    var timer;

    function finishOpening() {
      clearTimeout(timer);
      curtain.close();
      curtain.classList.remove('is-opening');
      returnFocus.focus({ preventScroll: true });
    }

    function openCurtain() {
      if (curtain.classList.contains('is-opening')) return;
      curtain.classList.add('is-opening');
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        finishOpening();
      } else {
        timer = setTimeout(finishOpening, 950);
      }
    }

    topPanel.addEventListener('transitionend', function(event) {
      if (event.target === topPanel && event.propertyName === 'transform' && curtain.classList.contains('is-opening')) {
        finishOpening();
      }
    });
    enter.addEventListener('click', openCurtain);
    curtain.addEventListener('cancel', function(event) {
      event.preventDefault();
      openCurtain();
    });
    replay.addEventListener('click', function() {
      returnFocus = replay;
      curtain.showModal();
    });
    replay.hidden = false;
    if (!window.location.hash) curtain.showModal();
  }

  function initMatchArchiveView() {
    populateMatchRoundsDropdown();
    bindMatchArchiveEvents();
    loadSeason('matches', state.matchSeason);
  }

  function fillMatchClubFilter() {
    var select = document.getElementById('clubFilterSelect');
    if (!select || !state.matches) return;

    var clubs = radash.unique(
      radash.select(state.matches, function(m) { return m.home_team; })
    );
    clubs = radash.alphabetical(clubs, function(c) { return c; });

    select.innerHTML = '<option value="All">ALL CLUBS</option>' +
      clubs.map(function(c) {
        var code = CLUB_CODES[c] || c.substring(0, 3).toUpperCase();
        return '<option value="' + c + '">' + c.toUpperCase() + ' (' + code + ')</option>';
      }).join('');
    if (clubs.indexOf(state.matchClub) === -1) state.matchClub = 'All';
    select.value = state.matchClub;
  }

  function populateMatchRoundsDropdown() {
    var select = document.getElementById('roundFilterSelect');
    if (!select) return;

    var html = '<option value="All">ALL MATCHDAYS (1–38)</option>';
    for (var r = 1; r <= 38; r++) {
      html += '<option value="' + r + '">MATCHDAY ' + r + '</option>';
    }
    select.innerHTML = html;
  }

  function bindMatchArchiveEvents() {
    // Season buttons
    var seasonBtns = document.querySelectorAll('.season-btn');
    seasonBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        seasonBtns.forEach(function(b) {
          b.className = 'season-btn px-3 py-1.5 font-display font-bold text-xs uppercase bg-[#efedf5] text-[#37003c] hover:bg-[#e3e1ea] transition-none cursor-pointer';
        });
        btn.className = 'season-btn px-3 py-1.5 font-display font-bold text-xs uppercase bg-[#00ff85] text-[#37003c] border-2 border-[#00ff85] font-extrabold transition-none cursor-pointer';
        
        state.matchSeason = btn.getAttribute('data-season');
        state.matchPage = 1;
        state.expandedMatchIndex = null;
        
        loadSeason('matches', state.matchSeason);
      });
    });

    // Dropdown filters
    var clubSel = document.getElementById('clubFilterSelect');
    if (clubSel) {
      clubSel.addEventListener('change', function(e) {
        state.matchClub = e.target.value;
        state.matchPage = 1;
        renderMatchArchive();
      });
    }

    var roundSel = document.getElementById('roundFilterSelect');
    if (roundSel) {
      roundSel.addEventListener('change', function(e) {
        state.matchRound = e.target.value;
        state.matchPage = 1;
        renderMatchArchive();
      });
    }

    var resSel = document.getElementById('resultFilterSelect');
    if (resSel) {
      resSel.addEventListener('change', function(e) {
        state.matchResult = e.target.value;
        state.matchPage = 1;
        renderMatchArchive();
      });
    }

    var searchInp = document.getElementById('fixtureSearchInput');
    if (searchInp) {
      var debouncedMatchSearch = radash.debounce(function(val) {
        state.matchSearch = val;
        state.matchPage = 1;
        renderMatchArchive();
      }, 160);
      searchInp.addEventListener('input', function(e) {
        debouncedMatchSearch(e.target.value.trim().toLowerCase());
      });
    }

    var resetBtn = document.getElementById('btnResetFilters');
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        state.matchClub = 'All';
        state.matchRound = 'All';
        state.matchResult = 'All';
        state.matchSearch = '';
        state.matchPage = 1;
        if (clubSel) clubSel.value = 'All';
        if (roundSel) roundSel.value = 'All';
        if (resSel) resSel.value = 'All';
        if (searchInp) searchInp.value = '';
        renderMatchArchive();
      });
    }

    // Right Column Leaderboard Campaign Toggle (2025 vs 2026)
    var btnCamp25 = document.getElementById('btnCamp25');
    var btnCamp26 = document.getElementById('btnCamp26');
    if (btnCamp25 && btnCamp26) {
      btnCamp25.addEventListener('click', function() {
        btnCamp25.className = 'py-1 px-2 font-display font-extrabold text-xs uppercase bg-[#00ff85] text-[#37003c] border-2 border-[#00ff85] text-center transition-none cursor-pointer';
        btnCamp26.className = 'py-1 px-2 font-display font-bold text-xs uppercase bg-[#efedf5] text-[#4f434d] border border-[#d2c2cd] hover:bg-[#e3e1ea] text-center transition-none cursor-pointer';
        state.leaderboardSeason = 2025;
        renderRightLeaderboard();
      });
      btnCamp26.addEventListener('click', function() {
        btnCamp26.className = 'py-1 px-2 font-display font-extrabold text-xs uppercase bg-[#00ff85] text-[#37003c] border-2 border-[#00ff85] text-center transition-none cursor-pointer';
        btnCamp25.className = 'py-1 px-2 font-display font-bold text-xs uppercase bg-[#efedf5] text-[#4f434d] border border-[#d2c2cd] hover:bg-[#e3e1ea] text-center transition-none cursor-pointer';
        state.leaderboardSeason = 2026;
        renderRightLeaderboard();
      });
    }

    // Right Column Sub-metric Tabs
    var metricBtns = document.querySelectorAll('.sub-metric-btn');
    metricBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        metricBtns.forEach(function(b) {
          b.className = 'sub-metric-btn text-[#4f434d] hover:text-[#37003c] uppercase pb-0.5 cursor-pointer';
        });
        btn.className = 'sub-metric-btn text-[#37003c] font-black border-b-2 border-[#37003c] pb-0.5 uppercase cursor-pointer';
        state.leaderboardMetric = btn.getAttribute('data-metric');
        renderRightLeaderboard();
      });
    });

    // Pitch Mode Toggle
    var pitchBtns = document.querySelectorAll('.pitch-mode-btn');
    pitchBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        pitchBtns.forEach(function(b) {
          b.className = 'pitch-mode-btn bg-[#240028] text-[#d1d1d6] py-1 border border-[#37003c] hover:text-white cursor-pointer';
        });
        btn.className = 'pitch-mode-btn bg-[#00ff85] text-[#37003c] font-black py-1 border border-[#00ff85] cursor-pointer';
        state.pitchMode = btn.getAttribute('data-mode');
        updatePitchSchematic();
      });
    });
  }

  function getFilteredMatches() {
    return state.matches.filter(function(m) {
      // Season
      if (state.matchSeason !== 'all' && m.season !== state.matchSeason) {
        return false;
      }
      // Club
      if (state.matchClub !== 'All' && m.home_team !== state.matchClub && m.away_team !== state.matchClub) {
        return false;
      }
      // Round
      if (state.matchRound !== 'All' && String(m.matchweek) !== String(state.matchRound)) {
        return false;
      }
      // Outcome
      if (state.matchResult !== 'All') {
        if (state.matchResult === 'H' && m.home_goals <= m.away_goals) return false;
        if (state.matchResult === 'A' && m.away_goals <= m.home_goals) return false;
        if (state.matchResult === 'D' && m.home_goals !== m.away_goals) return false;
      }
      // Search
      if (state.matchSearch) {
        var text = (m.home_team + ' ' + m.away_team + ' ' + (VENUES[m.home_team] || '') + ' ' + m.home_goals + '-' + m.away_goals).toLowerCase();
        if (text.indexOf(state.matchSearch) === -1) return false;
      }
      return true;
    });
  }

  function renderMatchArchive() {
    var filtered = getFilteredMatches();
    renderHeroKPICards(filtered);
    renderMatchesTable(filtered);
    renderPagination(filtered);
  }

  function renderHeroKPICards(matches) {
    var kpiTotal = document.getElementById('kpiTotalMatches');
    var kpiAvg = document.getElementById('kpiAvgGoals');
    var badge = document.getElementById('matchesSyncedBadge');

    var total = matches.length;
    var totalGoals = radash.sum(matches, function(m) { return m.home_goals + m.away_goals; });
    var avgGoals = total > 0 ? (totalGoals / total).toFixed(2) : '0.00';

    if (kpiTotal) kpiTotal.innerText = total.toLocaleString();
    if (kpiAvg) kpiAvg.innerText = avgGoals;
    var avgXg = document.getElementById('kpiAvgXg');
    if (avgXg) {
      var sumXg = radash.sum(matches, function(match) { return match.home_xg + match.away_xg; });
      avgXg.textContent = total ? 'xG / MATCH: ' + (sumXg / total).toFixed(2) : 'xG / MATCH: —';
    }
    if (badge) badge.innerText = 'SYNCED: ' + total.toLocaleString() + ' / ' + state.matches.length.toLocaleString();

    var latest = state.matchSeason === '2025/26' || state.matchSeason === 'all';
    var campaign = leaders && leaders[latest ? 2026 : 2025];
    var campaignLabel = latest ? '2025/26 projection' : '2024/25 player data';
    document.getElementById('scorer-campaign').textContent = campaignLabel;
    document.getElementById('assist-campaign').textContent = campaignLabel;
    var topScorer = campaign && campaign.goals[0];
    var topAssister = campaign && campaign.assists[0];

    if (topScorer) {
      var nameEl = document.getElementById('kpiTopScorerName');
      var clubEl = document.getElementById('kpiTopScorerClub');
      var goalsEl = document.getElementById('kpiTopScorerGoals');
      var xgEl = document.getElementById('kpiTopScorerXg');
      if (nameEl) nameEl.innerText = topScorer.name.toUpperCase();
      if (clubEl) clubEl.innerText = CLUB_CODES[topScorer.club] || 'PL';
      if (goalsEl) goalsEl.innerText = topScorer.goals + ' GOALS';
      if (xgEl) xgEl.innerText = '(' + topScorer.xg + ' xG)';
    }

    if (topAssister) {
      var pNameEl = document.getElementById('kpiTopPlaymakerName');
      var pClubEl = document.getElementById('kpiTopPlaymakerClub');
      var pAssistsEl = document.getElementById('kpiTopPlaymakerAssists');
      var pXaEl = document.getElementById('kpiTopPlaymakerXa');
      if (pNameEl) pNameEl.innerText = topAssister.name.toUpperCase();
      if (pClubEl) pClubEl.innerText = CLUB_CODES[topAssister.club] || 'PL';
      if (pAssistsEl) pAssistsEl.innerText = topAssister.assists + ' ASSISTS';
      if (pXaEl) pXaEl.innerText = '(' + topAssister.xa + ' xA)';
    }
  }

  function renderMatchesTable(matches) {
    var tbody = document.getElementById('matchesTableBody');
    if (!tbody) return;

    if (!matches || !matches.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="py-8 text-center font-mono text-xs text-[#4f434d] uppercase">NO MATCH RECORDS MATCH YOUR SPECIFIED CRITERIA</td></tr>';
      return;
    }

    var start = (state.matchPage - 1) * state.matchPerPage;
    var pageSlice = matches.slice(start, start + state.matchPerPage);

    var rowsHtml = [];

    pageSlice.forEach(function(m, idx) {
      var globalIdx = start + idx;
      var isExpanded = state.expandedMatchIndex === globalIdx;

      var hCode = CLUB_CODES[m.home_team] || m.home_team.substring(0, 3).toUpperCase();
      var aCode = CLUB_CODES[m.away_team] || m.away_team.substring(0, 3).toUpperCase();
      var venue = VENUES[m.home_team] || 'Premier League Stadium';

      var formHomeHtml = renderStitchFormSquares(m.form_home);
      var formAwayHtml = renderStitchFormSquares(m.form_away);

      var borderClass = isExpanded ? 'border-l-4 border-l-[#00ff85] bg-[#f4f2fb]' : 'hover:bg-[#efedf5]';

      rowsHtml.push(
        '<tr class="' + borderClass + ' transition-none">',
        '  <td class="py-3 px-3 whitespace-nowrap">',
        '    <span class="font-bold text-[#37003c] block text-xs whitespace-nowrap">' + m.date + '</span>',
        '    <span class="text-[10px] text-[#4f434d] whitespace-nowrap">MD ' + m.matchweek + ' • ' + m.season + '</span>',
        '  </td>',
        '  <td class="py-3 px-3 text-right whitespace-nowrap">',
        '    <div class="flex items-center justify-end gap-2">',
        '      <div class="flex gap-0.5 items-center flex-none">' + formHomeHtml + '</div>',
        '      <span class="font-display font-bold text-sm text-[#37003c] whitespace-nowrap">' + m.home_team + '</span>',
        '      <span class="text-[10px] bg-[#37003c] text-white px-1.5 py-0.5 font-bold flex-none">' + hCode + '</span>',
        '    </div>',
        '  </td>',
        '  <td class="py-3 px-3 text-center whitespace-nowrap">',
        '    <div class="inline-flex items-center justify-center gap-1.5 bg-[#37003c] text-[#00ff85] font-mono font-black text-sm px-3.5 py-1 whitespace-nowrap min-w-[70px] border border-[#240028] shadow-[0_0_10px_rgba(0,255,133,0.3)] select-none">',
        '      <span class="tabular-nums font-black text-sm leading-none">' + m.home_goals + '</span>',
        '      <span class="text-white/40 text-xs font-bold leading-none select-none">–</span>',
        '      <span class="tabular-nums font-black text-sm leading-none">' + m.away_goals + '</span>',
        '    </div>',
        '  </td>',
        '  <td class="py-3 px-3 whitespace-nowrap">',
        '    <div class="flex items-center gap-2">',
        '      <span class="text-[10px] bg-[#efedf5] text-[#37003c] px-1.5 py-0.5 font-bold flex-none">' + aCode + '</span>',
        '      <span class="font-display font-medium text-sm text-[#1a1b21] whitespace-nowrap">' + m.away_team + '</span>',
        '      <div class="flex gap-0.5 items-center flex-none">' + formAwayHtml + '</div>',
        '    </div>',
        '  </td>',
        '  <td class="py-3 px-3 text-[11px] text-[#4f434d] hidden md:table-cell whitespace-nowrap">' + venue + '</td>',
        '  <td class="py-3 px-3 text-right whitespace-nowrap">',
        '    <span class="text-[#006e36] font-bold">' + m.home_xg + '</span> - <span class="text-[#4f434d]">' + m.away_xg + '</span>',
        '  </td>',
        '  <td class="py-3 px-3 text-center whitespace-nowrap">',
        '    <button class="btn-toggle-telemetry bg-[#00ff85] hover:bg-[#37003c] hover:text-[#00ff85] text-[#37003c] px-2.5 py-1 font-mono text-[10px] uppercase font-bold tracking-wider transition-none border border-[#00ff85] cursor-pointer" data-index="' + globalIdx + '">',
        '      ' + (isExpanded ? 'MATCH TELEMETRY ▴' : 'MATCH TELEMETRY ▾'),
        '    </button>',
        '  </td>',
        '</tr>'
      );

      // Expandable Stitch Drawer
      if (isExpanded) {
        var possH = m.possession_home || 50;
        var possA = 100 - possH;
        var totalShots = m.home_shots + m.away_shots;
        var shotsHPct = totalShots ? Math.round(m.home_shots / totalShots * 100) : 50;
        var maxXg = Math.max(m.home_xg, m.away_xg, 0.01);
        var corners = m.home_corners + m.away_corners;
        var homeCornersPct = corners ? 100 * m.home_corners / corners : 50;
        var shotsAPct = 100 - shotsHPct;

        rowsHtml.push(
          '<tr>',
          '  <td class="p-0 bg-[#37003c] text-white border-y-2 border-[#00ff85]" colspan="7">',
          '    <div class="p-5 flex flex-col gap-4">',
          '      <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-[#00ff85]/30 gap-2">',
          '        <div class="flex items-center gap-2">',
          '          <span class="font-mono text-[10px] bg-[#00ff85] text-[#37003c] px-2 py-0.5 font-bold">MODELLED MATCH</span>',
          '          <span class="font-display font-bold text-sm tracking-wide uppercase text-white">TACTICAL MATRIX: ' + hCode + ' ' + m.home_goals + '–' + m.away_goals + ' ' + aCode + '</span>',
          '        </div>',
          '        <div class="font-mono text-xs text-[#00ff85]">',
          '          POSSESSION: <span class="text-white font-bold">' + hCode + ' ' + possH + '%</span> | <span class="text-[#d1d1d6]">' + aCode + ' ' + possA + '%</span>',
          '        </div>',
          '      </div>',
          '      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">',
          '        <div class="bg-[#240028] p-3 border border-[#00ff85]/30">',
          '          <p class="font-mono text-xs font-bold text-[#00ff85]">EXPECTED GOALS</p>',
          '          <p class="mt-2 text-xs">' + hCode + ' · ' + m.home_xg.toFixed(2) + '</p>',
          '          <div class="h-2 bg-[#00ff85]" style="width:' + (100 * m.home_xg / maxXg) + '%"></div>',
          '          <p class="mt-2 text-xs">' + aCode + ' · ' + m.away_xg.toFixed(2) + '</p>',
          '          <div class="h-2 bg-[#ff2882]" style="width:' + (100 * m.away_xg / maxXg) + '%"></div>',
          '        </div>',
          '        <div class="bg-[#240028] p-3 border border-[#00ff85]/30 flex flex-col justify-between">',
          '          <span class="font-mono text-[10px] uppercase text-[#00ff85]">SHOTS & SET PIECES</span>',
          '          <div class="space-y-2.5 my-2">',
          '            <div>',
          '              <div class="flex justify-between font-mono text-[11px] mb-1">',
          '                <span class="text-[#00ff85] font-bold">' + m.home_shots + ' (' + m.home_shots_on_target + ' ON)</span>',
          '                <span class="text-[#d1d1d6] text-[10px] uppercase">TOTAL SHOTS</span>',
          '                <span class="text-[#ff2882] font-bold">' + m.away_shots + ' (' + m.away_shots_on_target + ' ON)</span>',
          '              </div>',
          '              <div class="w-full h-2 bg-[#1a001d] flex border border-[#37003c]">',
          '                <div class="bg-[#00ff85] h-full" style="width:' + shotsHPct + '%;"></div>',
          '                <div class="bg-[#ff2882] h-full" style="width:' + shotsAPct + '%;"></div>',
          '              </div>',
          '            </div>',
          '            <div>',
          '              <div class="flex justify-between font-mono text-[11px] mb-1">',
          '                <span class="text-[#00ff85] font-bold">' + m.home_corners + ' CORNERS</span>',
          '                <span class="text-[#d1d1d6] text-[10px] uppercase">SET PIECES</span>',
          '                <span class="text-[#ff2882] font-bold">' + m.away_corners + ' CORNERS</span>',
          '              </div>',
          '              <div class="w-full h-2 bg-[#1a001d] flex border border-[#37003c]">',
          '                <div class="bg-[#00ff85] h-full" style="width:' + homeCornersPct + '%;"></div>',
          '                <div class="bg-[#ff2882] h-full" style="width:' + (100 - homeCornersPct) + '%;"></div>',
          '              </div>',
          '            </div>',
          '          </div>',
          '          <div class="p-1.5 bg-[#1a001d] font-mono text-[11px] text-[#00ff85] flex justify-between border border-[#37003c]">',
          '            <span>FOULS & DISCIPLINE:</span>',
          '            <span class="font-bold">' + m.home_fouls + 'F (' + m.home_cards + 'C) vs ' + m.away_fouls + 'F (' + m.away_cards + 'C)</span>',
          '          </div>',
          '        </div>',
          '        <!-- Col 3: Tactical Shift & Action -->',
          '        <div class="bg-[#240028] p-3 border border-[#00ff85]/30 flex flex-col justify-between">',
          '          <div>',
          '            <span class="font-mono text-[10px] uppercase text-[#00ff85] block">TACTICAL MATRIX SUMMARY</span>',
          '            <p class="font-sans text-xs text-[#d1d1d6] mt-1.5 leading-snug">',
          '              ' + m.home_team + ' had ' + possH + '% possession. The gap between the teams was <strong class="text-[#00ff85]">' + Math.abs(m.home_xg - m.away_xg).toFixed(2) + ' xG</strong>.',
          '            </p>',
          '          </div>',
          '          <a href="/players" class="w-full mt-3 bg-[#00ff85] hover:bg-white text-[#37003c] font-display font-black text-xs uppercase py-2 tracking-wider flex items-center justify-center gap-1 transition-colors no-underline">',
          '            <span class="site-icon text-[15px]" aria-hidden="true">▥</span> FULL PLAYER SQUAD MATRIX',
          '          </a>',
          '        </div>',
          '      </div>',
          '    </div>',
          '  </td>',
          '</tr>'
        );
      }
    });

    tbody.innerHTML = rowsHtml.join('');

    // Attach drawer toggle listeners
    tbody.querySelectorAll('.btn-toggle-telemetry').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        var idx = parseInt(btn.getAttribute('data-index'), 10);
        state.expandedMatchIndex = state.expandedMatchIndex === idx ? null : idx;
        renderMatchesTable(matches);
      });
    });
  }

  function renderStitchFormSquares(formArr) {
    if (!formArr || !formArr.length) return '';
    return formArr.slice(0, 5).map(function(r) {
      var color = r === 'W' ? '#00ff85' : (r === 'L' ? '#ff2882' : '#d1d1d6');
      return '<span class="w-2.5 h-2.5 inline-block" style="background-color:' + color + ';" title="' + r + '"></span>';
    }).join('');
  }

  function renderPagination(matches) {
    var summary = document.getElementById('paginationSummary');
    var controls = document.getElementById('paginationControls');
    if (!summary || !controls) return;

    var total = matches.length;
    var totalPages = Math.ceil(total / state.matchPerPage) || 1;
    var cur = state.matchPage;

    var start = (cur - 1) * state.matchPerPage + 1;
    var end = Math.min(total, cur * state.matchPerPage);

    summary.innerText = 'SHOWING ROWS ' + (total > 0 ? start : 0) + '–' + end + ' OF ' + total.toLocaleString() + ' TOTAL ARCHIVED FIXTURES';

    var html = [];
    // Page 1
    html.push('<button class="pag-btn w-8 h-8 flex items-center justify-center font-bold ' + (cur === 1 ? 'bg-[#37003c] text-[#00ff85]' : 'bg-[#efedf5] text-[#37003c] hover:bg-[#e3e1ea]') + ' cursor-pointer" data-page="1">1</button>');

    if (cur > 3) html.push('<span class="px-1 text-[#4f434d]">...</span>');

    for (var p = Math.max(2, cur - 1); p <= Math.min(totalPages - 1, cur + 1); p++) {
      html.push('<button class="pag-btn w-8 h-8 flex items-center justify-center font-bold ' + (cur === p ? 'bg-[#37003c] text-[#00ff85]' : 'bg-[#efedf5] text-[#37003c] hover:bg-[#e3e1ea]') + ' cursor-pointer" data-page="' + p + '">' + p + '</button>');
    }

    if (cur < totalPages - 2) html.push('<span class="px-1 text-[#4f434d]">...</span>');

    if (totalPages > 1) {
      html.push('<button class="pag-btn w-8 h-8 flex items-center justify-center font-bold ' + (cur === totalPages ? 'bg-[#37003c] text-[#00ff85]' : 'bg-[#efedf5] text-[#37003c] hover:bg-[#e3e1ea]') + ' cursor-pointer" data-page="' + totalPages + '">' + totalPages + '</button>');
    }

    if (cur < totalPages) {
      html.push('<button class="pag-btn px-3 h-8 flex items-center justify-center font-bold bg-[#37003c] text-white hover:bg-[#240028] uppercase tracking-wider ml-1 cursor-pointer" data-page="' + (cur + 1) + '">NEXT </button>');
    }

    controls.innerHTML = html.join('');

    controls.querySelectorAll('.pag-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var p = parseInt(btn.getAttribute('data-page'), 10);
        state.matchPage = p;
        state.expandedMatchIndex = null;
        renderMatchesTable(matches);
        renderPagination(matches);
      });
    });
  }

  // -------------------------------------------------------------
  // 4. RIGHT COLUMN LEADERBOARD (HOME PAGE)
  // -------------------------------------------------------------
  function renderRightLeaderboard() {
    var container = document.getElementById('leaderboardList');
    if (!container || !leaders) return;

    var metric = state.leaderboardMetric;
    var sorted = leaders[state.leaderboardSeason][metric];

    var maxVal = sorted.length > 0 ? (metric === 'xg_xa' ? sorted[0].xg + sorted[0].xa : sorted[0][metric]) : 1;
    if (maxVal === 0) maxVal = 1;

    var html = sorted.map(function(p, idx) {
      var rank = idx < 9 ? '0' + (idx + 1) : String(idx + 1);
      var code = CLUB_CODES[p.club] || 'PL';
      var val = metric === 'xg_xa' ? (p.xg + p.xa).toFixed(1) : p[metric];
      var valLabel = metric === 'goals' ? 'G' : (metric === 'assists' ? 'A' : (metric === 'xg_xa' ? 'xG+xA' : 'KP'));
      var sub = metric === 'goals' ? (p.goals >= p.xg ? '+' : '') + (p.goals - p.xg).toFixed(1) + ' vs xG' : (p.key_passes + ' KP');

      var primaryPct = Math.min(90, Math.round((val / maxVal) * 85));
      var secPct = 100 - primaryPct;

      return [
        '<div>',
        '  <div class="flex items-center justify-between font-mono text-xs mb-1">',
        '    <div class="flex items-center gap-2">',
        '      <span class="w-5 h-5 ' + (idx === 0 ? 'bg-[#37003c] text-[#00ff85]' : 'bg-[#efedf5] text-[#37003c]') + ' flex items-center justify-center font-bold text-[10px]">' + rank + '</span>',
        '      <span class="font-display font-extrabold text-sm text-[#37003c]">' + p.name.toUpperCase() + '</span>',
        '      <span class="bg-[#efedf5] text-[#4f434d] px-1 text-[10px] font-bold">' + code + '</span>',
        '    </div>',
        '    <div class="flex items-center gap-2">',
        '      <span class="text-[#37003c] font-black text-sm">' + val + ' ' + valLabel + '</span>',
        '      <span class="text-[#006e36] text-[10px] font-bold">' + sub + '</span>',
        '    </div>',
        '  </div>',
        '  <div class="w-full h-2.5 bg-[#efedf5] flex">',
        '    <div class="bg-[#ff2882] h-full" style="width:' + primaryPct + '%;"></div>',
        '    <div class="bg-[#00ff85] h-full" style="width:' + Math.min(20, secPct) + '%;"></div>',
        '  </div>',
        '</div>'
      ].join('');
    }).join('');

    container.innerHTML = html;
  }

  function renderHeadToHeadDuel() {
    var container = document.getElementById('h2hMetricsContainer');
    if (!container || !duel) return;
    var pA = duel[0];
    var pB = duel[1];

    if (!pA || !pB) return;

    var nameA = document.getElementById('h2hNameA');
    var clubA = document.getElementById('h2hClubA');
    var nameB = document.getElementById('h2hNameB');
    var clubB = document.getElementById('h2hClubB');

    if (nameA) nameA.innerText = pA.name.toUpperCase();
    if (clubA) clubA.innerText = (CLUB_CODES[pA.club] || 'PL') + ' // ' + pA.position;
    if (nameB) nameB.innerText = pB.name.toUpperCase();
    if (clubB) clubB.innerText = (CLUB_CODES[pB.club] || 'PL') + ' // ' + pB.position;

    [pA, pB].forEach(function(player, index) {
      document.getElementById('h2hInitials' + (index === 0 ? 'A' : 'B')).textContent = player.name
        .split(/\s+/).map(function(name) { return name[0]; }).slice(0, 2).join('').toUpperCase();
    });

    function ratio(top, bottom, factor) {
      return bottom > 0 ? top * factor / bottom : null;
    }

    function metric(label, a, b, suffix) {
      var max = Math.max(a || 0, b || 0, 0.01);
      return {
        label: label, valA: a === null ? '—' : a.toFixed(1) + suffix,
        valB: b === null ? '—' : b.toFixed(1) + suffix,
        pctA: 100 * (a || 0) / max, pctB: 100 * (b || 0) / max
      };
    }

    var metrics = [
      metric('SHOT CONVERSION', ratio(pA.goals, pA.shots, 100), ratio(pB.goals, pB.shots, 100), '%'),
      metric('MINUTES / GOAL', ratio(pA.minutes, pA.goals, 1), ratio(pB.minutes, pB.goals, 1), ''),
      metric('CARRIES / 90', ratio(pA.progressive_carries, pA.minutes, 90), ratio(pB.progressive_carries, pB.minutes, 90), ''),
      metric('KEY PASSES / 90', ratio(pA.key_passes, pA.minutes, 90), ratio(pB.key_passes, pB.minutes, 90), '')
    ];

    var html = metrics.map(function(m) {
      return [
        '<div>',
        '  <div class="flex justify-between items-center font-mono text-[11px] mb-1">',
        '    <span class="text-[#37003c] font-black">' + m.valA + '</span>',
        '    <span class="text-[#4f434d] uppercase text-[10px]">' + m.label + '</span>',
        '    <span class="text-[#37003c] font-black">' + m.valB + '</span>',
        '  </div>',
        '  <div class="w-full h-2 bg-[#efedf5] flex">',
        '    <div class="w-1/2 flex justify-end">',
        '      <div class="bg-[#ff2882] h-full" style="width:' + m.pctA + '%;"></div>',
        '    </div>',
        '    <div class="w-0.5 h-full bg-[#37003c] z-10"></div>',
        '    <div class="w-1/2 flex justify-start">',
        '      <div class="bg-[#00ff85] h-full" style="width:' + m.pctB + '%;"></div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join('');
    }).join('');

    container.innerHTML = html;
  }

  function updatePitchSchematic() {
    var overlay = document.getElementById('pitchHeatZoneOverlay');
    var subNote = document.getElementById('pitchSubNote');
    var xgNote = document.getElementById('pitchXgNote');

    if (state.pitchMode === 'attacking') {
      if (overlay) overlay.innerHTML = '<span class="font-mono text-[9px] text-[#ff2882] font-black uppercase">ATTACK ZONE</span>';
      if (subNote) subNote.innerText = 'WIDE PLAYER MOVES INSIDE';
      if (xgNote) xgNote.innerText = 'SUPPORT RUN INTO THE BOX';
    } else if (state.pitchMode === 'pressing') {
      if (overlay) overlay.innerHTML = '<span class="font-mono text-[9px] text-[#00ff85] font-black uppercase">HIGH PRESS</span>';
      if (subNote) subNote.innerText = 'PRESS NEAR THE TOUCHLINE';
      if (xgNote) xgNote.innerText = 'CLOSE THE RETURN PASS';
    } else {
      if (overlay) overlay.innerHTML = '<span class="font-mono text-[9px] text-[#05f0ff] font-black uppercase">PASSING LANES</span>';
      if (subNote) subNote.innerText = 'LOOK FOR THE FORWARD RUN';
      if (xgNote) xgNote.innerText = 'USE THE OPEN CHANNEL';
    }
  }

  // -------------------------------------------------------------
  // 5. PLAYER HUB VIEW LOGIC (players.html)
  // -------------------------------------------------------------
  function initPlayerHubView() {
    bindPlayerHubEvents();
    loadSeason('players', state.playerSeason);
  }

  function fillPlayerClubFilter() {
    var select = document.getElementById('playerClubFilterSelect');
    if (!select || !state.players) return;

    var clubs = radash.unique(radash.select(state.players, function(p) { return p.club; }));
    clubs = radash.alphabetical(clubs, function(c) { return c; });

    select.innerHTML = '<option value="All">ALL CLUBS</option>' +
      clubs.map(function(c) {
        return '<option value="' + c + '">' + c.toUpperCase() + '</option>';
      }).join('');
    if (clubs.indexOf(state.playerClub) === -1) state.playerClub = 'All';
    select.value = state.playerClub;
  }

  function bindPlayerHubEvents() {
    // Campaign Pills (2025 vs 2026)
    var campPills = document.querySelectorAll('.season-pill-opt');
    campPills.forEach(function(pill) {
      pill.addEventListener('click', function() {
        campPills.forEach(function(p) {
          p.className = 'season-pill-opt px-3 py-1.5 font-display font-bold text-xs uppercase bg-[#efedf5] text-[#37003c] hover:bg-[#e3e1ea] transition-none cursor-pointer';
        });
        pill.className = 'season-pill-opt px-3 py-1.5 font-display font-extrabold text-xs uppercase bg-[#00ff85] text-[#37003c] border-2 border-[#00ff85] cursor-pointer';
        state.playerSeason = parseInt(pill.getAttribute('data-season'), 10);
        state.playerPage = 1;
        
        state.activePitchPlayer = null;
        loadSeason('players', state.playerSeason);
      });
    });

    // Position pills
    var posPills = document.querySelectorAll('.pos-pill');
    posPills.forEach(function(pill) {
      pill.addEventListener('click', function() {
        posPills.forEach(function(p) {
          p.className = 'pos-pill px-2.5 py-1 font-mono text-xs uppercase font-bold bg-[#efedf5] text-[#37003c] hover:bg-[#e3e1ea] cursor-pointer';
        });
        pill.className = 'pos-pill px-2.5 py-1 font-mono text-xs uppercase font-bold bg-[#37003c] text-[#00ff85] cursor-pointer';
        state.playerPosition = pill.getAttribute('data-pos');
        state.playerPage = 1;
        renderPlayerHub();
      });
    });

    // Club filter
    var clubSel = document.getElementById('playerClubFilterSelect');
    if (clubSel) {
      clubSel.addEventListener('change', function(e) {
        state.playerClub = e.target.value;
        state.playerPage = 1;
        renderPlayerHub();
      });
    }

    // Search input
    var searchInp = document.getElementById('playerSearchInput');
    if (searchInp) {
      var debouncedPlayerSearch = radash.debounce(function(val) {
        state.playerSearch = val;
        state.playerPage = 1;
        renderPlayerHub();
      }, 160);
      searchInp.addEventListener('input', function(e) {
        debouncedPlayerSearch(e.target.value.trim().toLowerCase());
      });
    }

    // Sortable Headers
    var sortHeaders = document.querySelectorAll('.th-sortable');
    sortHeaders.forEach(function(th) {
      th.addEventListener('click', function() {
        var key = th.getAttribute('data-key');
        if (state.playerSortKey === key) {
          state.playerSortDesc = !state.playerSortDesc;
        } else {
          state.playerSortKey = key;
          state.playerSortDesc = true;
        }
        renderPlayerHub();
      });
    });

    // Dual Compare Selectors
    var selA = document.getElementById('compare-select-a');
    var selB = document.getElementById('compare-select-b');
    if (selA && selB) {
      selA.addEventListener('change', function(e) {
        state.comparePlayerIdA = e.target.value;
        updatePlayerComparisonBars();
      });
      selB.addEventListener('change', function(e) {
        state.comparePlayerIdB = e.target.value;
        updatePlayerComparisonBars();
      });
    }
  }

  function getFilteredPlayers() {
    return state.players.filter(function(p) {
      if (p.season !== state.playerSeason) return false;
      if (state.playerPosition !== 'All' && p.position !== state.playerPosition) return false;
      if (state.playerClub !== 'All' && p.club !== state.playerClub) return false;
      if (state.playerSearch && p.name.toLowerCase().indexOf(state.playerSearch) === -1) return false;
      return true;
    });
  }

  function renderPlayerHub() {
    var filtered = getFilteredPlayers();

    var sorted = radash.sort(filtered, function(p) {
      return p[state.playerSortKey] || 0;
    }, state.playerSortDesc);

    if (filtered.indexOf(state.activePitchPlayer) === -1) {
      state.activePitchPlayer = sorted[0] || null;
    }
    renderPlayerKPIs(filtered);
    renderPlayerTable(sorted);
    renderPlayerPagination(sorted);
    populateCompareSelectors(filtered);
    renderActivePitch();
    updatePlayerComparisonBars();
  }

  function renderActivePitch() {
    var player = state.activePitchPlayer;
    document.getElementById('pitchPlayerBadge').textContent = player ? player.name.toUpperCase() : 'NO MATCHING PLAYER';
    if (!player) {
      document.getElementById('tactical-pitch-wrapper').textContent = 'No player matches these filters.';
    } else if (window.PLCharts) {
      window.PLCharts.renderTacticalPitch('tactical-pitch-wrapper', player.pitch_zone, player.name, player.club);
    }
  }

  function renderPlayerKPIs(players) {
    var kpiTotal = document.getElementById('kpiTotalPlayers');
    var topScorer = radash.boil(players, function(a, b) { return a.goals > b.goals; });
    var topAssister = radash.boil(players, function(a, b) { return a.assists > b.assists; });

    if (kpiTotal) kpiTotal.innerText = players.length.toLocaleString();
    var forwards = players.filter(function(player) { return player.position === 'FW' && player.minutes >= 300; });
    var shots = radash.sum(forwards, function(player) { return player.shots; });
    var goals = radash.sum(forwards, function(player) { return player.goals; });
    var minutes = radash.sum(forwards, function(player) { return player.minutes; });
    document.getElementById('forward-conversion').textContent = shots ? (100 * goals / shots).toFixed(1) + '%' : '—';
    document.getElementById('forward-shots').textContent = minutes ? 'SHOTS / 90: ' + (90 * shots / minutes).toFixed(1) : 'SHOTS / 90: —';

    if (!players.length) {
      ['ScorerName', 'ScorerClub', 'ScorerGoals', 'ScorerXg', 'AssisterName', 'AssisterClub', 'AssisterValue', 'AssisterXa'].forEach(function(key) {
        document.getElementById('playerKpi' + key).textContent = '—';
      });
    }

    if (topScorer) {
      var sName = document.getElementById('playerKpiScorerName');
      var sClub = document.getElementById('playerKpiScorerClub');
      var sGoals = document.getElementById('playerKpiScorerGoals');
      var sXg = document.getElementById('playerKpiScorerXg');
      if (sName) sName.innerText = topScorer.name.toUpperCase();
      if (sClub) sClub.innerText = CLUB_CODES[topScorer.club] || 'PL';
      if (sGoals) sGoals.innerText = topScorer.goals + ' GOALS';
      if (sXg) sXg.innerText = '(' + topScorer.xg + ' xG)';
    }

    if (topAssister) {
      var aName = document.getElementById('playerKpiAssisterName');
      var aClub = document.getElementById('playerKpiAssisterClub');
      var aVal = document.getElementById('playerKpiAssisterValue');
      if (aName) aName.innerText = topAssister.name.toUpperCase();
      if (aClub) aClub.innerText = CLUB_CODES[topAssister.club] || 'PL';
      if (aVal) aVal.innerText = topAssister.assists + ' ASSISTS';
      document.getElementById('playerKpiAssisterXa').textContent = '(' + topAssister.xa + ' xA)';
    }
  }

  function renderPlayerTable(players) {
    var tbody = document.getElementById('playersTableBody');
    var countBadge = document.getElementById('playerTotalCountBadge');
    if (!tbody) return;

    if (!players || !players.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="py-8 text-center font-mono text-xs text-[#4f434d] uppercase">NO SQUAD PLAYERS FOUND</td></tr>';
      if (countBadge) countBadge.innerText = 'DISPLAYING: 0 / 0';
      return;
    }

    var start = (state.playerPage - 1) * state.playerPerPage;
    var pageSlice = players.slice(start, start + state.playerPerPage);

    if (countBadge) {
      countBadge.innerText = 'DISPLAYING: ' + pageSlice.length + ' / ' + players.length;
    }

    var html = pageSlice.map(function(p, idx) {
      var rank = start + idx + 1;
      var isPitchActive = state.activePitchPlayer && state.activePitchPlayer.player_id === p.player_id;
      var posCls = p.position ? p.position.toLowerCase() : 'mf';

      return [
        '<tr class="' + (isPitchActive ? 'row-pitch-active' : 'hover:bg-[#efedf5]') + ' cursor-pointer transition-none" data-player-id="' + p.player_id + '">',
        '  <td class="py-2.5 px-3 font-mono font-bold text-center">' + rank + '</td>',
        '  <td class="py-2.5 px-3">',
        '    <div class="font-display font-extrabold text-sm text-[#37003c]">' + p.name + '</div>',
        '    <div class="text-[10px] text-[#4f434d] font-mono">' + p.pitch_zone + '</div>',
        '  </td>',
        '  <td class="py-2.5 px-3 font-bold text-xs">' + p.club + '</td>',
        '  <td class="py-2.5 px-3 text-center"><span class="badge-pos ' + posCls + '">' + p.position + '</span></td>',
        '  <td class="py-2.5 px-3 text-center font-black text-[#37003c]">' + p.goals + '</td>',
        '  <td class="py-2.5 px-3 text-center font-black text-[#37003c]">' + p.assists + '</td>',
        '  <td class="py-2.5 px-3 text-center">' + p.xg + '</td>',
        '  <td class="py-2.5 px-3 text-center">' + p.xa + '</td>',
        '  <td class="py-2.5 px-3 text-center font-bold">' + p.key_passes + '</td>',
        '  <td class="py-2.5 px-3 text-center font-mono">' + p.pass_accuracy + '%</td>',
        '</tr>'
      ].join('');
    }).join('');

    tbody.innerHTML = html;

    // Attach row click to select player
    tbody.querySelectorAll('tr').forEach(function(row) {
      row.addEventListener('click', function() {
        var pId = row.getAttribute('data-player-id');
        var found = state.players.find(function(p) { return p.player_id === pId; });
        if (found) {
          state.activePitchPlayer = found;
          tbody.querySelectorAll('tr').forEach(function(r) { r.classList.remove('row-pitch-active'); });
          row.classList.add('row-pitch-active');
          renderActivePitch();
        }
      });
    });
  }

  function renderPlayerPagination(players) {
    var summary = document.getElementById('playerPaginationSummary');
    var controls = document.getElementById('playerPaginationControls');
    if (!summary || !controls) return;

    var total = players.length;
    var totalPages = Math.ceil(total / state.playerPerPage) || 1;
    var cur = state.playerPage;

    var start = (cur - 1) * state.playerPerPage + 1;
    var end = Math.min(total, cur * state.playerPerPage);

    summary.innerText = 'SHOWING ROWS ' + (total > 0 ? start : 0) + '–' + end + ' OF ' + total.toLocaleString();

    var html = [];
    html.push('<button class="pag-btn w-8 h-8 flex items-center justify-center font-bold ' + (cur === 1 ? 'bg-[#37003c] text-[#00ff85]' : 'bg-[#efedf5] text-[#37003c] hover:bg-[#e3e1ea]') + ' cursor-pointer" data-page="1">1</button>');

    if (cur > 3) html.push('<span class="px-1 text-[#4f434d]">...</span>');

    for (var p = Math.max(2, cur - 1); p <= Math.min(totalPages - 1, cur + 1); p++) {
      html.push('<button class="pag-btn w-8 h-8 flex items-center justify-center font-bold ' + (cur === p ? 'bg-[#37003c] text-[#00ff85]' : 'bg-[#efedf5] text-[#37003c] hover:bg-[#e3e1ea]') + ' cursor-pointer" data-page="' + p + '">' + p + '</button>');
    }

    if (cur < totalPages - 2) html.push('<span class="px-1 text-[#4f434d]">...</span>');

    if (totalPages > 1) {
      html.push('<button class="pag-btn w-8 h-8 flex items-center justify-center font-bold ' + (cur === totalPages ? 'bg-[#37003c] text-[#00ff85]' : 'bg-[#efedf5] text-[#37003c] hover:bg-[#e3e1ea]') + ' cursor-pointer" data-page="' + totalPages + '">' + totalPages + '</button>');
    }

    if (cur < totalPages) {
      html.push('<button class="pag-btn px-3 h-8 flex items-center justify-center font-bold bg-[#37003c] text-white hover:bg-[#240028] uppercase tracking-wider ml-1 cursor-pointer" data-page="' + (cur + 1) + '">NEXT </button>');
    }

    controls.innerHTML = html.join('');

    controls.querySelectorAll('.pag-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.playerPage = parseInt(btn.getAttribute('data-page'), 10);
        renderPlayerTable(players);
        renderPlayerPagination(players);
      });
    });
  }

  function populateCompareSelectors(players) {
    var selA = document.getElementById('compare-select-a');
    var selB = document.getElementById('compare-select-b');
    if (!selA || !selB) return;

    var playerA = players.find(function(player) { return player.player_id === state.comparePlayerIdA; }) || players[0];
    var playerB = players.find(function(player) { return player.player_id === state.comparePlayerIdB; });
    if (!playerB || players.length < 2) {
      playerB = players.find(function(player) { return player !== playerA; });
    }
    state.comparePlayerIdA = playerA ? playerA.player_id : '';
    state.comparePlayerIdB = playerB ? playerB.player_id : '';

    var options = players.map(function(p) {
      return '<option value="' + p.player_id + '">' + p.name + ' (' + (CLUB_CODES[p.club] || p.club) + ' - ' + p.position + ')</option>';
    }).join('');

    selA.innerHTML = options;
    selB.innerHTML = options;

    selA.value = state.comparePlayerIdA;
    selB.value = state.comparePlayerIdB;
    selA.disabled = selB.disabled = players.length < 2;
  }

  function updatePlayerComparisonBars() {
    var selA = document.getElementById('compare-select-a');
    var selB = document.getElementById('compare-select-b');
    if (!selA || !selB) return;

    var pA = state.players.find(function(p) { return p.player_id === selA.value; });
    var pB = state.players.find(function(p) { return p.player_id === selB.value; });

    if (pA && pB && window.PLCharts) {
      window.PLCharts.renderPlayerComparison('player-comparison-target', pA, pB);
    } else {
      document.getElementById('player-comparison-target').textContent = 'Show at least two matching players to compare them.';
    }
  }

})();
