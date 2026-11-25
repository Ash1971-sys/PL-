const assert = require('node:assert/strict');
const test = require('node:test');
const model = require('../static/js/tactical-ai.js');

test('a parried shot earns a corner and a wide shot earns a goal kick', () => {
  assert.equal(model.shotOutcome(0.1, 0.3, 15, 0.1), 'goal');
  assert.equal(model.shotOutcome(0.5, 0.3, 15, 0.1), 'corner');
  assert.equal(model.shotOutcome(0.5, 0.3, 15, 0.5), 'save');
  assert.equal(model.shotOutcome(0.95, 0.3, 15, 0.1), 'goal-kick');
});

const style = { directness: 1, pace: 5 };
const skill = { pace: 1, variance: 0 };
const neutral = { tempo: 1, chasing: false, protecting: false, previousHolder: null };
const defender = (x, y) => ({ x, y, role: 'CB' });
const player = (id, x, y, role = 'ST') => ({ id, x, y, role, team: 'user', pass_acc: 85 });

function choose(holder, teammates, opponents, situation = neutral) {
  return model.chooseAction(holder, teammates, opponents, style, skill, situation, () => 0.5);
}

test('a keeper distributes the ball rather than shooting or carrying', () => {
  const keeper = player(1, 8, 50, 'GK');
  const outlet = player(2, 25, 74, 'RB');
  const action = choose(keeper, [keeper, outlet], [defender(15, 52)]);
  assert.equal(action.kind, 'pass');
  assert.equal(action.target, outlet);
});

test('a player with a clear close-range chance takes the shot in either direction', () => {
  const home = player(2, 91, 50);
  const away = { ...player(102, 9, 50), team: 'ai' };
  const atHome = choose(home, [home], [defender(75, 25)]);
  const awayFromHome = choose(away, [away], [defender(25, 25)]);
  assert.equal(atHome.kind, 'shoot');
  assert.equal(awayFromHome.kind, 'shoot');
  assert.equal(atHome.chance, awayFromHome.chance);
});

test('the passing model prefers a clear outlet over a marked lane', () => {
  const holder = player(2, 47, 50);
  const marked = player(3, 69, 50);
  const clear = player(4, 65, 67);
  const opponents = [defender(59, 50)];
  const pass = model.bestPass(holder, [holder, marked, clear], opponents,
    { direction: 1, directness: 1, protect: 0 }, null);
  assert.equal(pass.target, clear);
  assert.equal(pass.risk, 0);
  assert.ok(model.interceptionRisk(holder, marked, model.laneDefender(opponents, holder, marked)) > 0);
});

test('players carry the ball away from a defender in the central lane', () => {
  const holder = player(2, 35, 50);
  const action = choose(holder, [holder], [defender(41, 50), defender(41, 57)]);
  assert.equal(action.kind, 'carry');
  assert.ok(action.x > holder.x);
  assert.ok(action.y < holder.y);
});

test('a player rarely returns an otherwise even pass to the previous passer', () => {
  const holder = player(2, 47, 50);
  const first = player(3, 62, 40);
  const second = player(4, 62, 60);
  const pass = model.bestPass(holder, [holder, first, second], [],
    { direction: 1, directness: 1, protect: 0 }, first.id);
  assert.equal(pass.target, second);
});
