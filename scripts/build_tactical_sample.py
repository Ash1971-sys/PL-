"""Generate the studio's original synthetic replay and matching VP8 video."""

import json
from collections import defaultdict
from math import sin
from pathlib import Path

import cv2 as cv
import numpy as np

from backend.event_classifier import classify, summarize

ROOT = Path(__file__).resolve().parents[1]
FPS, END = 12, 34
SIZE = (640, 422)

# Each tuple is the start and end of a controlled spell in metres.
PLAYS = (
    (0, 3.4, 8, (35, 32), (42, 34)),
    (4.2, 8, 10, (54, 43), (79, 34)),
    (8.8, 11.9, 12, (101, 34), (101, 34)),
    (13, 17.5, 18, (68, 25), (41, 25)),
    (18, 21.2, 20, (32, 34), (25, 34)),
    (22.1, 25.8, 1, (3, 34), (3, 34)),
    (27, 30.2, 6, (27, 24), (43, 30)),
    (31.1, END, 8, (58, 37), (65, 38)),
)
FORM = [(3, 34), (21, 11), (19, 24), (19, 44), (21, 59),
        (35, 19), (34, 34), (35, 50), (48, 12), (49, 34), (48, 56)]


def interpolate(a, b, fraction):
    return tuple(x + (y - x) * fraction for x, y in zip(a, b))


def ball_at(t):
    for index, (start, end, _, a, b) in enumerate(PLAYS):
        if start <= t <= end:
            return interpolate(a, b, (t - start) / (end - start))
        if t < start:
            previous = PLAYS[index - 1]
            return interpolate(previous[4], a, (t - previous[1]) / (start - previous[1]))
    return PLAYS[-1][4]


def player_at(identifier, t, plays, ball):
    known = plays[identifier]
    if known:
        for index, (start, end, _, a, b) in enumerate(known):
            if start <= t <= end:
                return interpolate(a, b, (t - start) / (end - start))
            if t < start:
                if not index:
                    return a
                previous = known[index - 1]
                return interpolate(previous[4], a, (t - previous[1]) / (start - previous[1]))
        return known[-1][4]

    x, y = FORM[(identifier - 1) % 11]
    if identifier > 11:
        x, y = 105 - x, 68 - y
    if identifier not in (1, 12):
        x = min(103, max(2, x + .27 * (ball[0] - 52.5) + 2.5 * sin(t / 3 + identifier)))
        y = min(66, max(2, y + .22 * (ball[1] - 34) + 3 * sin(t / 5 + identifier)))
    return x, y


def pixel(point):
    return round(14 + point[0] * 612 / 105), round(13 + point[1] * 396 / 68)


def pitch():
    image = np.full((SIZE[1], SIZE[0], 3), (36, 31, 35), dtype='uint8')
    for x in range(10):
        cv.rectangle(image, pixel((x * 10.5, 0)), pixel(((x + 1) * 10.5, 68)),
                     (65, 127, 32) if x % 2 else (52, 114, 25), -1)
    ink = (207, 230, 220)
    cv.rectangle(image, pixel((0, 0)), pixel((105, 68)), ink, 2)
    cv.line(image, pixel((52.5, 0)), pixel((52.5, 68)), ink, 2)
    cv.circle(image, pixel((52.5, 34)), 53, ink, 2)
    for goal, inside in [(0, 16.5), (105, 88.5)]:
        cv.rectangle(image, pixel((goal, 13.84)), pixel((inside, 54.16)), ink, 2)
    return image


def sample_frames():
    plays = defaultdict(list)
    for play in PLAYS:
        plays[play[2]].append(play)
    frames = []
    for index in range(END * FPS):
        t = index / FPS
        ball = ball_at(t)
        players = []
        for identifier in range(1, 23):
            x, y = player_at(identifier, t, plays, ball)
            players.append({'id': identifier, 'x': round(x, 2), 'y': round(y, 2),
                            'team': 'home' if identifier <= 11 else 'away',
                            'role': 'goalkeeper' if identifier in (1, 12) else 'player',
                            'shirt': (identifier - 1) % 11 + 1})
        players.append({'id': 23, 'x': round(55 + 12 * sin(t / 7), 2), 'y': 46,
                        'team': 'unknown', 'role': 'referee'})
        frames.append({'t': round(t, 3), 'ball': dict(x=round(ball[0], 2), y=round(ball[1], 2)), 'players': players})
    return frames


def main():
    folder = ROOT / 'static' / 'data'
    frames = sample_frames()
    events = classify(frames)
    metadata = {'source': 'synthetic', 'name': 'Synthetic training clip', 'roles': ['player', 'goalkeeper', 'referee', 'ball'],
                'team_tags': True, 'home_attacks_right': True, 'ball_frames': len(frames)}
    writer = cv.VideoWriter(str(folder / 'tactical-sample.webm'), cv.VideoWriter_fourcc(*'VP80'), FPS, SIZE)
    if not writer.isOpened():
        raise SystemExit('This OpenCV build has no VP8/WebM encoder.')
    base = pitch()
    try:
        for frame in frames:
            image = base.copy()
            for p in frame['players']:
                x, y = pixel((p['x'], p['y']))
                colour = {'home': (203, 253, 73), 'away': (180, 124, 254), 'unknown': (73, 220, 232)}[p['team']]
                cv.circle(image, (x, y), 11, (29, 22, 42), -1, cv.LINE_AA)
                cv.circle(image, (x, y), 9, colour, -1, cv.LINE_AA)
                cv.putText(image, str(p.get('shirt', 'R')), (x - 6, y + 3), cv.FONT_HERSHEY_SIMPLEX,
                           .3, (22, 15, 26), 1, cv.LINE_AA)
            ball = frame['ball']
            cv.circle(image, pixel((ball['x'], ball['y'])), 5, (252, 252, 252), -1, cv.LINE_AA)
            cv.putText(image, 'SYNTHETIC TRAINING CLIP', (20, 30), cv.FONT_HERSHEY_SIMPLEX,
                       .44, (255, 255, 255), 1, cv.LINE_AA)
            writer.write(image)
    finally:
        writer.release()
    payload = {'fps': FPS, 'frames': frames, 'events': events, 'stats': summarize(frames, events), 'meta': metadata}
    (folder / 'tactical-sample.json').write_text(json.dumps(payload, separators=(',', ':')), encoding='utf-8')
    print(f'Wrote {len(frames)} synthetic frames and {len(events)} event markers.')


if __name__ == '__main__':
    main()
