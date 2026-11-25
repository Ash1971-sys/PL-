"""Transparent, trajectory-based estimates. No event is an officiating decision."""

from collections import defaultdict
from math import atan2, exp, hypot

LENGTH, WIDTH = 105, 68
TEAMS = ('home', 'away')
MAX_GAP = .6
SPRINT_SPEED = 7.0


def distance(a, b):
    return hypot(a['x'] - b['x'], a['y'] - b['y'])


def attack_x(point, team, home_right):
    return point['x'] if (team == 'home') == home_right else LENGTH - point['x']


def shot_quality(point, team, home_right):
    depth = max(.5, LENGTH - attack_x(point, team, home_right))
    offset = point['y'] - WIDTH / 2
    angle = atan2(offset + 3.66, depth) - atan2(offset - 3.66, depth)
    return round(1 / (1 + exp(2.2 + .09 * hypot(depth, offset) - 3.1 * angle)), 3)


def infer_control(ball, players, previous):
    if ball is None:
        return None
    nearby = [(distance(ball, p), p) for p in players.values()
              if p['team'] in TEAMS and p['role'] != 'referee']
    if not nearby:
        return None
    gap, player = min(nearby, key=lambda pair: pair[0])
    incumbent = players.get(previous)
    if incumbent and distance(ball, incumbent) < min(2.35, gap + .55):
        return previous
    return player['id'] if gap <= 1.8 else None


def event(kind, t, player, **details):
    return {'type': kind, 't': round(t, 3), 'team': player['team'], 'player': player['id'], **details}


def resolve_flight(flight, ball, receiver, t, home_right):
    """Classify a release once the ball is controlled again or visibly leaves the pitch."""
    origin, start, first, player = flight
    team = player['team']
    elapsed = t - start
    if ball is None or elapsed <= 0 or elapsed > 3.5 or distance(origin, ball) < 2:
        return []
    progress = attack_x(ball, team, home_right) - attack_x(origin, team, home_right)
    first_progress = attack_x(first, team, home_right) - attack_x(origin, team, home_right)
    goal_depth = LENGTH - attack_x(origin, team, home_right)
    if progress > 3 and first_progress > .4:
        projected_y = origin['y'] + (ball['y'] - origin['y']) * goal_depth / progress
        aimed_at_goal = abs(projected_y - WIDTH / 2) <= 6.5
        if goal_depth < 37 and progress / elapsed > 5.5 and aimed_at_goal and (
            not receiver or receiver['team'] != team
        ):
            xg = shot_quality(origin, team, home_right)
            result = [event('shot', start, player, xg=xg, observed_at=t)]
            if attack_x(ball, team, home_right) > LENGTH + .15 and abs(ball['y'] - WIDTH / 2) <= 3.66:
                result.append(event('goal_candidate', t, player, confidence='review'))
            elif receiver and receiver['role'] == 'goalkeeper' and receiver['team'] != team:
                result.append(event('save', t, receiver, confidence='inferred'))
            return result

    if receiver and receiver['id'] == player['id']:
        return []
    return [event('pass', start, player,
                  observed_at=t,
                  target=receiver['id'] if receiver else None,
                  outcome='complete' if receiver and receiver['team'] == team else 'incomplete',
                  build_up=attack_x(origin, team, home_right) <= LENGTH * .6)]


def classify(frames, home_right=True):
    """Annotate frames with control/motion and return candidate events in timestamp order."""
    events = []
    previous = {}
    last_t = None
    last_ball = None
    last_control = None
    candidate = (None, 0)
    owner = None
    flight = None
    recoveries = {}
    duel = None
    assist = None
    for frame in frames:
        t, ball = frame['t'], frame['ball']
        dt = 0 if last_t is None else t - last_t
        continuous = 0 < dt <= MAX_GAP and not frame.get('cut')
        players = {p['id']: p for p in frame['players']}
        if not continuous:
            owner = last_control = flight = duel = assist = None
            recoveries.clear()

        motion = []
        if continuous:
            for identifier, player in players.items():
                if identifier in previous and player['role'] != 'referee':
                    metres = distance(player, previous[identifier])
                    speed = metres / dt
                    if .1 < metres and speed <= 13:
                        motion.append([identifier, round(metres, 3), round(speed, 2)])
        frame['motion'] = motion

        nearest = infer_control(ball, players, owner)
        candidate = (nearest, candidate[1] + 1) if nearest == candidate[0] and continuous else (nearest, 1)
        if nearest != owner and (nearest is None or candidate[1] >= 2):
            owner = nearest
        controller = players.get(owner) if ball is not None and (nearest == owner or nearest is not None) else None
        if controller and distance(ball, controller) > 2.55:
            controller = None
        frame['control'] = {'team': controller['team'], 'id': controller['id']} if controller else None

        if ball is None:
            if flight and t - flight[1] > .4:
                flight = None
        elif last_control and not flight and (not controller or controller['id'] != last_control[0]['id']):
            before, start, origin = last_control
            if t - start < MAX_GAP:
                flight = (origin, start, ball, before)

        if flight and ball is not None:
            exited = not (-.15 <= ball['x'] <= LENGTH + .15 and -.15 <= ball['y'] <= WIDTH + .15)
            if controller or exited or t - flight[1] > 3.5:
                release = resolve_flight(flight, ball, controller, t, home_right)
                for marker in release:
                    if marker['type'] == 'pass' and marker['outcome'] == 'complete':
                        assist = marker
                    if marker['type'] == 'shot' and marker['xg'] >= .14:
                        creator = (dict(id=assist['player'], team=assist['team']) if assist and
                                   assist['target'] == marker['player'] and 0 <= marker['t'] - assist['t'] <= 5
                                   else flight[3])
                        events.append(event('chance', marker['t'], creator, observed_at=t))
                events.extend(release)
                flight = None
                last_control = None if exited else last_control

        if controller:
            team = controller['team']
            if last_control and team != last_control[0]['team'] and t - last_control[1] <= 3.5:
                opponent, start, before = last_control
                pressing = attack_x(opponent, opponent['team'], home_right) <= LENGTH * .6
                in_contact = (t - start <= .55 and distance(controller, opponent) <= 2.4
                              and distance(ball, before) <= 3.0)
                events.append(event('recovery', t, controller, pressing=pressing, interception=not in_contact))
                if in_contact:
                    events.append(event('tackle', t, controller, pressing=pressing))
                    current_opponent = players.get(opponent['id'])
                    prior_opponent = previous.get(opponent['id'])
                    # Contact followed by an abrupt stop warrants a video review cue only.
                    if continuous and current_opponent and prior_opponent and last_ball and (
                        distance(current_opponent, prior_opponent) / dt < .7
                        and distance(ball, last_ball) / dt < 1.5
                        and distance(controller, current_opponent) < 1.2
                    ):
                        events.append(event('foul_candidate', t, controller, confidence='review'))
                recoveries = {team: (t, controller)}
                duel = None
            if team in recoveries:
                start, origin = recoveries[team]
                gain = attack_x(ball, team, home_right) - attack_x(origin, team, home_right)
                elapsed = t - start
                if .6 <= elapsed <= 8 and gain >= 12:
                    events.append(event('counter', t, controller, value=round(gain / elapsed, 2)))
                    del recoveries[team]
                elif elapsed > 8:
                    del recoveries[team]

            close = any(p['team'] in TEAMS and p['team'] != team and distance(p, controller) <= 2.8
                        for p in players.values())
            if duel and duel[1]['id'] == controller['id']:
                start, origin = duel
                if t - start > 4:
                    duel = None
                elif t - start >= .55 and not close and distance(origin, controller) >= 4:
                    events.append(event('dribble', t, controller))
                    duel = None
            elif close:
                duel = (t, controller)
            else:
                duel = None
            last_control = (controller, t, ball)
        elif duel and t - duel[0] > .55:
            duel = None

        previous, last_t, last_ball = players, t, ball
    return sorted(events, key=lambda marker: marker['t'])


METRICS = ('saves', 'passes', 'completed_passes', 'foul_candidates', 'tackles', 'recoveries', 'shots',
           'chances', 'dribbles', 'goals', 'xg', 'distance_m', 'sprint_m', 'sprints', 'top_speed_mps',
           'possession_seconds', 'counter_speed_mps')
EVENT_METRIC = {'save': 'saves', 'foul_candidate': 'foul_candidates', 'tackle': 'tackles',
                'recovery': 'recoveries', 'shot': 'shots', 'chance': 'chances', 'dribble': 'dribbles',
                'goal_candidate': 'goals', 'pass': 'passes'}


def summarize(frames, events, until=None):
    """Aggregate the same observations used by the studio, including missing-data coverage."""
    teams = {team: dict.fromkeys(METRICS, 0) for team in TEAMS}
    players = defaultdict(lambda: dict.fromkeys(METRICS, 0))
    defending = defaultdict(int)
    allowed_passes = defaultdict(int)
    counters = defaultdict(list)
    sprinting = set()
    recent = defaultdict(float)
    previous = None
    end = frames[-1]['t'] if until is None and frames else until or 0
    for f in frames:
        if f['t'] > end:
            break
        control = previous and previous.get('control')
        dt = f['t'] - previous['t'] if previous else 0
        if control and not f.get('cut') and 0 < dt <= MAX_GAP and control['team'] in teams:
            teams[control['team']]['possession_seconds'] += dt
            players[control['id']]['possession_seconds'] += dt
            recent[control['team']] += max(0, f['t'] - max(previous['t'], end - 300))
        roles = {p['id']: p['team'] for p in f['players']}
        now_sprinting = set()
        for identifier, metres, speed in f.get('motion', []):
            team = roles[identifier]
            rows = [players[identifier]] + ([teams[team]] if team in teams else [])
            for row in rows:
                row['distance_m'] += metres
                row['top_speed_mps'] = max(row['top_speed_mps'], speed)
                if speed >= SPRINT_SPEED:
                    row['sprint_m'] += metres
                    row['sprints'] += identifier not in sprinting
            if speed >= SPRINT_SPEED:
                now_sprinting.add(identifier)
        sprinting, previous = now_sprinting, f

    for e in events:
        if e.get('observed_at', e['t']) > end or e['team'] not in teams:
            continue
        team, identifier, kind = e['team'], e['player'], e['type']
        for row in (teams[team], players[identifier]):
            if kind in EVENT_METRIC:
                row[EVENT_METRIC[kind]] += 1
            if kind == 'pass' and e['outcome'] == 'complete':
                row['completed_passes'] += 1
            if kind == 'shot':
                row['xg'] += e['xg']
        if kind == 'counter':
            counters[team].append(e['value'])
            counters[identifier].append(e['value'])
        elif kind == 'pass' and e.get('build_up'):
            allowed_passes['away' if team == 'home' else 'home'] += 1
        elif e.get('pressing') and (kind == 'tackle' or (kind == 'recovery' and e['interception'])):
            defending[team] += 1

    tracked = sum(row['possession_seconds'] for row in teams.values())
    recent_total = sum(recent.values())
    for key, row in [*teams.items(), *players.items()]:
        speeds = counters[key]
        row['counter_speed_mps'] = sum(speeds) / len(speeds) if speeds else None
        row['counter_speed_kmh'] = row['counter_speed_mps'] * 3.6 if speeds else None
        row['conversion_pct'] = row['goals'] / row['shots'] * 100 if row['shots'] else None
        row['pass_accuracy_pct'] = row['completed_passes'] / row['passes'] * 100 if row['passes'] else None
        row['possession_pct'] = row['possession_seconds'] / tracked * 100 if tracked else None
        row['ppda'] = allowed_passes[key] / defending[key] if key in TEAMS and defending[key] else None
        row['prediction_pct'] = ((recent[key] / recent_total) * .8 + .1) * 100 if key in TEAMS and recent_total >= 15 else None
        for metric, value in row.items():
            if isinstance(value, float):
                row[metric] = round(value, 3)
    return {'teams': teams, 'players': dict(players), 'tracked_seconds': round(tracked, 3)}
