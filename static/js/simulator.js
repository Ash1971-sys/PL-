/**
 * PREMIER LEAGUE TACTICAL 11 // CHECKER-PIECE SIMULATOR ENGINE
 * Two-Way Autonomous & Interactive Match Engine with Real Player Data Integration
 */

(function () {
  'use strict';

  var decisionModel = window.PLTacticalAI;

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
    if (!soundEnabled) return;
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
  var matchBall = { x: 50, y: 50, holderId: 7, holderTeam: 'user' };
  var matchSeconds = 0;
  var userScore = 0;
  var aiScore = 0;
  var isRunning = false;
  var simSpeed = 1;
  var simInterval = null;
  var aiStyle = 'HIGH PRESS';
  var aiDifficulty = 'pro';

  var tactics = {
    'BALANCED': { range: 25, chase: 0.24, tackle: 0.30, line: 0, pace: 4.8, directness: 0.85 },
    'HIGH PRESS': { range: 36, chase: 0.32, tackle: 0.36, line: 6, pace: 4.6, directness: 0.95 },
    'COUNTER': { range: 21, chase: 0.24, tackle: 0.29, line: -7, pace: 6.5, directness: 1.22 }
  };
  var difficulty = {
    rookie: { press: 0.72, pace: 0.9, variance: 0.15 },
    pro: { press: 1, pace: 1, variance: 0.055 },
    elite: { press: 1.19, pace: 1.1, variance: 0.016 }
  };

  var MATCH_LENGTH = 90 * 60;
  var modes = {
    quick: { minute: 0, score: [0, 0], team: 'user', seconds: 180, afterMove: true, tempo: 1.28,
      objective: 'Play 90 match minutes in 30 turns. Each move advances the clock by three minutes.' },
    match: { minute: 0, score: [0, 0], team: 'user', seconds: 30,
      objective: 'Play a full match in 30-second turns. Use Start to run the clock continuously.' },
    comeback: { minute: 80, score: [1, 2], team: 'user', seconds: 30, challenge: true,
      objective: 'You trail 1–2 with ten minutes left. Score twice and finish ahead.' },
    hold: { minute: 80, score: [1, 0], team: 'ai', seconds: 30, challenge: true,
      objective: 'You lead 1–0 at 80 minutes. Protect the lead until full time.' },
    breakthrough: { minute: 75, score: [0, 0], team: 'user', seconds: 60, challenge: true, afterMove: true,
      startAt: { x: 76, y: 53 }, objective: 'Start with the ball near the box at 75 minutes. Create a goal and win the match.' },
    corner: { minute: 85, score: [1, 1], team: 'user', seconds: 30, challenge: true, afterMove: true,
      objective: 'It’s 1–1 at 85 minutes. Take the corner and find a winner.' }
  };
  var matchMode = 'quick';
  var stats = emptyMatchStats();
  var clubRosters = new Map();
  var clubRequest;
  var soundEnabled = false;
  var ballToken;
  var hudLabel;
  var vectorMarkup = '';
  var lastManualAction = -1;
  var opponentReadout = 'Ready for kickoff.';
  var previousPasser = null;
  var passPreview = null;
  var pitchWidth = 0;
  var pitchHeight = 0;
  var attackButtons = [];
  var defendButtons = [];
  var rosterSelection = null;
  var rosterPossessor = null;
  var corner = null;

  function emptyMatchStats() {
    return {
      userPossessionTicks: 0, aiPossessionTicks: 0,
      userPassesCompleted: 0, userPassesTotal: 0, userShotsTotal: 0, userShotsOnTarget: 0, userXgTotal: 0,
      aiPassesCompleted: 0, aiPassesTotal: 0, aiShotsTotal: 0, aiShotsOnTarget: 0, aiXgTotal: 0,
      userRecoveries: 0, aiRecoveries: 0
    };
  }

  function ballHolder() {
    var isUser = matchBall.holderTeam === 'user';
    return (isUser ? userSquad : aiSquad)[matchBall.holderId - (isUser ? 1 : 101)];
  }

  function makePossessor(player) {
    if (matchBall.holderTeam !== player.team) previousPasser = null;
    matchBall.holderId = player.id;
    matchBall.holderTeam = player.team;
    matchBall.x = player.x + (player.team === 'user' ? 1.2 : -1.2);
    matchBall.y = player.y;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function opposingSquad(player) {
    return player.team === 'user' ? aiSquad : userSquad;
  }

  function passOption(passer) {
    var isUser = passer.team === 'user';
    return decisionModel.bestPass(passer, isUser ? userSquad : aiSquad, opposingSquad(passer),
      { direction: isUser ? 1 : -1, directness: 0.8, protect: 0 }, previousPasser);
  }

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
        pos: p.position || p.pos || 'MF',
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
        pos: ap.position || ap.pos || 'MF',
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
    updatePitchPieces();
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
      p.token = el;
      layer.appendChild(el);
    }

    for (var j = 0; j < aiSquad.length; j++) {
      var ap = aiSquad[j];
      var ael = document.createElement('div');
      ael.id = 'token-a-' + ap.id;
      ael.className = 'checker-token checker-ai';
      ael.setAttribute('data-id', ap.id);
      ael.setAttribute('data-team', 'ai');
      ael.setAttribute('aria-hidden', 'true');
      ael.setAttribute('aria-label', 'AI ' + ap.name + ' number ' + ap.num + ' ' + ap.role);
      ael.innerHTML = '<span class="font-mono font-black text-xs leading-none">' + ap.num + '</span>' +
                      '<span class="text-[7px] font-mono leading-none tracking-tighter opacity-80 uppercase">' + ap.role + '</span>';
      ap.token = ael;
      layer.appendChild(ael);
    }

    var ball = ballToken = document.createElement('div');
    ball.id = 'match-ball';
    ball.className = 'ball-token';
    ball.setAttribute('aria-hidden', 'true');
    layer.appendChild(ball);
  }

  // UPDATE TOKEN POSITIONS ON PITCH
  function moveToken(token, x, y) {
    var left = Math.round(x * pitchWidth) / 100;
    var top = Math.round(y * pitchHeight) / 100;
    if (token.pitchLeft === left && token.pitchTop === top) return;
    token.pitchLeft = left;
    token.pitchTop = top;
    token.style.translate = left + 'px ' + top + 'px';
  }

  function watchPitchSize() {
    var layer = document.getElementById('pieces-layer');
    function measure() {
      var width = layer.clientWidth;
      var height = layer.clientHeight;
      if (width === pitchWidth && height === pitchHeight) return;
      pitchWidth = width;
      pitchHeight = height;
      if (ballToken) updatePitchPieces();
    }
    measure();
    if (window.ResizeObserver) new ResizeObserver(measure).observe(layer);
    else window.addEventListener('resize', measure);
  }

  function writeText(id, value) {
    var element = document.getElementById(id);
    if (element && element.textContent !== value) element.textContent = value;
  }

  function updatePitchPieces() {
    userSquad.forEach(function(player) {
      var token = player.token;
      var selected = player.id === selectedPlayerId;
      moveToken(token, player.x, player.y);
      if (token.isSelected !== selected) {
        token.isSelected = selected;
        token.classList.toggle('selected-ring', selected);
        token.setAttribute('aria-pressed', String(selected));
      }
    });
    aiSquad.forEach(function(player) { moveToken(player.token, player.x, player.y); });
    moveToken(ballToken, matchBall.x, matchBall.y);
    updateRosterStatus();

    var holder = ballHolder();
    var hud = document.getElementById('possession-hud');
    if (holder && hud) {
      var label = 'Ball at #' + holder.num + ' ' + holder.name;
      if (label !== hudLabel) {
        hudLabel = label;
        hud.textContent = label;
      }
    }
  }

  // POINTER DRAG & DROP FOR ANY CHECKER PIECE
  function setupPointerDrag(el, playerObj) {
    var isDragging = false;
    var pitch = document.getElementById('pieces-layer');

    el.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
      selectPlayer(playerObj.id);
      if (!canReposition()) return;
      isDragging = true;
      if (el.setPointerCapture) {
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
      }

    });

    el.addEventListener('pointermove', function (e) {
      if (!isDragging || !pitch || !canReposition()) return;
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
      updatePlayHints();
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
    el.addEventListener('click', function () {
      if (!canReposition()) passToPlayer(playerObj);
    });

    // Keyboard support: Enter / Space to select
    el.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectPlayer(playerObj.id);
        if (!canReposition()) passToPlayer(playerObj);
      }
    });
  }

  // RENDER DYNAMIC SVG VECTORS (Passing corridor, shot corridor)
  function renderTacticalVectors() {
    var svg = document.getElementById('vector-layer');
    if (!svg) return;

    var active = matchBall.holderTeam === 'user' ? ballHolder() : null;
    passPreview = active && !corner && matchSeconds < MATCH_LENGTH ? passOption(active) : null;
    if (!passPreview || active.id !== selectedPlayerId) {
      if (vectorMarkup) {
        svg.replaceChildren();
        vectorMarkup = '';
      }
      return;
    }

    var html = '<defs>' +
      '<marker id="arrow-cyan" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#05f0ff" />' +
      '</marker>' +
      '<marker id="arrow-pink" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ff2882" />' +
      '</marker>' +
      '</defs>';

    var target = passPreview.target;
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

    if (vectorMarkup !== html) {
      svg.innerHTML = html;
      vectorMarkup = html;
    }
  }

  // SELECT ACTIVE PLAYER
  window.selectPlayer = function (id) {
    if (selectedPlayerId === id) return;
    selectedPlayerId = id;
    updatePitchPieces();
    renderTacticalVectors();
    updateActiveTokenCard();
  };

  // UPDATE ACTIVE TOKEN HUD CARD IN RIGHT PANEL
  function updateActiveTokenCard() {
    var player = null;
    for (var i = 0; i < userSquad.length; i++) {
      if (userSquad[i].id === selectedPlayerId) { player = userSquad[i]; break; }
    }
    if (!player) return;

    writeText('active-token-badge', '#' + player.num);
    writeText('active-player-name', player.name.toUpperCase());
    writeText('active-player-role', player.role + ' (' + player.pos + ') · xG ' + Number(player.xg).toFixed(2));
    writeText('active-token-coords', 'Position ' + player.x.toFixed(1) + '%, ' + player.y.toFixed(1) + '%');
  }

  // RENDER ROSTER LIST IN LEFT PANEL
  function renderRosterList() {
    var list = document.getElementById('roster-list');
    if (!list) return;

    var rows = [];
    for (var i = 0; i < userSquad.length; i++) {
      var p = userSquad[i];

      rows.push(
        '<div id="roster-u-' + p.id + '" onclick="selectPlayer(' + p.id + ')" ' +
             'role="button" tabindex="0" aria-pressed="false" ' +
             'class="roster-row p-2 flex items-center justify-between gap-2 cursor-pointer transition-colors focus-visible:ring-1 focus-visible:ring-pl-cyan">' +
          '<div class="flex items-center gap-2 min-w-0">' +
            '<span class="roster-number w-6 h-6 rounded-full bg-pl-purple border font-mono text-[10px] flex items-center justify-center flex-none">' +
              p.num +
            '</span>' +
            '<div class="truncate">' +
              '<input type="text" value="' + escapeAttribute(p.name) + '" maxlength="32" ' +
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
            '<span class="roster-ball text-[9px] font-mono text-pl-green font-bold bg-pl-green/10 border border-pl-green px-1">BALL</span>' +
          '</div>' +
        '</div>'
      );
    }
    list.innerHTML = rows.join('');
    rosterSelection = null;
    rosterPossessor = null;
    updateRosterStatus();
  }

  function updateRosterStatus() {
    if (rosterSelection !== selectedPlayerId) {
      document.getElementById('roster-u-' + rosterSelection)?.setAttribute('aria-pressed', 'false');
      document.getElementById('roster-u-' + selectedPlayerId)?.setAttribute('aria-pressed', 'true');
      rosterSelection = selectedPlayerId;
    }
    var possessor = matchBall.holderTeam === 'user' ? matchBall.holderId : null;
    if (rosterPossessor !== possessor) {
      document.getElementById('roster-u-' + rosterPossessor)?.removeAttribute('data-has-ball');
      document.getElementById('roster-u-' + possessor)?.setAttribute('data-has-ball', '');
      rosterPossessor = possessor;
    }
  }

  function escapeAttribute(value) {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.renamePlayer = function (id, newName) {
    for (var i = 0; i < userSquad.length; i++) {
      if (userSquad[i].id === id && newName && newName.trim()) {
        userSquad[i].name = newName.trim().slice(0, 32);
        userSquad[i].token.setAttribute('aria-label', userSquad[i].name + ' number ' + userSquad[i].num);
        refreshPlay();
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
      var pick = i + Math.floor(Math.random() * (superstars.length - i));
      var name = superstars[pick];
      superstars[pick] = superstars[i];
      superstars[i] = name;
      userSquad[i].name = name;
      userSquad[i].token.setAttribute('aria-label', name + ' number ' + userSquad[i].num);
    }
    updatePitchPieces();
    renderRosterList();
    updateActiveTokenCard();
    logEvent('Generated Premier League all-star lineup for YOU 11!');
  };

  // CHANGE FORMATION
  window.changeFormation = function (fmtName) {
    if (!Object.hasOwn(FORMATION_TEMPLATES, fmtName)) return;
    currentFormation = fmtName;

    var select = document.getElementById('formation-select');
    if (select) select.value = fmtName;

    var template = FORMATION_TEMPLATES[fmtName];
    var reposition = canReposition();
    for (var i = 0; i < userSquad.length; i++) {
      var target = template.user[i];
      if (target) {
        userSquad[i].role = target.role;
        userSquad[i].base_x = target.x;
        userSquad[i].base_y = target.y;
        if (reposition) {
          userSquad[i].x = target.x;
          userSquad[i].y = target.y;
        }
      }
    }

    for (var j = 0; j < aiSquad.length; j++) {
      var aTarget = template.ai[j];
      if (aTarget) {
        aiSquad[j].role = aTarget.role;
        aiSquad[j].base_x = aTarget.x;
        aiSquad[j].base_y = aTarget.y;
        if (reposition) {
          aiSquad[j].x = aTarget.x;
          aiSquad[j].y = aTarget.y;
        }
      }
    }

    if (reposition) makePossessor(ballHolder());
    renderRosterList();
    refreshPlay();
    logEvent('Shifted team tactical shape to ' + fmtName + '.');
  };

  // RECENTER FORMATION
  window.recenterFormation = function () {
    if (!canReposition()) return;
    for (var i = 0; i < userSquad.length; i++) {
      userSquad[i].x = userSquad[i].base_x;
      userSquad[i].y = userSquad[i].base_y;
    }
    for (var j = 0; j < aiSquad.length; j++) {
      aiSquad[j].x = aiSquad[j].base_x;
      aiSquad[j].y = aiSquad[j].base_y;
    }

    makePossessor(ballHolder());
    refreshPlay();
    logEvent('Formation shapes cleanly recentered to default tactical positions.');
  };

  function refreshPlay() {
    updatePitchPieces();
    renderTacticalVectors();
    updateActiveTokenCard();
    updateTelemetryStats();
    updatePlayHints();
  }

  function canReposition() {
    return matchMode === 'match' && !isRunning && matchSeconds === 0 && lastManualAction < 0;
  }

  function manualPossessor() {
    if (corner || matchSeconds >= MATCH_LENGTH) return null;
    if (matchBall.holderTeam !== 'user') {
      logEvent('Win possession with Press before attacking.');
      return null;
    }
    return canIssueCommand() ? ballHolder() : null;
  }

  function canIssueCommand() {
    if (lastManualAction === matchSeconds) return false;
    lastManualAction = matchSeconds;
    return true;
  }

  function finishManualMove() {
    if (!isRunning && document.getElementById('advance-after-move').checked) simulationTick();
    else refreshPlay();
  }

  function playPass(passer, target) {
    var team = passer.team;
    if (!target) {
      var option = passPreview || passOption(passer);
      if (!option) return;
      target = option.target;
    }
    stats[team + 'PassesTotal']++;
    playSound('kick');
    var interceptor = decisionModel.laneDefender(opposingSquad(passer), passer, target);
    var caught = interceptor && Math.random() < decisionModel.interceptionRisk(passer, target, interceptor);
    if (caught) {
      makePossessor(interceptor);
      stats[interceptor.team + 'Recoveries']++;
      logEvent('[INTERCEPTED] ' + interceptor.name + ' wins possession.');
    } else {
      stats[team + 'PassesCompleted']++;
      makePossessor(target);
      previousPasser = passer.id;
      if (team === 'user') logEvent('[PASS] ' + passer.name + ' to ' + target.name + '.');
    }
    if (matchBall.holderTeam === 'user') selectPlayer(matchBall.holderId);
  }

  window.passToNearestTeammate = function () {
    var holder = manualPossessor();
    if (holder) {
      playPass(holder);
      finishManualMove();
    }
  };

  function passToPlayer(target) {
    if (matchBall.holderTeam !== 'user' || target === ballHolder()) return;
    var holder = manualPossessor();
    if (holder) {
      playPass(holder, target);
      finishManualMove();
    }
  }

  function shotChance(shooter) {
    return decisionModel.shotChance(shooter, opposingSquad(shooter), shooter.team === 'user' ? 1 : -1);
  }

  function awardCorner(team, top) {
    var home = team === 'user';
    var squad = home ? userSquad : aiSquad;
    var opponents = home ? aiSquad : userSquad;
    function x(value) { return home ? value : 100 - value; }
    function y(value) { return top ? value : 100 - value; }
    var kicker = squad[top ? 8 : 10];
    var near = squad[9];
    var far = squad[top ? 10 : 8];
    var short = squad[7];
    Object.assign(kicker, { x: x(96.5), y: y(3.5) });
    Object.assign(near, { x: x(88), y: y(43) });
    Object.assign(far, { x: x(86), y: y(61) });
    Object.assign(short, { x: x(89), y: y(17) });
    Object.assign(opponents[0], { x: x(95), y: 50 });
    for (var i = 1; i <= 4; i++) {
      Object.assign(opponents[i], { x: x(i % 2 ? 91 : 83), y: y(30 + i * 9) });
    }
    corner = { near: near, far: far, short: short };
    makePossessor(kicker);
    matchBall.x = kicker.x;
    if (home) selectPlayer(kicker.id);
    else opponentReadout = 'The opponent has a corner.';
    logEvent(home ? '[CORNER] Your team to take.' : '[CORNER] The opponent to take.');
  }

  function deliverCorner(delivery) {
    var kicker = ballHolder();
    var target = corner[delivery];
    var home = kicker.team === 'user';
    corner = null;
    if (delivery === 'short') {
      logEvent('[CORNER] Played short.');
      playPass(kicker, target);
      return;
    }
    var post = delivery === 'near' ? 'near post' : 'far post';
    if (!home) opponentReadout = 'Delivered the corner to the ' + post + '.';
    logEvent('[CORNER] Cross to the ' + post + '.');
    var blockers = opposingSquad(kicker).filter(function (player) {
      return player.role !== 'GK' && Math.hypot(player.x - target.x, player.y - target.y) < 9;
    });
    if (blockers.length && Math.random() < 0.29 + Math.min(blockers.length, 3) * 0.12) {
      makePossessor(blockers[0]);
      if (!home) selectPlayer(blockers[0].id);
      stats[blockers[0].team + 'Recoveries']++;
      logEvent('[CLEARANCE] ' + blockers[0].name + ' reaches the cross first.');
    } else {
      takeShot(target);
    }
  }

  window.takeCorner = function (delivery) {
    if (!corner || matchBall.holderTeam !== 'user' || matchSeconds >= MATCH_LENGTH ||
        !Object.hasOwn(corner, delivery) || !canIssueCommand()) return;
    deliverCorner(delivery);
    finishManualMove();
  };

  function takeShot(shooter) {
    var team = shooter.team;
    var isUser = team === 'user';
    var goalX = isUser ? 97.5 : 2.5;
    var keeper = (isUser ? aiSquad : userSquad)[0];
    var distance = Math.hypot((goalX - shooter.x) * 1.05, (50 - shooter.y) * 0.68);
    var shotXg = shotChance(shooter);
    stats[team + 'ShotsTotal']++;
    stats[team + 'XgTotal'] += shotXg;
    playSound('shot');

    var outcome = decisionModel.shotOutcome(Math.random(), shotXg, distance, Math.random());
    if (outcome !== 'goal-kick') stats[team + 'ShotsOnTarget']++;
    if (outcome === 'goal') {
      if (isUser) userScore++;
      else aiScore++;
      playSound('goal');
      logEvent('[GOAL] ' + shooter.name + ' scores (' + shotXg.toFixed(2) + ' xG).');
      updateScoreboard();
      resetBallToCenter(isUser ? 'ai' : 'user');
    } else if (outcome === 'corner') {
      logEvent('[SAVE] ' + keeper.name + ' pushes the shot behind.');
      awardCorner(team, shooter.y < 50);
    } else {
      if (outcome === 'goal-kick') Object.assign(keeper, { x: isUser ? 94 : 6, y: shooter.y < 50 ? 42 : 58 });
      makePossessor(keeper);
      if (keeper.team === 'user') selectPlayer(keeper.id);
      logEvent(outcome === 'save' ? '[SAVE] ' + keeper.name + ' stops ' + shooter.name + '’s shot.' :
        '[GOAL KICK] ' + shooter.name + ' shoots wide.');
    }
  }

  window.triggerShot = function () {
    var holder = manualPossessor();
    if (holder) {
      takeShot(holder);
      finishManualMove();
    }
  };

  function moveCarrier(player, dx, dy) {
    player.x = clamp(player.x + dx, 3, 97);
    player.y = clamp(player.y + dy, 6, 94);
    makePossessor(player);
  }

  function dribbleTo(dx, dy) {
    var distance = Math.hypot(dx, dy);
    if (distance < 0.1) return;
    var holder = manualPossessor();
    if (!holder) return;
    var step = Math.min(8, distance) / distance;
    moveCarrier(holder, dx * step, dy * step);
    finishManualMove();
  }

  window.executeAction = function (type) {
    if (type === 'PASS') {
      passToNearestTeammate();
    } else if (type === 'SHOOT') {
      triggerShot();
    } else if (type === 'DRIBBLE') {
      dribbleTo(8, 0);
    } else if (!corner && (type === 'PRESS' || type === 'BLOCK') && matchSeconds < MATCH_LENGTH) {
      if (matchBall.holderTeam === 'ai' && canIssueCommand()) {
        if (type === 'BLOCK') {
          coverGoal(ballHolder());
        } else if (!pressureBall(userSquad, ballHolder(), 0.44, 0.62, 43)) {
          logEvent('[PRESS] Closed down the ball. The opponent keeps possession.');
        }
        finishManualMove();
      } else if (matchBall.holderTeam === 'user') {
        logEvent('You already have possession.');
      }
    }
  };

  // NUDGE SELECTED PLAYER (Keyboard Navigation)
  function nudgeSelectedPlayer(dx, dy) {
    if (!canReposition()) {
      if (matchBall.holderTeam === 'user') dribbleTo(dx * 4, dy * 4);
      return;
    }
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
    updatePlayHints();
  }

  // SET AI OPPONENT TACTIC MINDSET
  window.setAIStyle = function (style) {
    if (!Object.hasOwn(tactics, style)) return;
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
    logEvent('Opponent tactic set to ' + style.toLowerCase() + '.');
  };

  window.setAIDifficulty = function (level) {
    if (!Object.hasOwn(difficulty, level)) return;
    var select = document.getElementById('ai-difficulty');
    if (select.disabled) {
      select.value = aiDifficulty;
      return;
    }
    aiDifficulty = level;
    select.value = level;
    if (matchSeconds < MATCH_LENGTH) showChallengeBest();
    logEvent('Opponent difficulty set to ' + level + '.');
  };

  function pressureBall(defenders, holder, pace, chance, range) {
    var closest;
    var best = Infinity;
    defenders.forEach(function(player) {
      if (player.role === 'GK') return;
      var distance = Math.hypot(holder.x - player.x, holder.y - player.y);
      if (distance < best) {
        closest = player;
        best = distance;
      }
    });
    if (!closest || best > range) return false;
    closest.x += (holder.x - closest.x) * pace;
    closest.y += (holder.y - closest.y) * pace;
    if (best * (1 - pace) > 4 || Math.random() >= chance) return false;
    makePossessor(closest);
    stats[closest.team + 'Recoveries']++;
    if (closest.team === 'user') selectPlayer(closest.id);
    logEvent('[TACKLE] ' + closest.name + ' wins the ball.');
    return true;
  }

  function coverGoal(holder) {
    var x = clamp(holder.x * 0.74 + 2.5 * 0.26, 6, 77);
    var y = holder.y * 0.74 + 50 * 0.26;
    var closest;
    var best = Infinity;
    userSquad.forEach(function (player) {
      if (player.role === 'GK') return;
      var distance = Math.hypot(x - player.x, y - player.y);
      if (distance < best) {
        best = distance;
        closest = player;
      }
    });
    if (!closest) return;
    var step = Math.min(1, 18 / Math.max(1, best));
    closest.x += (x - closest.x) * step;
    closest.y += (y - closest.y) * step;
    selectPlayer(closest.id);
    logEvent('[BLOCK] ' + closest.name + ' moves into the shooting lane.');
  }

  function updateTeamShape(players, holder, attacking, line) {
    var direction = players[0].team === 'user' ? 1 : -1;
    players.forEach(function(player) {
      if (player === holder) return;
      var keeper = player.role === 'GK';
      var pressShift = attacking ? 5 : line;
      var targetX = keeper ? player.base_x : player.base_x + (holder.x - 50) * 0.24 + direction * pressShift;
      var targetY = keeper ? 50 + (holder.y - 50) * 0.22 : player.base_y + (holder.y - 50) * (attacking ? 0.1 : 0.27);
      player.x += (clamp(targetX, 4, 96) - player.x) * (attacking ? 0.18 : 0.11);
      player.y += (clamp(targetY, 6, 94) - player.y) * 0.18;
    });
  }

  function automaticAttack(holder, plan, skill) {
    var userHasBall = holder.team === 'user';
    var lead = userHasBall ? userScore - aiScore : aiScore - userScore;
    var late = matchSeconds >= 75 * 60;
    var action = decisionModel.chooseAction(holder, userHasBall ? userSquad : aiSquad, opposingSquad(holder), plan, skill, {
      chasing: late && lead < 0,
      protecting: late && lead > 0,
      tempo: modes[matchMode].tempo || 1,
      previousHolder: previousPasser
    }, Math.random);
    if (action.kind === 'shoot') {
      if (!userHasBall) opponentReadout = 'Took a shot with a ' + Math.round(action.chance * 100) + '% scoring chance.';
      takeShot(holder);
    } else if (action.kind === 'pass') {
      if (!userHasBall) opponentReadout = action.advance > 7 ? 'Played a forward pass to ' + action.target.name + '.' :
        'Passed to ' + action.target.name + ' to keep the ball.';
      playPass(holder, action.target);
    } else {
      if (!userHasBall) opponentReadout = 'Carried the ball toward open space.';
      moveCarrier(holder, action.x - holder.x, action.y - holder.y);
    }
  }

  function updatePlayHints() {
    var holder = ballHolder();
    var userHasBall = holder.team === 'user';
    var fullTime = matchSeconds >= MATCH_LENGTH;
    var actionTaken = lastManualAction === matchSeconds;
    var mode = modes[matchMode];
    var hint;
    if (fullTime) {
      hint = 'Full time. Choose Replay to go again.';
    } else if (actionTaken) {
      hint = isRunning ? 'Action taken. Waiting for the next play.' : 'Action taken. Choose Next play or press N.';
    } else if (corner) {
      hint = userHasBall ? 'Choose a near-post cross, a far-post cross, or play short.' :
        'Opponent corner. Use Next play to see how it’s delivered.';
    } else if (canReposition()) {
      hint = 'Drag players to set up, then Start or use Next play.';
    } else if (userHasBall) {
      hint = passPreview ? 'Suggested pass to #' + passPreview.target.num + ' ' + passPreview.target.name +
        (passPreview.blocker ? ' · Marked lane. Try a dribble or a different pass.' : ' · Tap a teammate or tap grass to dribble.') :
        'Tap a teammate to pass or tap grass to dribble.';
    } else {
      hint = 'Press to try a tackle, or Block to cover the shooting lane.';
    }
    var chance = userHasBall ? 'Shot chance ' + Math.round(shotChance(holder) * 100) + '%' : 'Opponent has the ball';
    writeText('play-hint', hint);
    writeText('shot-chance', fullTime ? 'Full time' : corner ? 'Corner kick' : chance);
    writeText('ai-decision', opponentReadout);
    attackButtons.forEach(function (button) { button.disabled = fullTime || actionTaken || !!corner || !userHasBall; });
    defendButtons.forEach(function (button) { button.disabled = fullTime || actionTaken || !!corner || userHasBall; });
    document.getElementById('corner-controls').hidden = fullTime || actionTaken || !corner || !userHasBall;
    document.getElementById('recenter-formation').hidden = !canReposition();
    document.getElementById('ai-difficulty').disabled = !!mode.challenge && !fullTime &&
      (isRunning || matchSeconds > mode.minute * 60 || lastManualAction >= 0);
  }

  function openPlay(manualMove) {
    var holder = ballHolder();
    var userHasBall = holder.team === 'user';
    stats[holder.team + 'PossessionTicks']++;
    var autoPlay = document.getElementById('autoplay').checked;
    var plan = tactics[aiStyle];
    var skill = difficulty[aiDifficulty];
    var chasing = matchSeconds >= 75 * 60 && aiScore < userScore;
    updateTeamShape(userSquad, holder, userHasBall, 0);
    updateTeamShape(aiSquad, holder, !userHasBall, plan.line + (chasing ? 5 : 0));
    if (userHasBall) {
      opponentReadout = aiStyle === 'COUNTER' ? 'Dropping back to close passing lanes.' :
        aiStyle === 'HIGH PRESS' ? 'Pressing the ball carrier.' : 'Holding shape and closing space.';
    }
    var won = userHasBall
      ? pressureBall(aiSquad, holder, plan.chase * skill.press, plan.tackle * skill.press, plan.range + (chasing ? 5 : 0))
      : !manualMove && pressureBall(userSquad, holder, autoPlay ? 0.26 : 0.14, autoPlay ? 0.32 : 0.18, autoPlay ? 30 : 22);
    if (won && userHasBall) opponentReadout = 'Won the ball with a tackle.';
    if (!won && (!userHasBall || (autoPlay && !manualMove))) {
      automaticAttack(holder, userHasBall ? tactics.BALANCED : plan, userHasBall ? difficulty.pro : skill);
    }
  }

  function simulationTick() {
    if (matchSeconds >= MATCH_LENGTH) return;
    var manualMove = lastManualAction === matchSeconds;
    if (!corner) openPlay(manualMove);
    else if (!manualMove) {
      var delivery = matchBall.holderTeam === 'ai' && aiStyle === 'COUNTER' ? 'short' :
        (Math.random() < 0.5 ? 'near' : 'far');
      deliverCorner(delivery);
    }

    var previousTime = matchSeconds;
    matchSeconds = Math.min(MATCH_LENGTH, matchSeconds + modes[matchMode].seconds);
    if (previousTime < 45 * 60 && matchSeconds >= 45 * 60) {
      resetBallToCenter('ai');
      logEvent('Half time. The opponent starts the second half.');
    }
    if (matchSeconds >= MATCH_LENGTH) finishMatch();
    updateClock();
    refreshPlay();
  }

  function resetBallToCenter(restartingTeam) {
    corner = null;
    previousPasser = null;
    userSquad.concat(aiSquad).forEach(function(player) {
      player.x = player.base_x;
      player.y = player.base_y;
    });
    var squad = restartingTeam === 'user' ? userSquad : aiSquad;
    var kicker = squad[9];
    kicker.x = restartingTeam === 'user' ? 48 : 52;
    kicker.y = 50;
    makePossessor(kicker);
    if (restartingTeam === 'user') selectPlayer(kicker.id);
  }

  function startTimer() {
    clearInterval(simInterval);
    var autoPlay = document.getElementById('autoplay').checked;
    if (isRunning) simInterval = setInterval(simulationTick, (autoPlay ? 850 : 1550) / simSpeed);
  }

  function updateMatchButton() {
    var btn = document.getElementById('sim-toggle-btn');
    var text = document.getElementById('sim-btn-text');
    var icon = document.getElementById('sim-play-icon');
    var action = matchSeconds >= MATCH_LENGTH ? 'Replay' : (isRunning ? 'Pause' : 'Start');
    text.textContent = action;
    btn.setAttribute('aria-label', action + ' match simulation');
    btn.classList.toggle('is-running', isRunning);
    var stepDisabled = isRunning || matchSeconds >= MATCH_LENGTH;
    var seconds = modes[matchMode].seconds;
    var stepLength = seconds === 30 ? '30 seconds' : (seconds === 60 ? '1 minute' : '3 minutes');
    ['next-play-toolbar', 'next-play-pitch'].forEach(function (id) {
      var step = document.getElementById(id);
      step.disabled = stepDisabled;
      step.title = 'Advance ' + stepLength + ' (N)';
    });
    icon.innerHTML = isRunning
      ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'
      : '<polygon points="5 3 19 12 5 21 5 3"/>';
  }

  window.toggleSimulation = function () {
    if (matchSeconds >= MATCH_LENGTH) resetMatch();
    isRunning = !isRunning;
    if (isRunning && soundEnabled) getAudioContext();
    startTimer();
    updateMatchButton();
    updatePlayHints();
  };

  window.stepSimulation = function () {
    if (!isRunning) simulationTick();
  };

  window.toggleSpeed = function () {
    simSpeed = simSpeed === 1 ? 2 : (simSpeed === 2 ? 4 : 1);
    var speedBtn = document.getElementById('speed-btn');
    speedBtn.textContent = simSpeed + 'X';
    speedBtn.setAttribute('aria-label', 'Simulation speed ' + simSpeed + ' times');
    startTimer();
  };

  window.toggleSound = function () {
    soundEnabled = !soundEnabled;
    document.getElementById('sound-toggle').setAttribute('aria-pressed', String(soundEnabled));
    if (soundEnabled) getAudioContext();
  };

  window.chooseMatchMode = function (mode) {
    if (!Object.hasOwn(modes, mode)) return;
    matchMode = mode;
    document.getElementById('autoplay').checked = false;
    document.getElementById('advance-after-move').checked = !!modes[mode].afterMove;
    resetMatch();
  };

  function bestResultKey() {
    return 'tactical-11-best-' + matchMode + (aiDifficulty === 'pro' ? '' : '-' + aiDifficulty);
  }

  function challengeBest() {
    try {
      return localStorage.getItem(bestResultKey());
    } catch (_) {
      return null;
    }
  }

  function showChallengeBest() {
    var best = modes[matchMode].challenge ? challengeBest() : null;
    document.getElementById('match-result').textContent = best ? 'Best finish: ' + best.split(':')[1] : '';
  }

  window.resetMatch = function () {
    var mode = modes[matchMode];
    isRunning = false;
    startTimer();
    matchSeconds = mode.minute * 60;
    lastManualAction = -1;
    opponentReadout = mode.challenge ? 'Ready for the next play.' : 'Ready for kickoff.';
    userScore = mode.score[0];
    aiScore = mode.score[1];
    stats = emptyMatchStats();
    clearEventLog();
    resetBallToCenter(mode.team);
    if (matchMode === 'corner') awardCorner('user', true);
    if (mode.startAt) {
      var holder = ballHolder();
      moveCarrier(holder, mode.startAt.x - holder.x, mode.startAt.y - holder.y);
    }
    renderRosterList();
    updateClock();
    updateScoreboard();
    updateMatchButton();
    refreshPlay();
    document.getElementById('match-objective').textContent = mode.objective;
    showChallengeBest();
    logEvent('Ready to play.');
  };

  function finishMatch() {
    isRunning = false;
    startTimer();
    updateMatchButton();
    playSound('whistle');
    var outcome = userScore === aiScore ? 'Draw' : (userScore > aiScore ? 'Win' : 'Loss');
    var score = userScore + '–' + aiScore;
    var message = 'Full time · ' + score + ' · ' + outcome;
    if (modes[matchMode].challenge) {
      var margin = userScore - aiScore;
      var best = challengeBest();
      if (!best || margin > Number(best.split(':')[0])) {
        try { localStorage.setItem(bestResultKey(), margin + ':' + score); } catch (_) {}
      }
      message += margin > 0 ? ' · Challenge complete!' : ' · Challenge missed';
    }
    document.getElementById('match-result').textContent = message;
    logEvent(message);
  }

  function updateClock() {
    var mins = Math.floor(matchSeconds / 60);
    var secs = matchSeconds % 60;
    writeText('match-clock', (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs);
    writeText('half-badge', mins >= 90 ? 'FT' : (mins < 45 ? '1ST H' : '2ND H'));
  }

  function updateScoreboard() {
    var u = document.getElementById('score-user');
    var a = document.getElementById('score-ai');
    if (u) u.innerText = userScore;
    if (a) a.innerText = aiScore;
  }

  function updateTelemetryStats() {
    var totalTicks = stats.userPossessionTicks + stats.aiPossessionTicks;
    var userPct = totalTicks ? Math.round(stats.userPossessionTicks / totalTicks * 100) : 50;
    var aiPct = 100 - userPct;

    var barU = document.getElementById('bar-possession-user');
    var barA = document.getElementById('bar-possession-ai');

    writeText('possession-val-user', userPct + '%');
    writeText('possession-val-ai', aiPct + '%');
    if (barU.style.width !== userPct + '%') {
      barU.style.width = userPct + '%';
      barA.style.width = aiPct + '%';
      document.getElementById('possession-progress').setAttribute('aria-valuenow', userPct);
    }

    var acc = stats.userPassesTotal > 0
        ? Math.round((stats.userPassesCompleted / stats.userPassesTotal) * 100)
        : null;
    writeText('stat-pass-acc', acc === null ? '—' : acc + '%');
    writeText('stat-shots', stats.userShotsTotal + ' (' + stats.userShotsOnTarget + ')');
    writeText('stat-xg', stats.userXgTotal.toFixed(2));
    writeText('opponent-stats',
      'AI: ' + stats.aiShotsTotal + ' shots (' + stats.aiShotsOnTarget + ' on target) · ' + stats.aiXgTotal.toFixed(2) + ' xG' +
      ' · ' + stats.aiPassesCompleted + ' passes · ' + stats.aiRecoveries + ' recoveries');
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
                    '<span class="' + color + '"></span>';
    div.lastChild.textContent = msg;
    feed.prepend(div);
    if (feed.childElementCount > 40) feed.lastElementChild.remove();
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
      loadPremierLeagueClubs();
      customContent.classList.add('hidden');
    }
  };

  // LOAD PREMIER LEAGUE CLUBS DATASET
  function loadPremierLeagueClubs() {
    if (clubRequest) return;
    var container = document.getElementById('club-presets-container');
    container.textContent = 'Loading squads…';
    clubRequest = fetch('/api/players/2025').then(function(response) {
      if (!response.ok) throw new Error('Squads unavailable');
      return response.json();
    }).then(function(players) {
      clubRosters = new Map();
      players.forEach(function (player) {
        if (!clubRosters.has(player.club)) clubRosters.set(player.club, []);
        clubRosters.get(player.club).push(player);
      });
      buildOfficialClubsList();
    }).catch(function() {
      clubRequest = null;
      container.textContent = 'Squads could not load. ';
      var retry = document.createElement('button');
      retry.textContent = 'Retry';
      retry.className = 'underline';
      retry.onclick = loadPremierLeagueClubs;
      container.appendChild(retry);
    });
  }

  function buildOfficialClubsList() {
    var container = document.getElementById('club-presets-container');
    var topClubs = [
      'Arsenal', 'Manchester City', 'Liverpool', 'Chelsea',
      'Aston Villa', 'Tottenham Hotspur', 'Newcastle United', 'Manchester United'
    ];

    var cards = [];
    for (var i = 0; i < topClubs.length; i++) {
      var clubName = topClubs[i];
      var roster = clubRosters.get(clubName) || [];
      var topStar = roster.reduce(function (best, player) {
        return (player.goals || 0) + (player.assists || 0) > (best.goals || 0) + (best.assists || 0) ? player : best;
      }, roster[0] || { name: 'Squad Star', position: 'FW' });
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
    if (targetTeam !== 'user' && targetTeam !== 'ai') return;
    var roster = clubRosters.get(clubName) || [];

    if (roster.length === 0) return;

    var positions = {
      GK: 'GK', RB: 'DF', RCB: 'DF', CB: 'DF', LCB: 'DF', LB: 'DF', RWB: 'DF', LWB: 'DF',
      DM: 'MF', RDM: 'MF', LDM: 'MF', CM: 'MF', RCM: 'MF', LCM: 'MF', AM: 'MF', RM: 'MF', LM: 'MF',
      RW: 'FW', LW: 'FW', ST: 'FW', RS: 'FW', LS: 'FW'
    };
    var available = roster.slice().sort(function (a, b) { return b.minutes - a.minutes; });
    var slots = FORMATION_TEMPLATES[currentFormation][targetTeam];
    var sortedSquad = slots.map(function(slot) {
      var index = available.findIndex(function(player) { return player.position === positions[slot.role]; });
      if (index === -1) index = available.findIndex(function(player) { return player.position !== 'GK'; });
      return index === -1 ? null : available.splice(index, 1)[0];
    });

    if (targetTeam === 'user') {
      var customInput = document.getElementById('custom-team-input');
      var scoreName = document.getElementById('scoreboard-user-name');
      if (customInput) customInput.value = clubName.toUpperCase();
      if (scoreName) scoreName.innerText = clubName.toUpperCase();

      initSquads(sortedSquad, aiSquad);
      switchLeftTab('custom');
      resetMatch();
      logEvent('Loaded squad ' + clubName + ' into YOU 11.');
    } else {
      var scoreAiName = document.getElementById('scoreboard-ai-name');
      if (scoreAiName) scoreAiName.innerText = clubName.toUpperCase() + ' (AI)';

      initSquads(userSquad, sortedSquad);
      resetMatch();
      logEvent('Set AI opponent to squad ' + clubName + '.');
    }
  };

  // MOUSE COORDINATES TRACKER & CLICK TO MOVE
  function setupPitchCoords() {
    var pitch = document.getElementById('pieces-layer');
    var coordsBadge = document.getElementById('mouse-coords');
    if (!pitch || !coordsBadge) return;

    var lastPointerUpdate = -Infinity;
    pitch.addEventListener('mousemove', function (e) {
      if (e.timeStamp - lastPointerUpdate < 50) return;
      lastPointerUpdate = e.timeStamp;
      var rect = pitch.getBoundingClientRect();
      var xPct = Math.round(((e.clientX - rect.left) / rect.width) * 100);
      var yPct = Math.round(((e.clientY - rect.top) / rect.height) * 100);
      writeText('mouse-coords', 'X: ' + xPct + '% | Y: ' + yPct + '%');
    });

    pitch.addEventListener('click', function (e) {
      if (e.target.closest('.checker-token')) return;
      var rect = pitch.getBoundingClientRect();
      var xPct = Math.round(((e.clientX - rect.left) / rect.width) * 100);
      var yPct = Math.round(((e.clientY - rect.top) / rect.height) * 100);
      if (!canReposition()) {
        if (matchBall.holderTeam === 'user') {
          var holder = ballHolder();
          dribbleTo(xPct - holder.x, yPct - holder.y);
        }
        return;
      }

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
        updatePlayHints();
        logEvent('Relocated #' + active.num + ' ' + active.name + ' to (' + active.x + '%, ' + active.y + '%).');
      }
    });
  }

  // DESKTOP KEYBOARD CONTROLS
  function setupKeyboardControls() {
    window.addEventListener('keydown', function(e) {
      // Ignore if user is typing in an input
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.repeat ||
          (e.target.closest && e.target.closest('input, select, textarea, [contenteditable]'))) {
        return;
      }

      var key = e.key;
      if ((key === 'Enter' || key === ' ') && e.target.matches('.roster-row')) {
        e.preventDefault();
        e.target.click();
        return;
      }
      if (key === ' ' || key === 'Spacebar') {
        if (e.target.closest && e.target.closest('button, a, [role="button"]')) return;
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
      } else if (key === 't' || key === 'T') {
        window.executeAction('PRESS');
      } else if (key === 'b' || key === 'B') {
        window.executeAction('BLOCK');
      } else if (key === 'n' || key === 'N') {
        window.stepSimulation();
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
    attackButtons = document.querySelectorAll('[data-possession-action="attack"]');
    defendButtons = document.querySelectorAll('[data-possession-action="defend"]');
    watchPitchSize();
    initSquads();
    setupPitchCoords();
    setupKeyboardControls();
    resetMatch();
    document.getElementById('autoplay').addEventListener('change', startTimer);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && isRunning) {
        isRunning = false;
        startTimer();
        updateMatchButton();
      }
    });
  });

})();
