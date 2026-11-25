(function () {
  'use strict';

  const get = id => document.getElementById('coach-' + id);
  const pitch = get('pitch');
  const playerLayer = get('players');
  const storageKey = 'pl-coach-board-v1';
  const history = [];
  const formations = {
    433: [4, 3, 3], 442: [4, 4, 2], 4231: [4, 2, 3, 1], 352: [3, 5, 2]
  };
  const teamName = { home: 'Your team', away: 'Opposition' };
  const hints = {
    move: 'Drag players to position them. Select a player to edit, or use the arrow keys to move them.',
    ball: 'Tap the pitch to place the ball.',
    run: 'Drag a solid run arrow, or tap its start and end.',
    pass: 'Drag a dashed pass arrow, or tap its start and end.'
  };
  let state = restore();
  let selected = null;
  let tool = 'move';
  let arrowStart = null;
  let arrowDrag = null;
  let drag = null;

  function formation(side, shape) {
    const rows = formations[shape];
    const mirror = x => side === 'away' ? 1000 - x : x;
    const players = [{ side, number: 1, keeper: true, x: mirror(48), y: 320 }];
    rows.forEach((count, row) => {
      const x = 180 + row * (253 / (rows.length - 1));
      for (let i = 0; i < count; i++) {
        players.push({ side, number: players.length + 1, keeper: false, x: mirror(x), y: 100 + (i + 1) * 440 / (count + 1) });
      }
    });
    return players;
  }

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && Array.isArray(saved.players) && Array.isArray(saved.arrows) && saved.ball) return saved;
    } catch (_) {}
    return { players: [...formation('home', '433'), formation('away', '442')[0]], arrows: [], ball: { x: 500, y: 320 } };
  }

  function token(player, index) {
    const reserve = index === undefined;
    const node = svg('g', {
      tabindex: 0, role: 'button', 'aria-pressed': player === selected,
      'aria-label': (reserve ? 'Bench · ' : '') + teamName[player.side] + ' number ' +
        player.number + (player.keeper ? ', goalkeeper' : ''),
      'data-team': player.side
    });
    node.classList.add('coach-token');
    if (reserve) {
      node.dataset.reserve = player.number;
      node.classList.add('coach-bench-piece');
    } else node.dataset.index = index;
    node.classList.toggle('keeper', Boolean(player.keeper));
    position(node, player);
    node.append(svg('circle', { r: 25 }));
    const label = svg('text');
    label.textContent = player.number;
    node.append(label);
    return node;
  }

  function drawArrow({ from, to, kind }) {
    return svg('line', {
      x1: from.x, y1: from.y, x2: to.x, y2: to.y,
      stroke: kind === 'run' ? '#b5ffee' : '#fff', 'stroke-width': 6, 'stroke-linecap': 'round',
      'stroke-dasharray': kind === 'pass' ? '16 12' : 'none', 'marker-end': 'url(#coach-arrow)'
    });
  }

  function drawArrows() {
    const arrows = state.arrows.map(drawArrow);
    if (arrowStart) arrows.push(svg('circle', { cx: arrowStart.x, cy: arrowStart.y, r: 9, fill: 'white' }));
    get('arrows').replaceChildren(...arrows);
  }

  function drawBench() {
    const side = get('side').value;
    const occupied = new Set(state.players.filter(p => p.side === side).map(p => p.number));
    const reserves = [];
    for (let number = 1; reserves.length < 11 - occupied.size; number++) {
      if (!occupied.has(number)) reserves.push(token({ side, number, x: 50 + 84 * reserves.length, y: -30 }));
    }
    get('bench-label').textContent = teamName[side] + ' bench · ' +
      (reserves.length ? 'Drag a piece onto the pitch' : 'All 11 on the pitch');
    get('reserves').replaceChildren(...reserves);
  }

  function repaint() {
    const refocus = document.activeElement?.classList.contains('coach-token');
    const nodes = state.players.map(token);
    playerLayer.replaceChildren(...nodes);
    drawBench();
    if (refocus) (nodes[state.players.indexOf(selected)] || pitch).focus();
    drawArrows();
    get('ball').setAttribute('cx', state.ball.x);
    get('ball').setAttribute('cy', state.ball.y);
    renderControls();
  }

  function svg(tag, attributes = {}) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }

  function position(node, point) {
    node.setAttribute('transform', 'translate(' + point.x + ' ' + point.y + ')');
  }

  function renderControls(message) {
    get('hint').textContent = message || (arrowStart ? 'Tap where the arrow should end.' : hints[tool]);
    get('player').hidden = !selected;
    if (selected) {
      get('selected').textContent = teamName[selected.side] + ' · #' + selected.number;
      get('number').value = selected.number;
      get('keeper').checked = selected.keeper;
    }
    get('undo').disabled = history.length === 0;
    get('clear-arrows').disabled = state.arrows.length === 0;
    const home = state.players.filter(player => player.side === 'home');
    const away = state.players.filter(player => player.side === 'away');
    const layout = away.length === 0 ? 'one' : away.length === 1 && away[0].keeper ? 'keeper' : away.length === 11 ? 'two' : '';
    get('lineups').querySelectorAll('[data-lineup]').forEach(button => button.setAttribute('aria-pressed', button.dataset.lineup === layout));
    get('count').textContent = 'Your team ' + home.length + ' / 11 · Opposition ' + away.length + ' / 11';
    const ready = [home, away].every(team => team.length >= 7 && team.some(player => player.keeper));
    get('rules').textContent = ready ? 'Both sides meet the player-count and goalkeeper rules.' :
      'Drill setup. A match needs at least seven players and a goalkeeper on each side.';
  }

  function save(previous) {
    if (previous !== undefined) {
      history.push(previous);
      if (history.length > 40) history.shift();
    }
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (_) {}
    repaint();
  }

  function change(update) {
    const previous = JSON.stringify(state);
    update();
    save(previous);
  }

  function setTool(next) {
    tool = next;
    arrowStart = null;
    arrowDrag = null;
    get('tools').querySelectorAll('[data-tool]').forEach(button => button.setAttribute('aria-pressed', button.dataset.tool === tool));
    drawArrows();
    renderControls();
  }

  function pointAt(event, transform) {
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(transform);
  }
  const onField = point => point.x >= 0 && point.x <= 1000 && point.y >= 0 && point.y <= 640;

  function bounded(x, y) {
    return { x: Math.round(Math.max(24, Math.min(976, x))), y: Math.round(Math.max(24, Math.min(616, y))) };
  }

  function addPlayer(point, number, side) {
    const teammates = state.players.filter(player => player.side === side);
    if (teammates.length >= 11) {
      renderControls(teamName[side] + ' already has 11 players.');
      return;
    }
    change(() => {
      selected = { ...point, side, number, keeper: teammates.length === 0 };
      state.players.push(selected);
    });
  }

  function markArrow(point, tokenNode) {
    const target = state.players[Number(tokenNode?.dataset.index)];
    const end = target ? { x: target.x, y: target.y } : bounded(point.x, point.y);
    if (!arrowStart) {
      arrowStart = end;
      drawArrows();
      renderControls();
      return;
    }
    const dx = end.x - arrowStart.x;
    const dy = end.y - arrowStart.y;
    const length = Math.hypot(dx, dy);
    const space = target ? 30 : 0;
    if (length <= space + 10) return;
    change(() => {
      state.arrows.push({ from: arrowStart,
        to: { x: end.x - space * dx / length, y: end.y - space * dy / length }, kind: tool });
      arrowStart = null;
    });
  }

  pitch.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag || arrowDrag) return;
    const node = event.target.closest('.coach-token');
    const transform = pitch.getScreenCTM().inverse();
    const point = pointAt(event, transform);
    if (node?.dataset.reserve) {
      if (tool !== 'move') setTool('move');
      drag = { id: event.pointerId, node, number: Number(node.dataset.reserve), side: node.dataset.team, transform };
      get('reserves').append(node);
      pitch.setPointerCapture(event.pointerId);
      return;
    }
    if (!onField(point)) return;
    if (tool === 'ball') {
      change(() => { state.ball = bounded(point.x, point.y); });
      return;
    }
    if (tool === 'run' || tool === 'pass') {
      if (arrowStart) markArrow(point, node);
      else {
        markArrow(point, node);
        arrowDrag = { id: event.pointerId, line: drawArrow({ from: arrowStart, to: arrowStart, kind: tool }), moved: false, transform };
        get('arrows').append(arrowDrag.line);
        pitch.setPointerCapture(event.pointerId);
      }
      return;
    }
    if (!node) return;
    selected = state.players[Number(node.dataset.index)];
    playerLayer.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
    node.setAttribute('aria-pressed', 'true');
    node.focus();
    drag = { id: event.pointerId, node, point, start: { x: selected.x, y: selected.y },
      before: JSON.stringify(state), moved: false, transform };
    pitch.setPointerCapture(event.pointerId);
    renderControls();
  });

  pitch.addEventListener('pointermove', event => {
    if (arrowDrag?.id === event.pointerId) {
      const p = pointAt(event, arrowDrag.transform);
      const point = bounded(p.x, p.y);
      arrowDrag.moved ||= Math.hypot(point.x - arrowStart.x, point.y - arrowStart.y) > 12;
      arrowDrag.line.setAttribute('x2', point.x);
      arrowDrag.line.setAttribute('y2', point.y);
      return;
    }
    if (!drag || event.pointerId !== drag.id) return;
    const point = pointAt(event, drag.transform);
    if (drag.number) {
      position(drag.node, point);
      return;
    }
    if (!drag.moved && Math.hypot(point.x - drag.point.x, point.y - drag.point.y) < 5) return;
    drag.moved = true;
    Object.assign(selected, bounded(drag.start.x + point.x - drag.point.x, drag.start.y + point.y - drag.point.y));
    position(drag.node, selected);
  });

  function finishDrag(event) {
    if (arrowDrag?.id === event.pointerId) {
      const { moved, line, transform } = arrowDrag;
      arrowDrag = null;
      line.remove();
      if (moved && event.type === 'pointerup') {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.coach-token');
        markArrow(pointAt(event, transform), target);
      }
      return;
    }
    if (!drag || event.pointerId !== drag.id) return;
    const { moved, before, number, side, transform } = drag;
    drag = null;
    if (number) {
      const point = pointAt(event, transform);
      if (event.type === 'pointerup' && onField(point)) addPlayer(bounded(point.x, point.y), number, side);
      else drawBench();
    } else if (moved) save(before);
  }
  pitch.addEventListener('pointerup', finishDrag);
  pitch.addEventListener('pointercancel', finishDrag);
  pitch.addEventListener('lostpointercapture', finishDrag);

  pitch.addEventListener('keydown', event => {
    if (event.key === 'Escape' && arrowStart) {
      setTool(tool);
      return;
    }
    const node = event.target.closest('.coach-token');
    if (!node) return;
    const delta = { ArrowUp: [0, -12], ArrowDown: [0, 12], ArrowLeft: [-12, 0], ArrowRight: [12, 0] }[event.key];
    if (!delta && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (node.dataset.reserve) {
      if (!delta) {
        const side = node.dataset.team;
        const number = Number(node.dataset.reserve);
        addPlayer({ x: side === 'home' ? 390 : 610, y: 84 + (number % 11) * 42 }, number, side);
      }
      return;
    }
    const player = state.players[Number(node.dataset.index)];
    if (!delta && (tool === 'run' || tool === 'pass')) {
      markArrow(player, node);
      return;
    }
    selected = player;
    if (delta) change(() => Object.assign(player, bounded(player.x + delta[0], player.y + delta[1])));
    else repaint();
  });

  get('tools').addEventListener('click', event => {
    if (event.target.dataset.tool) setTool(event.target.dataset.tool);
  });
  get('lineups').addEventListener('click', event => {
    const layout = event.target.dataset.lineup;
    if (!layout) return;
    change(() => {
      const away = formation('away', '442');
      state.players = state.players.filter(p => p.side === 'home').concat(away.slice(0, layout === 'one' ? 0 : layout === 'keeper' ? 1 : 11));
      if (selected?.side === 'away') selected = null;
      get('side').value = 'away';
    });
  });
  get('side').addEventListener('change', () => {
    if (selected?.side !== get('side').value) selected = null;
    repaint();
  });
  get('apply').onclick = () => change(() => {
    const side = get('side').value;
    state.players = state.players.filter(player => player.side !== side).concat(formation(side, get('shape').value));
    selected = null;
  });
  get('clear-team').onclick = () => change(() => {
    state.players = state.players.filter(player => player.side !== get('side').value);
    selected = null;
  });
  get('remove').onclick = () => {
    if (!selected) return;
    change(() => {
      state.players = state.players.filter(player => player !== selected);
      selected = null;
    });
    get('side').focus();
  };
  get('number').onchange = event => {
    if (!selected) return;
    const number = event.target.valueAsNumber;
    if (!Number.isInteger(number) || number < 1 || number > 99 ||
        state.players.some(player => player !== selected && player.side === selected.side && player.number === number)) {
      renderControls('Enter an unused shirt number from 1 to 99 for this team.');
      return;
    }
    if (number !== selected.number) change(() => { selected.number = number; });
  };
  get('keeper').onchange = event => {
    if (!selected) return;
    change(() => {
      if (event.target.checked) state.players.forEach(player => { if (player.side === selected.side) player.keeper = player === selected; });
      else selected.keeper = false;
    });
  };
  get('clear-arrows').onclick = () => change(() => {
    state.arrows = [];
    arrowStart = null;
  });
  get('undo').onclick = () => {
    if (!history.length) return;
    state = JSON.parse(history.pop());
    selected = null;
    arrowStart = null;
    save();
  };
  get('present').onclick = event => {
    const present = document.querySelector('.coach').classList.toggle('presenting');
    event.target.textContent = present ? 'Edit board' : 'Present board';
    event.target.setAttribute('aria-pressed', present);
    pitch.inert = present;
    pitch.setAttribute('viewBox', present ? '0 0 1000 640' : '0 -82 1000 722');
  };
  repaint();
})();
