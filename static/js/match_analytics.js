(function (root) {
  'use strict';
  const radash = root.radash;
  const labels = {
    save: 'Save', pass: 'Pass', foul_candidate: 'Possible foul', tackle: 'Tackle', recovery: 'Ball recovery',
    shot: 'Shot', chance: 'Chance created', dribble: 'Successful dribble', goal_candidate: 'Possible goal',
    counter: 'Counterattack', movement: 'Tracked movement', sprint: 'Sprint'
  };
  const metrics = [
    ['saves', 'Saves', ['save']], ['passes', 'Pass attempts', ['pass']],
    ['completed', 'Successful passes', ['pass']], ['accuracy', 'Pass accuracy', ['pass']],
    ['fouls', 'Fouls to review', ['foul_candidate']], ['tackles', 'Tackles', ['tackle']],
    ['recoveries', 'Balls recovered', ['recovery']], ['shots', 'Shots taken', ['shot']],
    ['chances', 'Goal chances made', ['chance']], ['dribbles', 'Successful dribbles', ['dribble']],
    ['goals', 'Goals to review', ['goal_candidate']], ['conversion', 'Estimated conversion', ['shot', 'goal_candidate']],
    ['counter', 'Counter speed', ['counter']], ['possession', 'Possession', []],
    ['forecast', 'Next 5 min possession', []], ['xg', 'Estimated xG', ['shot']], ['ppda', 'Estimated PPDA', ['tackle', 'recovery']],
    ['distance', 'Tracked distance', ['movement']], ['sprints', 'Sprints', ['sprint']],
    ['sprintDistance', 'Sprint distance', ['sprint']], ['speed', 'Top speed', ['movement']]
  ];
  const percent = value => value == null ? '—' : value.toFixed(1) + '%';
  const speed = value => value == null ? '—' : (value * 3.6).toFixed(1) + ' km/h · ' + value.toFixed(1) + ' m/s';
  const teamName = value => value === 'home' ? 'Home' : value === 'away' ? 'Away' : 'Unassigned';

  class MatchReport {
    constructor(data, tracks) {
      this.frames = data.frames;
      this.events = data.events;
      this.meta = data.meta || {};
      this.tracks = new Map(tracks.map(p => [p.id, p]));
      this.totalTime = this.frames.at(-1)?.t || 0;
      this.grouped = radash.group(this.events, event => event.type);
      this.cache = new Map();
    }

    accepts(event, selection) {
      return selection.scope === 'player' ? event.player === selection.id : event.team === selection.team;
    }

    report(selection, time) {
      const until = this.limit(selection, time);
      const key = [selection.scope, selection.team, selection.id, until].join('/');
      if (this.cache.has(key)) return this.cache.get(key);
      const side = selection.scope === 'team';
      const subject = side ? selection.team : selection.id;
      const usable = side ? [...this.tracks.values()].some(p => p.team === subject) : this.tracks.has(subject);
      const observed = Math.max(this.totalTime, 0);
      const items = this.events.filter(e => (e.observed_at ?? e.t) <= until && this.accepts(e, selection));
      const groups = radash.group(items, e => e.type);
      const count = type => groups[type]?.length || 0;
      let allControlled = 0, controlled = 0, recent = 0, recentControlled = 0;
      let distance = 0, sprintDistance = 0, sprints = 0, maximum = 0;
      let last = null, activeSprints = new Set();
      for (const frame of this.frames) {
        if (frame.t > until) break;
        const dt = last ? frame.t - last.t : 0;
        const control = last?.control;
        if (control && !frame.cut && dt > 0 && dt <= .6) {
          allControlled += dt;
          const recentDt = Math.max(0, frame.t - Math.max(last.t, until - 300));
          recent += recentDt;
          if ((side ? control.team : control.id) === subject) {
            controlled += dt;
            recentControlled += recentDt;
          }
        }
        const nextSprints = new Set();
        for (const [id, metres, mps] of frame.motion || []) {
          if ((side ? this.tracks.get(id)?.team : id) !== subject) continue;
          distance += metres;
          maximum = Math.max(maximum, mps);
          if (mps >= 7) {
            sprintDistance += metres;
            if (!activeSprints.has(id)) sprints++;
            nextSprints.add(id);
          }
        }
        last = frame;
        activeSprints = nextSprints;
      }
      const shots = count('shot');
      const passes = count('pass');
      const completed = (groups.pass || []).filter(e => e.outcome === 'complete').length;
      const goals = count('goal_candidate');
      const pressing = countPress(groups);
      const allowed = (this.grouped.pass || []).filter(e => (e.observed_at ?? e.t) <= until && e.team !== subject && e.build_up).length;
      const counters = groups.counter || [];
      const counter = counters.length ? radash.sum(counters, e => e.value) / counters.length : null;
      const tracking = this.meta.ball_frames ?? this.frames.filter(f => f.ball).length;
      const ballAvailable = usable && tracking > 0;
      const stats = { saves: (this.meta.roles || []).includes('goalkeeper') ? count('save') : null,
        passes, completed, accuracy: passes ? completed / passes * 100 : null, fouls: count('foul_candidate'),
        tackles: count('tackle'), recoveries: count('recovery'), shots, chances: count('chance'), dribbles: count('dribble'),
        goals, conversion: shots ? goals / shots * 100 : null, counter, possession: allControlled > 0 ? controlled / allControlled * 100 : null,
        forecast: side && recent >= 15 ? (recentControlled / recent * .8 + .1) * 100 : null,
        xg: radash.sum(groups.shot || [], e => e.xg), ppda: side && pressing ? allowed / pressing : null,
        distance, sprints, sprintDistance, speed: maximum || null };
      if (!ballAvailable) for (const key of metrics.slice(0, 17).map(row => row[0])) stats[key] = null;
      if (!usable) for (const key of ['distance', 'sprints', 'sprintDistance', 'speed']) stats[key] = null;
      const rows = radash.select(metrics, ([id, label, types]) => ({
        id, label, types, number: stats[id], display: display(id, stats[id])
      }));
      const result = { rows, items, tracked: allControlled, observed, until, tracking,
        title: side ? teamName(subject) : subject == null ? 'Select a player' : 'Track ' + subject };
      this.cache.set(key, result);
      if (this.cache.size > 24) this.cache.delete(this.cache.keys().next().value);
      return result;
    }

    clips(metric, selection, time) {
      const until = this.limit(selection, time);
      const row = metrics.find(item => item[0] === metric);
      if (!row?.[2].length) return [];
      if (row[2].includes('movement') || row[2].includes('sprint')) {
        const sprint = row[2].includes('sprint');
        const best = new Map();
        for (const frame of this.frames) {
          if (frame.t > until) break;
          for (const [player, metres, speed] of frame.motion || []) {
            const team = this.tracks.get(player)?.team;
            if (!this.accepts({ team, player }, selection) || (sprint && speed < 7)) continue;
            const bin = Math.floor(frame.t / 4);
            if (speed > (best.get(bin)?.value || 0)) {
              best.set(bin, { type: sprint ? 'sprint' : 'movement', t: frame.t, player, team, value: speed });
            }
          }
        }
        return Array.from(best.values());
      }
      return row[2].flatMap(kind => this.grouped[kind] || [])
        .filter(e => (e.observed_at ?? e.t) <= until && this.accepts(e, selection) &&
          (metric !== 'completed' || e.outcome === 'complete') && (metric !== 'ppda' || e.pressing))
        .sort((a, b) => a.t - b.t);
    }

    limit(selection, time) {
      return selection.range === 'current' ? Math.min(time, this.totalTime) : this.totalTime;
    }
  }

  function countPress(groups) {
    return (groups.tackle || []).filter(e => e.pressing).length +
      (groups.recovery || []).filter(e => e.pressing && e.interception).length;
  }

  function display(id, value) {
    if (value == null) return '—';
    if (['accuracy', 'conversion', 'possession', 'forecast'].includes(id)) return percent(value);
    if (['speed', 'counter'].includes(id)) return speed(value);
    if (['xg', 'ppda'].includes(id)) return value.toFixed(2);
    if (['distance', 'sprintDistance'].includes(id)) return value.toFixed(1) + ' m';
    return String(value);
  }

  function timeLabel(t) {
    const seconds = Math.max(0, Math.floor(t || 0));
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }

  function eventLabel(e) {
    return (labels[e.type] || e.type) + (e.type === 'pass' ? (e.outcome === 'complete' ? ' completed' : ' incomplete') : '') +
      ' · ' + teamName(e.team) + ' #' + e.player + ' · ' + timeLabel(e.t);
  }

  function exportReport(kind, summary, meta, selection) {
    const csv = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
    const body = kind === 'json' ? JSON.stringify({ meta, selection, analysis_through_seconds: summary.until,
      tracked_control_seconds: summary.tracked, metrics: Object.fromEntries(summary.rows.map(row => [row.id, row.number])),
      events: summary.items }, null, 2) :
      ['Metric,Value,Display', ...summary.rows.map(row => [row.label, row.number, row.display].map(csv).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([body], { type: kind === 'json' ? 'application/json' : 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tactical-report.' + kind;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  root.PLMatchReport = { MatchReport, timeLabel, eventLabel, exportReport, teamName };
})(window);
