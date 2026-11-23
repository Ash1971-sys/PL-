/**
 * PREMIER LEAGUE TACTICAL 11 // CHECKER-PIECE SIMULATOR ENGINE
 * Two-Way Autonomous & Interactive Match Engine with Real Player Data Integration
 * Refactored with Radash micro-utilities & 100% Legacy-Compatible Vanilla JS (ES5)
 */

(function () {
  'use strict';

  // Safe reference to Radash micro-utility suite
  var _R = (typeof window !== 'undefined' && (window.radash || window._r)) || {
    group: function(arr, fn) {
      return (arr || []).reduce(function(acc, item) {
        var k = typeof fn === 'function' ? fn(item) : item[fn];
        if (!acc[k]) acc[k] = [];
        acc[k].push(item);
        return acc;
      }, {});
    },
    sort: function(arr, fn, desc) {
      var getter = typeof fn === 'function' ? fn : function(x) { return x[fn]; };
      return (arr || []).slice().sort(function(a, b) {
        var va = getter(a), vb = getter(b);
        if (va === vb) return 0;
        return desc ? (va > vb ? -1 : 1) : (va > vb ? 1 : -1);
      });
    },
    select: function(arr, mapper, cond) {
      return (arr || []).reduce(function(acc, item, idx) {
        if (!cond || cond(item, idx)) acc.push(mapper(item, idx));
        return acc;
      }, []);
    },
    unique: function(arr, fn) {
      var seen = {}, getter = typeof fn === 'function' ? fn : function(x) { return x; };
      return (arr || []).filter(function(item) {
        var k = getter(item);
        if (seen[k]) return false;
        seen[k] = true;
        return true;
      });
    },
    clone: function(obj) {
      return JSON.parse(JSON.stringify(obj));
    },
    throttle: function(fn, ms) {
      var last = 0;
      return function() {
        var now = new Date().getTime();
        if (now - last >= (ms || 100)) {
          last = now;
          fn.apply(this, arguments);
        }
      };
    },
    debounce: function(fn, ms) {
      var timer = null;
      return function() {
        var ctx = this, args = arguments;
        if (timer) clearTimeout(timer);
        timer = setTimeout(function() {
          timer = null;
          fn.apply(ctx, args);
        }, ms || 150);
      };
    }
  };

  // SOUND SYNTHESIZER (Web Audio API - Safe feature-detected synthesizer)
  var audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSound(type) {
    try {
      var ctx = getAudioContext();
      if (!ctx) return;
      var now = ctx.currentTime;

      if (type === 'kick') {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(38, now + 0.12);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'shot') {
        var oscS = ctx.createOscillator();
        var gainS = ctx.createGain();
        oscS.type = 'triangle';
        oscS.frequency.setValueAtTime(220, now);
        oscS.frequency.exponentialRampToValueAtTime(45, now + 0.22);
        gainS.gain.setValueAtTime(0.6, now);
        gainS.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        oscS.connect(gainS);
        gainS.connect(ctx.destination);
        oscS.start(now);
        oscS.stop(now + 0.22);
      } else if (type === 'goal') {
        var freqs = [523.25, 659.25, 783.99, 1046.50];
        for (var i = 0; i < freqs.length; i++) {
          (function(freq, idx) {
            var oscG = ctx.createOscillator();
            var gainG = ctx.createGain();
            oscG.type = 'triangle';
            oscG.frequency.setValueAtTime(freq, now + idx * 0.08);
            gainG.gain.setValueAtTime(0.3, now + idx * 0.08);
            gainG.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
            oscG.connect(gainG);
            gainG.connect(ctx.destination);
            oscG.start(now + idx * 0.08);
            oscG.stop(now + 0.7);
          })(freqs[i], i);
        }
      } else if (type === 'whistle') {
        var oscW = ctx.createOscillator();
        var gainW = ctx.createGain();
        oscW.type = 'square';
        oscW.frequency.setValueAtTime(2200, now);
        gainW.gain.setValueAtTime(0.15, now);
        gainW.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        oscW.connect(gainW);
        gainW.connect(ctx.destination);
        oscW.start(now);
        oscW.stop(now + 0.25);
      }
    } catch (e) {
      // Audio playback gracefully suppressed if not allowed
    }
  }

  // TACTICAL FORMATION GRID COORDINATES (Pitch: X: 0-100%, Y: 0-100%)
  var FORMATION_TEMPLATES = {
    '4-3-3': {
      user: [
        { role: 'GK', x: 6, y: 50 },
        { role: 'LB', x: 22, y: 16 },
        { role: 'CB', x: 19, y: 38 },
        { role: 'CB', x: 19, y: 62 },
        { role: 'RB', x: 22, y: 84 },
        { role: 'DM', x: 34, y: 50 },
        { role: 'CM', x: 42, y: 32 },
        { role: 'CM', x: 42, y: 68 },
        { role: 'LW', x: 66, y: 18 },
        { role: 'ST', x: 74, y: 50 },
        { role: 'RW', x: 66, y: 82 }
      ],
      ai: [
        { role: 'GK', x: 94, y: 50 },
        { role: 'RB', x: 78, y: 16 },
        { role: 'CB', x: 81, y: 38 },
        { role: 'CB', x: 81, y: 62 },
        { role: 'LB', x: 78, y: 84 },
        { role: 'DM', x: 66, y: 50 },
        { role: 'CM', x: 58, y: 32 },
        { role: 'CM', x: 58, y: 68 },
        { role: 'RW', x: 44, y: 18 },
        { role: 'ST', x: 38, y: 50 },
        { role: 'LW', x: 44, y: 82 }
      ]
    },
    '4-2-3-1': {
      user: [
        { role: 'GK', x: 6, y: 50 },
        { role: 'LB', x: 22, y: 16 },
        { role: 'CB', x: 19, y: 38 },
        { role: 'CB', x: 19, y: 62 },
        { role: 'RB', x: 22, y: 84 },
        { role: 'DM', x: 33, y: 38 },
        { role: 'DM', x: 33, y: 62 },
        { role: 'AM', x: 50, y: 50 },
        { role: 'LW', x: 62, y: 20 },
        { role: 'ST', x: 74, y: 50 },
        { role: 'RW', x: 62, y: 80 }
      ],
      ai: [
        { role: 'GK', x: 94, y: 50 },
        { role: 'RB', x: 78, y: 16 },
        { role: 'CB', x: 81, y: 38 },
        { role: 'CB', x: 81, y: 62 },
        { role: 'LB', x: 78, y: 84 },
        { role: 'DM', x: 67, y: 38 },
        { role: 'DM', x: 67, y: 62 },
        { role: 'AM', x: 50, y: 50 },
        { role: 'RW', x: 38, y: 20 },
        { role: 'ST', x: 26, y: 50 },
        { role: 'LW', x: 38, y: 80 }
      ]
    },
    '3-5-2': {
      user: [
        { role: 'GK', x: 6, y: 50 },
        { role: 'CB', x: 19, y: 28 },
        { role: 'CB', x: 18, y: 50 },
        { role: 'CB', x: 19, y: 72 },
        { role: 'LWB', x: 36, y: 14 },
        { role: 'CM', x: 38, y: 36 },
        { role: 'DM', x: 32, y: 50 },
        { role: 'CM', x: 38, y: 64 },
        { role: 'RWB', x: 36, y: 86 },
        { role: 'ST', x: 68, y: 38 },
        { role: 'ST', x: 68, y: 62 }
      ],
      ai: [
        { role: 'GK', x: 94, y: 50 },
        { role: 'CB', x: 81, y: 28 },
        { role: 'CB', x: 82, y: 50 },
        { role: 'CB', x: 81, y: 72 },
        { role: 'RWB', x: 64, y: 14 },
        { role: 'CM', x: 62, y: 36 },
        { role: 'DM', x: 68, y: 50 },
        { role: 'CM', x: 62, y: 64 },
        { role: 'LWB', x: 64, y: 86 },
        { role: 'ST', x: 32, y: 38 },
        { role: 'ST', x: 32, y: 62 }
      ]
    },
    '4-4-2': {
      user: [
        { role: 'GK', x: 6, y: 50 },
        { role: 'LB', x: 22, y: 16 },
        { role: 'CB', x: 19, y: 38 },
        { role: 'CB', x: 19, y: 62 },
        { role: 'RB', x: 22, y: 84 },
        { role: 'LM', x: 44, y: 18 },
        { role: 'CM', x: 40, y: 40 },
        { role: 'CM', x: 40, y: 60 },
        { role: 'RM', x: 44, y: 82 },
        { role: 'ST', x: 70, y: 38 },
        { role: 'ST', x: 70, y: 62 }
      ],
      ai: [
        { role: 'GK', x: 94, y: 50 },
        { role: 'RB', x: 78, y: 16 },
        { role: 'CB', x: 81, y: 38 },
        { role: 'CB', x: 81, y: 62 },
        { role: 'LB', x: 78, y: 84 },
        { role: 'RM', x: 56, y: 18 },
        { role: 'CM', x: 60, y: 40 },
        { role: 'CM', x: 60, y: 60 },
        { role: 'LM', x: 56, y: 82 },
        { role: 'ST', x: 30, y: 38 },
        { role: 'ST', x: 30, y: 62 }
      ]
    }
  };

  var DEFAULT_USER_ROSTER = [
    { num: 1, name: 'David Raya', role: 'GK', pos: 'GK', pass_acc: 84, xg: 0.0, xa: 0.01 },
    { num: 4, name: 'Ben White', role: 'RB', pos: 'DF', pass_acc: 88, xg: 0.05, xa: 0.12 },
    { num: 2, name: 'William Saliba', role: 'CB', pos: 'DF', pass_acc: 93, xg: 0.04, xa: 0.02 },
    { num: 6, name: 'Gabriel Magalhaes', role: 'CB', pos: 'DF', pass_acc: 91, xg: 0.14, xa: 0.02 },
    { num: 12, name: 'Jurrien Timber', role: 'LB', pos: 'DF', pass_acc: 89, xg: 0.06, xa: 0.09 },
    { num: 5, name: 'Thomas Partey', role: 'DM', pos: 'MF', pass_acc: 90, xg: 0.07, xa: 0.08 },
    { num: 41, name: 'Declan Rice', role: 'CM', pos: 'MF', pass_acc: 92, xg: 0.12, xa: 0.22 },
    { num: 8, name: 'Martin Odegaard', role: 'AM', pos: 'MF', pass_acc: 89, xg: 0.28, xa: 0.35 },
    { num: 7, name: 'Bukayo Saka', role: 'RW', pos: 'FW', pass_acc: 86, xg: 0.42, xa: 0.38 },
    { num: 29, name: 'Kai Havertz', role: 'ST', pos: 'FW', pass_acc: 81, xg: 0.48, xa: 0.16 },
    { num: 11, name: 'Gabriel Martinelli', role: 'LW', pos: 'FW', pass_acc: 82, xg: 0.34, xa: 0.24 }
  ];

  var DEFAULT_AI_ROSTER = [
    { num: 31, name: 'Ederson', role: 'GK', pos: 'GK', pass_acc: 86 },
    { num: 2, name: 'Kyle Walker', role: 'RB', pos: 'DF', pass_acc: 89 },
    { num: 3, name: 'Ruben Dias', role: 'CB', pos: 'DF', pass_acc: 94 },
    { num: 25, name: 'Manuel Akanji', role: 'CB', pos: 'DF', pass_acc: 93 },
    { num: 24, name: 'Josko Gvardiol', role: 'LB', pos: 'DF', pass_acc: 89 },
    { num: 16, name: 'Rodri', role: 'DM', pos: 'MF', pass_acc: 93 },
    { num: 8, name: 'Mateo Kovacic', role: 'CM', pos: 'MF', pass_acc: 91 },
    { num: 17, name: 'Kevin De Bruyne', role: 'AM', pos: 'MF', pass_acc: 87 },
    { num: 20, name: 'Bernardo Silva', role: 'RW', pos: 'FW', pass_acc: 90 },
    { num: 9, name: 'Erling Haaland', role: 'ST', pos: 'FW', pass_acc: 76 },
    { num: 47, name: 'Phil Foden', role: 'LW', pos: 'FW', pass_acc: 88 }
  ];

  // GAME ENGINE STATE
  var userSquad = [];
  var aiSquad = [];
  var currentFormation = '4-3-3';
  var selectedPlayerId = 7;
  var matchBall = { x: 50, y: 50, holderId: 7, holderTeam: 'user', inFlight: false, vx: 0, vy: 0 };
  var matchSeconds = 0;
  var userScore = 0;
  var aiScore = 0;
  var isRunning = false;
  var simSpeed = 1;
  var simInterval = null;
  var aiStyle = 'HIGH PRESS';

  var stats = {
    userPossessionTicks: 50,
    aiPossessionTicks: 50,
    userPassesCompleted: 12,
    userPassesTotal: 14,
    userShotsTotal: 0,
    userShotsOnTarget: 0,
    userXgTotal: 0.00,
    aiPassesCompleted: 10,
    aiPassesTotal: 13,
    aiShotsTotal: 0,
    aiShotsOnTarget: 0,
    aiXgTotal: 0.00
  };

  var rawPlayersData = [];

  // INITIALIZE SQUADS
  function initSquads(userRosterData, aiRosterData) {
    var formation = FORMATION_TEMPLATES[currentFormation] || FORMATION_TEMPLATES['4-3-3'];
    var uRoster = userRosterData || DEFAULT_USER_ROSTER;
    var aRoster = aiRosterData || DEFAULT_AI_ROSTER;

    userSquad = [];
    for (var i = 0; i < 11; i++) {
      var p = uRoster[i] || {};
      var coords = formation.user[i] || { x: 10 + i * 7, y: 50 };
      userSquad.push({
        id: i + 1,
        team: 'user',
        num: p.num || i + 1,
        name: p.name || ('Player ' + (i + 1)),
        role: coords.role || p.role || 'MF',
        pos: p.pos || 'MF',
        x: coords.x,
        y: coords.y,
        base_x: coords.x,
        base_y: coords.y,
        pass_acc: p.pass_accuracy || p.pass_acc || 85,
        xg: p.xg || 0.1,
        xa: p.xa || 0.1
      });
    }

    aiSquad = [];
    for (var j = 0; j < 11; j++) {
      var ap = aRoster[j] || {};
      var aCoords = formation.ai[j] || { x: 90 - j * 7, y: 50 };
      aiSquad.push({
        id: j + 101,
        team: 'ai',
        num: ap.num || j + 1,
        name: ap.name || ('Opponent ' + (j + 1)),
        role: aCoords.role || ap.role || 'MF',
        pos: ap.pos || 'MF',
        x: aCoords.x,
        y: aCoords.y,
        base_x: aCoords.x,
        base_y: aCoords.y,
        pass_acc: ap.pass_accuracy || ap.pass_acc || 85
      });
    }

    var initialHolder = null;
    for (var k = 0; k < userSquad.length; k++) {
      if (userSquad[k].num === 7) {
        initialHolder = userSquad[k];
        break;
      }
    }
    if (!initialHolder) initialHolder = userSquad[9] || userSquad[0];

    matchBall.holderId = initialHolder.id;
    matchBall.holderTeam = 'user';
    matchBall.x = initialHolder.x + 1.2;
    matchBall.y = initialHolder.y;
    selectedPlayerId = initialHolder.id;

    setupDomTokens();
    updatePitchPieces(true);
    renderTacticalVectors();
    renderRosterList();
    updateActiveTokenCard();
    updateScoreboard();
    updateTelemetryStats();
  }

  // BUILD DOM CHECKER TOKENS
  function setupDomTokens() {
    var layer = document.getElementById('pieces-layer');
    if (!layer) return;
    layer.innerHTML = '';

    for (var i = 0; i < userSquad.length; i++) {
      var p = userSquad[i];
      var el = document.createElement('div');
      el.id = 'token-u-' + p.id;
      el.className = 'checker-token checker-user';
      el.setAttribute('data-id', p.id);
      el.setAttribute('data-team', 'user');
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', p.name + ' number ' + p.num + ' ' + p.role);
      el.innerHTML = '<span class="font-mono font-black text-xs leading-none">' + p.num + '</span>' +
                     '<span class="text-[7px] font-mono leading-none tracking-tighter opacity-80 uppercase">' + p.role + '</span>';
      setupPointerDrag(el, p);
      layer.appendChild(el);
    }

    for (var j = 0; j < aiSquad.length; j++) {
      var ap = aiSquad[j];
      var ael = document.createElement('div');
      ael.id = 'token-a-' + ap.id;
      ael.className = 'checker-token checker-ai';
      ael.setAttribute('data-id', ap.id);
      ael.setAttribute('data-team', 'ai');
      ael.setAttribute('role', 'button');
      ael.setAttribute('tabindex', '0');
      ael.setAttribute('aria-label', 'AI ' + ap.name + ' number ' + ap.num + ' ' + ap.role);
      ael.innerHTML = '<span class="font-mono font-black text-xs leading-none">' + ap.num + '</span>' +
                      '<span class="text-[7px] font-mono leading-none tracking-tighter opacity-80 uppercase">' + ap.role + '</span>';
      setupPointerDrag(ael, ap);
      layer.appendChild(ael);
    }

    var ball = document.createElement('div');
    ball.id = 'match-ball';
    ball.className = 'ball-token ball-pulse';
    ball.setAttribute('aria-hidden', 'true');
    layer.appendChild(ball);
  }

  // UPDATE TOKEN POSITIONS ON PITCH
  function updatePitchPieces() {
    for (var i = 0; i < userSquad.length; i++) {
      var p = userSquad[i];
      var el = document.getElementById('token-u-' + p.id);
      if (el) {
        el.style.left = p.x + '%';
        el.style.top = p.y + '%';
        if (p.id === selectedPlayerId) {
          el.classList.add('selected-ring');
          el.style.zIndex = '50';
          el.setAttribute('aria-selected', 'true');
        } else {
          el.classList.remove('selected-ring');
          el.style.zIndex = '25';
          el.setAttribute('aria-selected', 'false');
        }
      }
    }

    for (var j = 0; j < aiSquad.length; j++) {
      var ap = aiSquad[j];
      var ael = document.getElementById('token-a-' + ap.id);
      if (ael) {
        ael.style.left = ap.x + '%';
        ael.style.top = ap.y + '%';
      }
    }

    var ball = document.getElementById('match-ball');
    if (ball) {
      ball.style.left = matchBall.x + '%';
      ball.style.top = matchBall.y + '%';
    }

    var hud = document.getElementById('possession-hud');
    if (hud) {
      if (matchBall.holderTeam === 'user') {
        var holder = null;
        for (var h = 0; h < userSquad.length; h++) {
          if (userSquad[h].id === matchBall.holderId) { holder = userSquad[h]; break; }
        }
        hud.innerHTML = 'BALL AT: <span class="text-pl-cyan font-bold">#' + (holder ? (holder.num + ' ' + holder.name) : 'YOU 11') + '</span>';
      } else {
        var aHolder = null;
        for (var ah = 0; ah < aiSquad.length; ah++) {
          if (aiSquad[ah].id === matchBall.holderId) { aHolder = aiSquad[ah]; break; }
        }
        hud.innerHTML = 'BALL AT: <span class="text-pl-magenta font-bold">#' + (aHolder ? (aHolder.num + ' ' + aHolder.name) : 'AI OPPONENT') + '</span>';
      }
    }
  }

  // POINTER DRAG & DROP FOR ANY CHECKER PIECE
  function setupPointerDrag(el, playerObj) {
    var isDragging = false;
    var pitch = document.getElementById('pitch-container');

    el.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
      isDragging = true;
      if (el.setPointerCapture) {
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
      }
      selectPlayer(playerObj.id);
      getAudioContext();
    });

    el.addEventListener('pointermove', function (e) {
      if (!isDragging || !pitch) return;
      var rect = pitch.getBoundingClientRect();
      var xPct = ((e.clientX - rect.left) / rect.width) * 100;
      var yPct = ((e.clientY - rect.top) / rect.height) * 100;

      xPct = Math.max(3, Math.min(97, xPct));
      yPct = Math.max(5, Math.min(95, yPct));

      playerObj.x = Math.round(xPct * 10) / 10;
      playerObj.y = Math.round(yPct * 10) / 10;

      if (matchBall.holderId === playerObj.id && matchBall.holderTeam === playerObj.team) {
        matchBall.x = playerObj.x + (playerObj.team === 'user' ? 1.2 : -1.2);
        matchBall.y = playerObj.y;
      }

      updatePitchPieces();
      renderTacticalVectors();
      updateActiveTokenCard();
    });

    var stopDrag = function (e) {
      if (isDragging) {
        isDragging = false;
        if (el.releasePointerCapture) {
          try { el.releasePointerCapture(e.pointerId); } catch (_) {}
        }
        logEvent('Repositioned #' + playerObj.num + ' ' + playerObj.name + ' to (' + playerObj.x + '%, ' + playerObj.y + '%).');
      }
    };

    el.addEventListener('pointerup', stopDrag);
    el.addEventListener('pointercancel', stopDrag);

    // Keyboard support: Enter / Space to select
    el.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectPlayer(playerObj.id);
      }
    });
  }

  // RENDER DYNAMIC SVG VECTORS (Passing corridor, shot corridor)
  function renderTacticalVectors() {
    var svg = document.getElementById('vector-layer');
    if (!svg) return;

    var html = '<defs>' +
      '<marker id="arrow-cyan" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#05f0ff" />' +
      '</marker>' +
      '<marker id="arrow-green" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#00ff85" />' +
      '</marker>' +
      '<marker id="arrow-pink" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ff2882" />' +
      '</marker>' +
      '</defs>';

    var active = null;
    for (var i = 0; i < userSquad.length; i++) {
      if (userSquad[i].id === selectedPlayerId) { active = userSquad[i]; break; }
    }

    if (!active) {
      svg.innerHTML = html;
      return;
    }

    // 1. Pass target vector: Find nearest forward teammate using Radash sort
    var teammates = userSquad.filter(function(p) { return p.id !== active.id; });
    var sortedOptions = _R.sort(teammates, function(p) {
      var dist = Math.hypot(p.x - active.x, p.y - active.y);
      var forwardBonus = (p.x > active.x) ? -15 : 0;
      return dist + forwardBonus;
    });

    var target = sortedOptions[0];
    if (target) {
      html += '<line x1="' + active.x + '%" y1="' + active.y + '%" x2="' + target.x + '%" y2="' + target.y + '%" ' +
              'stroke="#05f0ff" stroke-width="2.5" stroke-dasharray="6,4" class="vector-dash" ' +
              'marker-end="url(#arrow-cyan)" opacity="0.9" />' +
              '<circle cx="' + target.x + '%" cy="' + target.y + '%" r="14" fill="none" stroke="#05f0ff" stroke-width="1.5" stroke-dasharray="3,3" opacity="0.7"/>';
    }

    // 2. Shot corridor vector
    if (active.x > 55) {
      html += '<line x1="' + active.x + '%" y1="' + active.y + '%" x2="97.5%" y2="50%" ' +
              'stroke="#ff2882" stroke-width="2" stroke-dasharray="4,4" opacity="0.55" ' +
              'marker-end="url(#arrow-pink)" />';
    }

    svg.innerHTML = html;
  }

  // SELECT ACTIVE PLAYER
  window.selectPlayer = function (id) {
    selectedPlayerId = id;
    updatePitchPieces();
    renderTacticalVectors();
    renderRosterList();
    updateActiveTokenCard();
  };

  // UPDATE ACTIVE TOKEN HUD CARD IN RIGHT PANEL
  function updateActiveTokenCard() {
    var player = null;
    for (var i = 0; i < userSquad.length; i++) {
      if (userSquad[i].id === selectedPlayerId) { player = userSquad[i]; break; }
    }
    if (!player) return;

    var badge = document.getElementById('active-token-badge');
    var nameEl = document.getElementById('active-player-name');
    var roleEl = document.getElementById('active-player-role');
    var coordsEl = document.getElementById('active-token-coords');

    if (badge) badge.innerText = '#' + player.num;
    if (nameEl) nameEl.innerText = player.name.toUpperCase();
    if (roleEl) roleEl.innerText = player.role + ' (' + player.pos + ') // xG: ' + Number(player.xg).toFixed(2);
    if (coordsEl) coordsEl.innerText = 'POS: ' + player.x + '%, ' + player.y + '%';
  }

  // RENDER ROSTER LIST IN LEFT PANEL
  function renderRosterList() {
    var list = document.getElementById('roster-list');
    if (!list) return;

    var rows = [];
    for (var i = 0; i < userSquad.length; i++) {
      var p = userSquad[i];
      var isSelected = (p.id === selectedPlayerId);
      var isBallHolder = (matchBall.holderId === p.id && matchBall.holderTeam === 'user');

      rows.push(
        '<div onclick="selectPlayer(' + p.id + ')" ' +
             'role="button" tabindex="0" ' +
             'aria-selected="' + (isSelected ? 'true' : 'false') + '" ' +
             'class="p-2 flex items-center justify-between gap-2 cursor-pointer transition-colors focus-visible:ring-1 focus-visible:ring-pl-cyan ' +
             (isSelected ? 'bg-[#3b0042] border-l-4 border-pl-cyan' : 'hover:bg-[#2e0034]') + '">' +
          '<div class="flex items-center gap-2 min-w-0">' +
            '<span class="w-6 h-6 rounded-full bg-pl-purple border ' +
              (isBallHolder ? 'border-pl-cyan text-pl-cyan font-black ring-2 ring-pl-cyan/50' : 'border-pl-green text-pl-green') +
              ' font-mono text-[10px] flex items-center justify-center flex-none">' +
              p.num +
            '</span>' +
            '<div class="truncate">' +
              '<input type="text" value="' + p.name + '" ' +
                     'aria-label="Edit player ' + p.num + ' name" ' +
                     'onclick="event.stopPropagation()" ' +
                     'onchange="renamePlayer(' + p.id + ', this.value)" ' +
                     'class="bg-transparent text-white font-mono text-xs font-bold outline-none border-b border-transparent focus:border-pl-green truncate w-28">' +
            '</div>' +
          '</div>' +
          '<div class="flex items-center gap-1.5 flex-none">' +
            '<span class="text-[9px] font-mono font-bold bg-[#17001b] text-pl-cyan border border-white/10 px-1 py-0.5">' +
              p.role +
            '</span>' +
            (isBallHolder ? '<span class="text-[9px] font-mono text-pl-green font-bold bg-pl-green/10 border border-pl-green px-1">BALL</span>' : '') +
          '</div>' +
        '</div>'
      );
    }
    list.innerHTML = rows.join('');
  }

  window.renamePlayer = function (id, newName) {
    for (var i = 0; i < userSquad.length; i++) {
      if (userSquad[i].id === id && newName && newName.trim()) {
        userSquad[i].name = newName.trim();
        updateActiveTokenCard();
        logEvent('Renamed player #' + userSquad[i].num + ' to "' + userSquad[i].name + '".');
        break;
      }
    }
  };

  window.updateTeamName = function (val) {
    var name = (val && val.trim()) ? val.trim() : 'YOU 11';
    var scoreName = document.getElementById('scoreboard-user-name');
    if (scoreName) scoreName.innerText = name;
  };

  window.randomizeSquadNames = function () {
    var superstars = [
      'Erling Haaland', 'Mohamed Salah', 'Bukayo Saka', 'Cole Palmer',
      'Phil Foden', 'Declan Rice', 'Martin Odegaard', 'Virgil van Dijk',
      'William Saliba', 'Josko Gvardiol', 'Alisson Becker', 'Alexander Isak',
      'Ollie Watkins', 'Son Heung-min', 'Bruno Guimaraes', 'Moises Caicedo'
    ];
    for (var i = 0; i < userSquad.length; i++) {
      userSquad[i].name = superstars[i % superstars.length];
    }
    renderRosterList();
    updateActiveTokenCard();
    logEvent('Generated Premier League all-star lineup for YOU 11!');
  };

  // CHANGE FORMATION
  window.changeFormation = function (fmtName) {
    if (!FORMATION_TEMPLATES[fmtName]) return;
    currentFormation = fmtName;

    var select = document.getElementById('formation-select');
    if (select) select.value = fmtName;

    var template = FORMATION_TEMPLATES[fmtName];
    for (var i = 0; i < userSquad.length; i++) {
      var target = template.user[i];
      if (target) {
        userSquad[i].role = target.role;
        userSquad[i].base_x = target.x;
        userSquad[i].base_y = target.y;
        userSquad[i].x = target.x;
        userSquad[i].y = target.y;
      }
    }

    for (var j = 0; j < aiSquad.length; j++) {
      var aTarget = template.ai[j];
      if (aTarget) {
        aiSquad[j].role = aTarget.role;
        aiSquad[j].base_x = aTarget.x;
        aiSquad[j].base_y = aTarget.y;
        aiSquad[j].x = aTarget.x;
        aiSquad[j].y = aTarget.y;
      }
    }

    var holder = null;
    if (matchBall.holderTeam === 'user') {
      for (var h = 0; h < userSquad.length; h++) {
        if (userSquad[h].id === matchBall.holderId) { holder = userSquad[h]; break; }
      }
    } else {
      for (var ah = 0; ah < aiSquad.length; ah++) {
        if (aiSquad[ah].id === matchBall.holderId) { holder = aiSquad[ah]; break; }
      }
    }

    if (holder) {
      matchBall.x = holder.x + (matchBall.holderTeam === 'user' ? 1.2 : -1.2);
      matchBall.y = holder.y;
    }

    updatePitchPieces();
    renderTacticalVectors();
    renderRosterList();
    updateActiveTokenCard();
    logEvent('Shifted team tactical shape to ' + fmtName + '.');
  };

  // RECENTER FORMATION
  window.recenterFormation = function () {
    for (var i = 0; i < userSquad.length; i++) {
      userSquad[i].x = userSquad[i].base_x;
      userSquad[i].y = userSquad[i].base_y;
    }
    for (var j = 0; j < aiSquad.length; j++) {
      aiSquad[j].x = aiSquad[j].base_x;
      aiSquad[j].y = aiSquad[j].base_y;
    }

    var holder = null;
    if (matchBall.holderTeam === 'user') {
      for (var h = 0; h < userSquad.length; h++) {
        if (userSquad[h].id === matchBall.holderId) { holder = userSquad[h]; break; }
      }
    } else {
      for (var ah = 0; ah < aiSquad.length; ah++) {
        if (aiSquad[ah].id === matchBall.holderId) { holder = aiSquad[ah]; break; }
      }
    }

    if (holder) {
      matchBall.x = holder.x + (matchBall.holderTeam === 'user' ? 1.2 : -1.2);
      matchBall.y = holder.y;
    }

    updatePitchPieces();
    renderTacticalVectors();
    logEvent('Formation shapes cleanly recentered to default tactical positions.');
  };

  // PASS TO NEAREST TEAMMATE
  window.passToNearestTeammate = function () {
    var passer = null;
    for (var i = 0; i < userSquad.length; i++) {
      if (userSquad[i].id === selectedPlayerId) { passer = userSquad[i]; break; }
    }
    if (!passer) passer = userSquad[0];

    var teammates = userSquad.filter(function(p) { return p.id !== passer.id; });
    var sorted = _R.sort(teammates, function(p) {
      var dist = Math.hypot(p.x - passer.x, p.y - passer.y);
      return (p.x > passer.x) ? dist * 0.7 : dist * 1.4;
    });

    var target = sorted[0];
    if (!target) return;

    stats.userPassesTotal++;
    playSound('kick');

    // Interception calculation
    var interceptor = null;
    for (var j = 0; j < aiSquad.length; j++) {
      var ai = aiSquad[j];
      var dToPasser = Math.hypot(ai.x - passer.x, ai.y - passer.y);
      var dToTarget = Math.hypot(ai.x - target.x, ai.y - target.y);
      var passLen = Math.hypot(target.x - passer.x, target.y - passer.y);
      if ((dToPasser + dToTarget - passLen < 2.5) && (ai.x > passer.x - 2 && ai.x < target.x + 2)) {
        interceptor = ai;
        break;
      }
    }

    if (interceptor && Math.random() < 0.45) {
      matchBall.holderId = interceptor.id;
      matchBall.holderTeam = 'ai';
      matchBall.x = interceptor.x - 1.2;
      matchBall.y = interceptor.y;
      logEvent('[INTERCEPTED] #' + interceptor.num + ' ' + interceptor.name + ' intercepted the pass! AI turnover.');
    } else {
      stats.userPassesCompleted++;
      matchBall.holderId = target.id;
      matchBall.holderTeam = 'user';
      matchBall.x = target.x + 1.2;
      matchBall.y = target.y;
      selectPlayer(target.id);
      var distMeters = Math.round(Math.hypot(target.x - passer.x, target.y - passer.y) * 0.9);
      logEvent('[PASS] #' + passer.num + ' ' + passer.name + ' -> #' + target.num + ' ' + target.name + ' (' + distMeters + 'm).');
    }

    updatePitchPieces();
    renderTacticalVectors();
    updateTelemetryStats();
  };

  // TRIGGER SHOT ON GOAL
  window.triggerShot = function () {
    var shooter = null;
    for (var i = 0; i < userSquad.length; i++) {
      if (userSquad[i].id === selectedPlayerId) { shooter = userSquad[i]; break; }
    }
    if (!shooter) shooter = userSquad[9] || userSquad[0];

    stats.userShotsTotal++;
    playSound('shot');

    var dist = Math.hypot(97.5 - shooter.x, 50 - shooter.y);
    var angleDev = Math.abs(50 - shooter.y);
    var shotXg = Math.max(0.04, Math.min(0.85, (100 - dist * 1.4 - angleDev * 0.9) / 100));
    stats.userXgTotal += shotXg;

    var aiGk = null;
    for (var j = 0; j < aiSquad.length; j++) {
      if (aiSquad[j].role === 'GK') { aiGk = aiSquad[j]; break; }
    }
    if (!aiGk) aiGk = aiSquad[0];

    var isTarget = Math.random() > (0.15 + dist * 0.005);

    if (isTarget) {
      stats.userShotsOnTarget++;
      var saveChance = Math.max(0.2, 0.9 - shotXg);
      if (Math.random() > saveChance) {
        userScore++;
        playSound('goal');
        logEvent('[GOAL!] #' + shooter.num + ' ' + shooter.name + ' SCORES! xG: ' + shotXg.toFixed(2));
        updateScoreboard();
        resetBallToCenter('ai');
      } else {
        matchBall.holderId = aiGk.id;
        matchBall.holderTeam = 'ai';
        matchBall.x = aiGk.x - 1.2;
        matchBall.y = aiGk.y;
        logEvent('[SAVED] Fantastic save by AI keeper #' + aiGk.num + ' ' + aiGk.name + '!');
      }
    } else {
      matchBall.holderId = aiGk.id;
      matchBall.holderTeam = 'ai';
      matchBall.x = aiGk.x - 1.2;
      matchBall.y = aiGk.y;
      logEvent('[WIDE] Shot by #' + shooter.num + ' flies wide of the post.');
    }

    updatePitchPieces();
    renderTacticalVectors();
    updateTelemetryStats();
  };

  // EXECUTE ACTION DISPATCHER
  window.executeAction = function (type) {
    if (type === 'PASS') {
      passToNearestTeammate();
    } else if (type === 'SHOOT') {
      triggerShot();
    } else if (type === 'DRIBBLE') {
      var active = null;
      for (var i = 0; i < userSquad.length; i++) {
        if (userSquad[i].id === selectedPlayerId) { active = userSquad[i]; break; }
      }
      if (active) {
        active.x = Math.min(94, active.x + 5);
        if (matchBall.holderId === active.id && matchBall.holderTeam === 'user') {
          matchBall.x = active.x + 1.2;
        }
        updatePitchPieces();
        renderTacticalVectors();
        updateActiveTokenCard();
        logEvent('[DRIBBLE] #' + active.num + ' ' + active.name + ' drives into attacking space.');
      }
    } else if (type === 'PRESS') {
      for (var j = 0; j < userSquad.length; j++) {
        if (userSquad[j].role !== 'GK') {
          userSquad[j].x = Math.min(88, userSquad[j].x + 4);
        }
      }
      updatePitchPieces();
      renderTacticalVectors();
      logEvent('[TACTIC] Team stepping up into aggressive high press.');
    }
  };

  // NUDGE SELECTED PLAYER (Keyboard Navigation)
  function nudgeSelectedPlayer(dx, dy) {
    var active = null;
    for (var i = 0; i < userSquad.length; i++) {
      if (userSquad[i].id === selectedPlayerId) { active = userSquad[i]; break; }
    }
    if (!active) return;

    active.x = Math.max(3, Math.min(97, active.x + dx));
    active.y = Math.max(5, Math.min(95, active.y + dy));

    if (matchBall.holderId === active.id && matchBall.holderTeam === 'user') {
      matchBall.x = active.x + 1.2;
      matchBall.y = active.y;
    }

    updatePitchPieces();
    renderTacticalVectors();
    updateActiveTokenCard();
  }

  // SET AI OPPONENT TACTIC MINDSET
  window.setAIStyle = function (style) {
    aiStyle = style;
    var btnBalanced = document.getElementById('ai-style-balanced');
    var btnPress = document.getElementById('ai-style-press');
    var btnCounter = document.getElementById('ai-style-counter');
    var indicator = document.getElementById('ai-status-indicator');

    var btns = [btnBalanced, btnPress, btnCounter];
    for (var i = 0; i < btns.length; i++) {
      if (btns[i]) {
        btns[i].className = 'bg-[#1a001e] text-white/70 hover:text-white border border-white/20 text-[10px] font-mono font-bold py-1.5 uppercase transition-colors';
        btns[i].setAttribute('aria-pressed', 'false');
      }
    }

    if (style === 'BALANCED' && btnBalanced) {
      btnBalanced.className = 'bg-pl-magenta text-white border border-white text-[10px] font-mono font-bold py-1.5 uppercase transition-colors';
      btnBalanced.setAttribute('aria-pressed', 'true');
    } else if (style === 'HIGH PRESS' && btnPress) {
      btnPress.className = 'bg-pl-magenta text-white border border-white text-[10px] font-mono font-bold py-1.5 uppercase transition-colors';
      btnPress.setAttribute('aria-pressed', 'true');
    } else if (style === 'COUNTER' && btnCounter) {
      btnCounter.className = 'bg-pl-magenta text-white border border-white text-[10px] font-mono font-bold py-1.5 uppercase transition-colors';
      btnCounter.setAttribute('aria-pressed', 'true');
    }

    if (indicator) indicator.innerText = style;
    logEvent('AI tactical mindset adjusted to: ' + style + '.');
  };

  // SIMULATION TICK
  function simulationTick() {
    matchSeconds += 2;
    updateClock();

    if (matchBall.holderTeam === 'user') {
      stats.userPossessionTicks++;
    } else {
      stats.aiPossessionTicks++;
    }

    if (matchBall.holderTeam === 'user') {
      var holder = null;
      for (var i = 0; i < userSquad.length; i++) {
        if (userSquad[i].id === matchBall.holderId) { holder = userSquad[i]; break; }
      }
      if (holder) {
        var pressSpeed = (aiStyle === 'HIGH PRESS') ? 1.4 : 0.8;
        for (var j = 0; j < aiSquad.length; j++) {
          var ai = aiSquad[j];
          if (ai.role === 'GK') continue;
          var distToBall = Math.hypot(holder.x - ai.x, holder.y - ai.y);
          if (distToBall < 25) {
            ai.x += (holder.x - ai.x) * 0.06 * pressSpeed;
            ai.y += (holder.y - ai.y) * 0.06 * pressSpeed;
          }
        }

        if (Math.random() < 0.28) {
          if (holder.x > 75 && Math.random() < 0.45) {
            triggerShot();
          } else {
            passToNearestTeammate();
          }
        } else {
          holder.x = Math.min(92, holder.x + 0.6);
          matchBall.x = holder.x + 1.2;
        }
      }
    } else {
      var aiHolder = null;
      for (var k = 0; k < aiSquad.length; k++) {
        if (aiSquad[k].id === matchBall.holderId) { aiHolder = aiSquad[k]; break; }
      }
      if (!aiHolder) aiHolder = aiSquad[9];

      if (aiHolder) {
        for (var u = 0; u < userSquad.length; u++) {
          var userP = userSquad[u];
          if (userP.role === 'GK') continue;
          var uDist = Math.hypot(aiHolder.x - userP.x, aiHolder.y - userP.y);
          if (uDist < 22) {
            userP.x += (aiHolder.x - userP.x) * 0.05;
            userP.y += (aiHolder.y - userP.y) * 0.05;
          }
        }

        if (aiHolder.x < 30 && Math.random() < 0.4) {
          stats.aiShotsTotal++;
          playSound('shot');
          var distToUserGoal = Math.hypot(aiHolder.x - 2.5, aiHolder.y - 50);
          var aiXg = Math.max(0.05, Math.min(0.8, (100 - distToUserGoal * 1.5) / 100));
          stats.aiXgTotal += aiXg;

          var userGk = userSquad[0];
          if (Math.random() > 0.65) {
            aiScore++;
            playSound('whistle');
            logEvent('[GOAL CONCEDED] AI striker #' + aiHolder.num + ' ' + aiHolder.name + ' scores past our keeper!');
            updateScoreboard();
            resetBallToCenter('user');
          } else {
            matchBall.holderId = userGk.id;
            matchBall.holderTeam = 'user';
            matchBall.x = userGk.x + 1.2;
            matchBall.y = userGk.y;
            selectPlayer(userGk.id);
            logEvent('[SAVE] Superb save by #' + userGk.num + ' ' + userGk.name + ' denying AI!');
          }
        } else {
          var aiTeammates = aiSquad.filter(function(p) { return p.id !== aiHolder.id; });
          var aiTarget = _R.sort(aiTeammates, function(p) { return Math.hypot(p.x - aiHolder.x, p.y - aiHolder.y); })[0];

          if (aiTarget && Math.random() < 0.35) {
            stats.aiPassesTotal++;
            playSound('kick');

            var userInterceptor = null;
            for (var ui = 0; ui < userSquad.length; ui++) {
              if (Math.hypot(userSquad[ui].x - aiTarget.x, userSquad[ui].y - aiTarget.y) < 6) {
                userInterceptor = userSquad[ui];
                break;
              }
            }

            if (userInterceptor && Math.random() < 0.4) {
              matchBall.holderId = userInterceptor.id;
              matchBall.holderTeam = 'user';
              matchBall.x = userInterceptor.x + 1.2;
              matchBall.y = userInterceptor.y;
              selectPlayer(userInterceptor.id);
              logEvent('[TACKLE] #' + userInterceptor.num + ' ' + userInterceptor.name + ' dispossesses AI opponent!');
            } else {
              stats.aiPassesCompleted++;
              matchBall.holderId = aiTarget.id;
              matchBall.holderTeam = 'ai';
              matchBall.x = aiTarget.x - 1.2;
              matchBall.y = aiTarget.y;
            }
          } else {
            aiHolder.x = Math.max(8, aiHolder.x - 0.7);
            matchBall.x = aiHolder.x - 1.2;
          }
        }
      }
    }

    updatePitchPieces();
    renderTacticalVectors();
    updateTelemetryStats();
  }

  function resetBallToCenter(restartingTeam) {
    for (var i = 0; i < userSquad.length; i++) {
      userSquad[i].x = userSquad[i].base_x;
      userSquad[i].y = userSquad[i].base_y;
    }
    for (var j = 0; j < aiSquad.length; j++) {
      aiSquad[j].x = aiSquad[j].base_x;
      aiSquad[j].y = aiSquad[j].base_y;
    }

    matchBall.x = 50;
    matchBall.y = 50;
    matchBall.holderTeam = restartingTeam;

    if (restartingTeam === 'user') {
      var rUser = userSquad[9] || userSquad[0];
      matchBall.holderId = rUser.id;
      selectPlayer(rUser.id);
    } else {
      var rAi = aiSquad[9] || aiSquad[0];
      matchBall.holderId = rAi.id;
    }
  }

  // SIMULATION CONTROLS
  window.toggleSimulation = function () {
    isRunning = !isRunning;
    var btn = document.getElementById('sim-toggle-btn');
    var text = document.getElementById('sim-btn-text');
    var icon = document.getElementById('sim-play-icon');

    if (isRunning) {
      getAudioContext();
      clearInterval(simInterval);
      simInterval = setInterval(simulationTick, 800 / simSpeed);
      if (btn) {
        btn.className = 'bg-pl-magenta hover:bg-[#ff4293] text-white font-display font-black text-xs px-3 py-1.5 uppercase tracking-wider flex items-center gap-1.5 border border-white shadow transition-colors';
        btn.setAttribute('aria-label', 'Pause match simulation');
      }
      if (text) text.innerText = 'PAUSE';
      if (icon) icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
      logEvent('Simulation dynamic match engine resumed.');
    } else {
      clearInterval(simInterval);
      if (btn) {
        btn.className = 'bg-pl-green hover:bg-[#1cfda0] text-pl-purple font-display font-black text-xs px-3 py-1.5 uppercase tracking-wider flex items-center gap-1.5 border border-white shadow transition-colors';
        btn.setAttribute('aria-label', 'Start match simulation');
      }
      if (text) text.innerText = 'START';
      if (icon) icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
      logEvent('Simulation paused by manager.');
    }
  };

  window.stepSimulation = function () {
    simulationTick();
  };

  window.toggleSpeed = function () {
    simSpeed = (simSpeed === 1) ? 2 : (simSpeed === 2 ? 4 : 1);
    var speedBtn = document.getElementById('speed-btn');
    if (speedBtn) {
      speedBtn.innerText = simSpeed + 'X';
      speedBtn.setAttribute('aria-label', 'Simulation speed ' + simSpeed + ' times');
    }

    if (isRunning) {
      clearInterval(simInterval);
      simInterval = setInterval(simulationTick, 800 / simSpeed);
    }
    logEvent('Simulation engine speed set to ' + simSpeed + 'X.');
  };

  window.resetMatch = function () {
    clearInterval(simInterval);
    isRunning = false;
    matchSeconds = 0;
    userScore = 0;
    aiScore = 0;
    stats.userPossessionTicks = 50;
    stats.aiPossessionTicks = 50;
    stats.userPassesCompleted = 0;
    stats.userPassesTotal = 0;
    stats.userShotsTotal = 0;
    stats.userShotsOnTarget = 0;
    stats.userXgTotal = 0.00;
    stats.aiPassesCompleted = 0;
    stats.aiPassesTotal = 0;
    stats.aiShotsTotal = 0;
    stats.aiShotsOnTarget = 0;
    stats.aiXgTotal = 0.00;

    var btn = document.getElementById('sim-toggle-btn');
    var text = document.getElementById('sim-btn-text');
    var icon = document.getElementById('sim-play-icon');
    if (btn) {
      btn.className = 'bg-pl-green hover:bg-[#1cfda0] text-pl-purple font-display font-black text-xs px-3 py-1.5 uppercase tracking-wider flex items-center gap-1.5 border border-white shadow transition-colors';
      btn.setAttribute('aria-label', 'Start match simulation');
    }
    if (text) text.innerText = 'START';
    if (icon) icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';

    initSquads();
    updateClock();
    logEvent('Match reset. Ready for kickoff.');
  };

  function updateClock() {
    var mins = Math.floor(matchSeconds / 60);
    var secs = matchSeconds % 60;
    var clockEl = document.getElementById('match-clock');
    var halfBadge = document.getElementById('half-badge');

    var mStr = (mins < 10 ? '0' : '') + mins;
    var sStr = (secs < 10 ? '0' : '') + secs;

    if (clockEl) clockEl.innerText = mStr + ':' + sStr;
    if (halfBadge) halfBadge.innerText = (mins < 45) ? '1ST H' : '2ND H';

    if (mins >= 90) {
      clearInterval(simInterval);
      isRunning = false;
      playSound('whistle');
      logEvent('FULL TIME WHISTLE! Final Score: ' + userScore + ' - ' + aiScore);
    }
  }

  function updateScoreboard() {
    var u = document.getElementById('score-user');
    var a = document.getElementById('score-ai');
    if (u) u.innerText = userScore;
    if (a) a.innerText = aiScore;
  }

  function updateTelemetryStats() {
    var totalTicks = stats.userPossessionTicks + stats.aiPossessionTicks;
    var userPct = Math.round((stats.userPossessionTicks / Math.max(1, totalTicks)) * 100);
    var aiPct = 100 - userPct;

    var valU = document.getElementById('possession-val-user');
    var valA = document.getElementById('possession-val-ai');
    var barU = document.getElementById('bar-possession-user');
    var barA = document.getElementById('bar-possession-ai');

    if (valU) valU.innerText = userPct + '%';
    if (valA) valA.innerText = aiPct + '%';
    if (barU) {
      barU.style.width = userPct + '%';
      barU.setAttribute('aria-valuenow', userPct);
    }
    if (barA) {
      barA.style.width = aiPct + '%';
      barA.setAttribute('aria-valuenow', aiPct);
    }

    var passAccEl = document.getElementById('stat-pass-acc');
    if (passAccEl) {
      var acc = stats.userPassesTotal > 0
        ? Math.round((stats.userPassesCompleted / stats.userPassesTotal) * 100)
        : 90;
      passAccEl.innerText = acc + '%';
    }

    var shotsEl = document.getElementById('stat-shots');
    if (shotsEl) {
      shotsEl.innerText = stats.userShotsTotal + ' (' + stats.userShotsOnTarget + ')';
    }

    var xgEl = document.getElementById('stat-xg');
    if (xgEl) {
      xgEl.innerText = stats.userXgTotal.toFixed(2);
    }
  }

  // EVENT LOGGING
  window.logEvent = function (msg) {
    var feed = document.getElementById('event-feed-list');
    if (!feed) return;

    var mins = Math.floor(matchSeconds / 60);
    var secs = matchSeconds % 60;
    var mStr = (mins < 10 ? '0' : '') + mins;
    var sStr = (secs < 10 ? '0' : '') + secs;
    var timeStr = mStr + ':' + sStr;

    var div = document.createElement('div');
    div.className = 'flex items-start gap-1.5 text-white/90 leading-tight';

    var color = 'text-pl-cyan';
    if (msg.indexOf('GOAL') !== -1) color = 'text-pl-green font-bold';
    else if (msg.indexOf('CONCEDED') !== -1 || msg.indexOf('INTERCEPTED') !== -1) color = 'text-pl-magenta';

    div.innerHTML = '<span class="text-white/40 font-mono text-[9px] flex-none">[' + timeStr + ']</span>' +
                    '<span class="' + color + '">' + msg + '</span>';

    feed.prepend(div);
  };

  window.clearEventLog = function () {
    var feed = document.getElementById('event-feed-list');
    if (feed) feed.innerHTML = '';
  };

  // TABS SWITCHING
  window.switchLeftTab = function (tab) {
    var tabCustomBtn = document.getElementById('tab-custom-btn');
    var tabClubBtn = document.getElementById('tab-club-btn');
    var customContent = document.getElementById('tab-custom-content');
    var clubContent = document.getElementById('tab-club-content');

    if (!tabCustomBtn || !tabClubBtn) return;

    if (tab === 'custom') {
      tabCustomBtn.className = 'py-2.5 text-xs font-display font-black uppercase tracking-wider border-b-2 border-pl-green bg-[#29002e] text-pl-green flex items-center justify-center gap-1.5';
      tabCustomBtn.setAttribute('aria-selected', 'true');
      tabClubBtn.className = 'py-2.5 text-xs font-display font-black uppercase tracking-wider border-b-2 border-transparent text-white/50 hover:text-white bg-[#19001d] flex items-center justify-center gap-1.5';
      tabClubBtn.setAttribute('aria-selected', 'false');
      customContent.classList.remove('hidden');
      clubContent.classList.add('hidden');
    } else {
      tabClubBtn.className = 'py-2.5 text-xs font-display font-black uppercase tracking-wider border-b-2 border-pl-green bg-[#29002e] text-pl-green flex items-center justify-center gap-1.5';
      tabClubBtn.setAttribute('aria-selected', 'true');
      tabCustomBtn.className = 'py-2.5 text-xs font-display font-black uppercase tracking-wider border-b-2 border-transparent text-white/50 hover:text-white bg-[#19001d] flex items-center justify-center gap-1.5';
      tabCustomBtn.setAttribute('aria-selected', 'false');
      clubContent.classList.remove('hidden');
      customContent.classList.add('hidden');
    }
  };

  // LOAD PREMIER LEAGUE CLUBS DATASET
  function loadPremierLeagueClubs() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '../static/data/players_2025_2026.json', true);
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          rawPlayersData = JSON.parse(xhr.responseText);
          buildOfficialClubsList(rawPlayersData);
        } catch (e) {
          buildOfficialClubsList([]);
        }
      } else {
        buildOfficialClubsList([]);
      }
    };
    xhr.onerror = function() {
      buildOfficialClubsList([]);
    };
    xhr.send();
  }

  function buildOfficialClubsList(players) {
    var container = document.getElementById('club-presets-container');
    if (!container) return;

    if (!players || players.length === 0) {
      container.innerHTML = '<div class="p-2.5 bg-[#2b0031] border border-pl-border flex items-center justify-between">' +
        '<div>' +
          '<div class="font-display font-black text-xs text-white">MANCHESTER CITY</div>' +
          '<div class="text-[9px] font-mono text-white/50">STAR: ERLING HAALAND</div>' +
        '</div>' +
        '<button onclick="applyOfficialClub(\'Manchester City\', \'user\')" class="bg-[#1b001f] text-pl-green border border-pl-green text-[10px] font-mono px-2 py-1 font-bold">LOAD</button>' +
      '</div>';
      return;
    }

    var clubGroups = _R.group(players, function(p) { return p.club; });
    var topClubs = [
      'Arsenal', 'Manchester City', 'Liverpool', 'Chelsea',
      'Aston Villa', 'Tottenham', 'Newcastle', 'Manchester United'
    ];

    var cards = [];
    for (var i = 0; i < topClubs.length; i++) {
      var clubName = topClubs[i];
      var roster = clubGroups[clubName] || [];
      var topStar = _R.sort(roster, function(p) { return (p.goals || 0) + (p.assists || 0); }, true)[0] || { name: 'Squad Star', position: 'FW' };
      var accSum = 0;
      for (var a = 0; a < roster.length; a++) accSum += (roster[a].pass_accuracy || 85);
      var avgAcc = roster.length > 0 ? Math.round(accSum / roster.length) : 86;

      cards.push(
        '<div class="p-2.5 bg-[#2b0031] border border-pl-border hover:border-pl-green/60 transition-colors flex flex-col gap-1.5">' +
          '<div class="flex items-center justify-between">' +
            '<span class="font-display font-black text-xs text-white uppercase tracking-wider">' + clubName + '</span>' +
            '<span class="text-[9px] font-mono text-pl-cyan font-bold">' + avgAcc + '% PASS</span>' +
          '</div>' +
          '<div class="text-[10px] font-mono text-white/60">' +
            'KEY PLAYER: <span class="text-white font-bold">' + topStar.name + '</span> (' + topStar.position + ')' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-1.5 mt-1">' +
            '<button onclick="applyOfficialClub(\'' + clubName + '\', \'user\')" ' +
                    'aria-label="Load ' + clubName + ' into YOU 11 squad" ' +
                    'class="bg-[#17001b] hover:bg-pl-green hover:text-pl-purple text-pl-green border border-pl-green/50 text-[10px] font-mono font-bold py-1 transition-colors uppercase">' +
              'LOAD YOU 11' +
            '</button>' +
            '<button onclick="applyOfficialClub(\'' + clubName + '\', \'ai\')" ' +
                    'aria-label="Set ' + clubName + ' as AI opponent squad" ' +
                    'class="bg-[#17001b] hover:bg-pl-magenta hover:text-white text-pl-magenta border border-pl-magenta/50 text-[10px] font-mono font-bold py-1 transition-colors uppercase">' +
              'SET AS AI' +
            '</button>' +
          '</div>' +
        '</div>'
      );
    }
    container.innerHTML = cards.join('');
  }

  window.applyOfficialClub = function (clubName, targetTeam) {
    var clubGroups = _R.group(rawPlayersData, function(p) { return p.club; });
    var roster = clubGroups[clubName] || [];

    if (roster.length === 0) return;

    var sortedSquad = _R.sort(roster, function(p) {
      if (p.position === 'GK') return 0;
      if (p.position === 'DF') return 1;
      if (p.position === 'MF') return 2;
      return 3;
    });

    if (targetTeam === 'user') {
      var customInput = document.getElementById('custom-team-input');
      var scoreName = document.getElementById('scoreboard-user-name');
      if (customInput) customInput.value = clubName.toUpperCase();
      if (scoreName) scoreName.innerText = clubName.toUpperCase();

      initSquads(sortedSquad, null);
      switchLeftTab('custom');
      logEvent('Loaded official squad ' + clubName + ' into YOU 11.');
    } else {
      var scoreAiName = document.getElementById('scoreboard-ai-name');
      if (scoreAiName) scoreAiName.innerText = clubName.toUpperCase() + ' (AI)';

      initSquads(null, sortedSquad);
      logEvent('Set AI opponent to official squad ' + clubName + '.');
    }
  };

  // MOUSE COORDINATES TRACKER & CLICK TO MOVE
  function setupPitchCoords() {
    var pitch = document.getElementById('pitch-container');
    var coordsBadge = document.getElementById('mouse-coords');
    if (!pitch || !coordsBadge) return;

    // Use throttled mousemove from Radash
    pitch.addEventListener('mousemove', _R.throttle(function (e) {
      var rect = pitch.getBoundingClientRect();
      var xPct = Math.round(((e.clientX - rect.left) / rect.width) * 100);
      var yPct = Math.round(((e.clientY - rect.top) / rect.height) * 100);
      coordsBadge.innerText = 'X: ' + xPct + '% | Y: ' + yPct + '%';
    }, 50));

    pitch.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('.checker-token')) return;
      var rect = pitch.getBoundingClientRect();
      var xPct = Math.round(((e.clientX - rect.left) / rect.width) * 100);
      var yPct = Math.round(((e.clientY - rect.top) / rect.height) * 100);

      var active = null;
      for (var i = 0; i < userSquad.length; i++) {
        if (userSquad[i].id === selectedPlayerId) { active = userSquad[i]; break; }
      }

      if (active) {
        active.x = Math.max(3, Math.min(97, xPct));
        active.y = Math.max(5, Math.min(95, yPct));
        if (matchBall.holderId === active.id && matchBall.holderTeam === 'user') {
          matchBall.x = active.x + 1.2;
          matchBall.y = active.y;
        }
        updatePitchPieces();
        renderTacticalVectors();
        updateActiveTokenCard();
        logEvent('Relocated #' + active.num + ' ' + active.name + ' to (' + active.x + '%, ' + active.y + '%).');
      }
    });
  }

  // DESKTOP KEYBOARD CONTROLS
  function setupKeyboardControls() {
    window.addEventListener('keydown', function(e) {
      // Ignore if user is typing in an input
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) {
        return;
      }

      var key = e.key;
      if (key === ' ' || key === 'Spacebar') {
        e.preventDefault();
        window.toggleSimulation();
      } else if (key === 'ArrowUp') {
        e.preventDefault();
        nudgeSelectedPlayer(0, -2);
      } else if (key === 'ArrowDown') {
        e.preventDefault();
        nudgeSelectedPlayer(0, 2);
      } else if (key === 'ArrowLeft') {
        e.preventDefault();
        nudgeSelectedPlayer(-2, 0);
      } else if (key === 'ArrowRight') {
        e.preventDefault();
        nudgeSelectedPlayer(2, 0);
      } else if (key === 'p' || key === 'P') {
        window.passToNearestTeammate();
      } else if (key === 's' || key === 'S') {
        window.triggerShot();
      } else if (key === 'd' || key === 'D') {
        window.executeAction('DRIBBLE');
      } else if (key === 'r' || key === 'R') {
        window.recenterFormation();
      } else if (key === '1') {
        window.changeFormation('4-3-3');
      } else if (key === '2') {
        window.changeFormation('4-2-3-1');
      } else if (key === '3') {
        window.changeFormation('3-5-2');
      } else if (key === '4') {
        window.changeFormation('4-4-2');
      }
    });
  }

  // BOOTSTRAP APPLICATION
  window.addEventListener('DOMContentLoaded', function () {
    initSquads();
    setupPitchCoords();
    setupKeyboardControls();
    loadPremierLeagueClubs();
    logEvent('Premier League Tactical 11 Engine online.');
    logEvent('4-3-3 Attack formation deployed. Interactive checker board ready.');
  });

})();
