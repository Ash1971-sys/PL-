/* Tactical decisions share the same shot and passing geometry as player input. */
(function (root) {
  'use strict';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function roomAt(opponents, x, y) {
    var best = Infinity;
    for (var i = 0; i < opponents.length; i++) {
      var dx = opponents[i].x - x;
      var dy = opponents[i].y - y;
      best = Math.min(best, dx * dx + dy * dy);
    }
    return Math.sqrt(best);
  }

  function laneDefender(opponents, origin, target, skipKeeper) {
    var dx = target.x - origin.x;
    var dy = target.y - origin.y;
    var lengthSquared = dx * dx + dy * dy;
    var blocker = null;
    var best = 16;
    if (!lengthSquared) return null;
    for (var i = 0; i < opponents.length; i++) {
      var player = opponents[i];
      if (skipKeeper && player.role === 'GK') continue;
      var x = player.x - origin.x;
      var y = player.y - origin.y;
      var progress = (x * dx + y * dy) / lengthSquared;
      if (progress < 0.1 || progress > 0.96) continue;
      var offX = x - progress * dx;
      var offY = y - progress * dy;
      var gap = offX * offX + offY * offY;
      if (gap < best) {
        best = gap;
        blocker = player;
      }
    }
    return blocker;
  }

  function goalFor(direction) {
    return { x: direction > 0 ? 97.5 : 2.5, y: 50 };
  }

  function shotChance(origin, opponents, direction, room) {
    var goal = goalFor(direction);
    var distance = Math.hypot((goal.x - origin.x) * 1.05, (goal.y - origin.y) * 0.68);
    var angle = Math.abs(goal.y - origin.y);
    var defense = laneDefender(opponents, origin, goal, true) ? 0.68 : 1;
    var pressure = (room === undefined ? roomAt(opponents, origin.x, origin.y) : room) < 5 ? 0.8 : 1;
    return clamp(0.86 * Math.exp(-distance / 28 - angle / 58) * defense * pressure, 0.02, 0.82);
  }

  function interceptionRisk(passer, target, blocker) {
    if (!blocker) return 0;
    var length = Math.hypot(target.x - passer.x, target.y - passer.y);
    return clamp(0.21 + (100 - (passer.pass_acc ?? 85)) / 150 + length / 360, 0.15, 0.68);
  }

  function bestPass(holder, teammates, opponents, plan, previousHolder) {
    var best = null;
    for (var i = 0; i < teammates.length; i++) {
      var target = teammates[i];
      if (target === holder || target.role === 'GK') continue;
      var advance = (target.x - holder.x) * plan.direction;
      var room = roomAt(opponents, target.x, target.y);
      var blocker = laneDefender(opponents, holder, target);
      var risk = interceptionRisk(holder, target, blocker);
      var chance = shotChance(target, opponents, plan.direction, room);
      var distance = Math.hypot(target.x - holder.x, target.y - holder.y);
      var value = 0.065 + chance * 0.42 + clamp(advance, -22, 28) * 0.0034 * plan.directness + Math.min(room, 14) * 0.003;
      value -= risk * (0.28 + plan.protect * 0.19) + Math.max(0, distance - 31) * 0.002;
      if (target.id === previousHolder) value -= 0.052;
      if (!best || value > best.value) {
        best = { kind: 'pass', target: target, blocker: blocker, risk: risk, advance: advance, value: value };
      }
    }
    return best;
  }

  function bestCarry(holder, opponents, plan) {
    var best = null;
    var x = clamp(holder.x + plan.direction * plan.pace, 4, 96);
    for (var i = -1; i <= 1; i++) {
      var y = clamp(holder.y + i * 7, 7, 93);
      var room = roomAt(opponents, x, y);
      var chance = shotChance({x: x, y: y}, opponents, plan.direction, room);
      var centrality = (Math.abs(holder.y - 50) - Math.abs(y - 50)) * 0.0012;
      var value = 0.09 + chance * 0.35 + Math.min(room, 13) * 0.004 +
        Math.abs(x - holder.x) * 0.006 * plan.directness + centrality;
      if (room < 6) value -= (6 - room) * (0.019 + plan.protect * 0.007);
      if (!best || value > best.value) best = { kind: 'carry', x: x, y: y, value: value };
    }
    return best;
  }

  function chooseAction(holder, teammates, opponents, plan, skill, situation, random) {
    var phase = {
      direction: holder.team === 'user' ? 1 : -1,
      directness: plan.directness + (situation.chasing ? 0.25 : 0),
      pace: plan.pace * skill.pace * situation.tempo,
      protect: situation.protecting ? 1 : 0,
    };
    var pass = bestPass(holder, teammates, opponents, phase, situation.previousHolder);
    if (holder.role === 'GK' && pass) return pass;

    var carry = bestCarry(holder, opponents, phase);
    var room = roomAt(opponents, holder.x, holder.y);
    var chance = shotChance(holder, opponents, phase.direction, room);
    var shot = { kind: 'shoot', chance: chance,
      value: chance * (situation.chasing ? 1.36 : 1.12) - (room < 7 ? 0.018 : 0.065) - phase.protect * 0.03 };
    var candidates = chance > 0.08 ? [carry, shot] : [carry];
    if (pass) candidates.push(pass);
    var choice = null;
    var best = -Infinity;
    candidates.forEach(function (candidate) {
      var score = candidate.value + (random() - 0.5) * skill.variance;
      if (score > best) {
        best = score;
        choice = candidate;
      }
    });
    return choice;
  }

  function shotOutcome(roll, chance, distance, deflection) {
    if (roll < chance) return 'goal';
    if (roll >= chance + (1 - chance) * Math.max(0.18, 0.6 - distance * 0.004)) return 'goal-kick';
    return deflection < 0.28 ? 'corner' : 'save';
  }

  var model = { bestPass: bestPass, chooseAction: chooseAction, interceptionRisk: interceptionRisk,
    laneDefender: laneDefender, shotChance: shotChance, shotOutcome: shotOutcome };
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.PLTacticalAI = model;
})(typeof window === 'object' ? window : this);
