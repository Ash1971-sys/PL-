"""Local YOLO / ByteTrack video ingestion and pitch-coordinate projection."""

from bisect import bisect_right
from collections import Counter, defaultdict
from importlib.util import find_spec
from math import ceil, isfinite
from pathlib import Path
from threading import BoundedSemaphore
from urllib.parse import unquote
import gc
import json
import logging
import os
import tempfile

from .event_classifier import LENGTH, WIDTH, classify, summarize

PITCH_CORNERS = [[0, 0], [LENGTH, 0], [LENGTH, WIDTH], [0, WIDTH]]
MODELS = ('yolo26n.pt', 'yolo26s.pt', 'yolo11s.pt')
CLASSES = {
    'person': 'player', 'player': 'player', 'football player': 'player',
    'goalkeeper': 'goalkeeper', 'goal keeper': 'goalkeeper', 'keeper': 'goalkeeper',
    'referee': 'referee', 'official': 'referee',
    'sports ball': 'ball', 'football': 'ball', 'soccer ball': 'ball', 'ball': 'ball',
}
JOBS = BoundedSemaphore(1)
LOG = logging.getLogger(__name__)
PROJECT = Path(__file__).resolve().parents[1]


class VideoError(ValueError):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def int_setting(key, default, minimum, maximum):
    try:
        return max(minimum, min(maximum, int(os.environ.get(key, default))))
    except ValueError:
        return default


def capabilities():
    packages = ('cv2', 'numpy', 'torch', 'ultralytics', 'lap')
    missing = [name for name in packages if find_spec(name) is None]
    return {
        'available': not missing and os.environ.get('PL_VIDEO_ENABLED', '1') != '0',
        'missing': missing,
        'max_bytes': int_setting('PL_VIDEO_MAX_MB', 80, 1, 2048) * 1024 * 1024,
        'max_seconds': int_setting('PL_VIDEO_MAX_SECONDS', 120, 5, 5400)
    }


def calibration_specs(header):
    if not header or len(header) > 12000:
        raise VideoError(422, 'Calibrate the pitch with at least four landmarks.')
    try:
        entries = json.loads(header)
        if not isinstance(entries, list) or not 1 <= len(entries) <= 50:
            raise ValueError()
        for entry in entries:
            t = entry['t']
            if not isinstance(t, (int, float)) or not isfinite(t) or t < 0:
                raise ValueError()
            points = entry['points']
            targets = entry.get('pitch', PITCH_CORNERS)
            if len(points) != len(targets) or not 4 <= len(points) <= 12:
                raise ValueError()
            for pairs, limit in ((points, (1, 1)), (targets, (LENGTH, WIDTH))):
                for row in pairs:
                    if len(row) != 2 or any(not isinstance(v, (int, float)) or not 0 <= v <= bound
                                            for v, bound in zip(row, limit)):
                        raise ValueError()
        times = [item['t'] for item in entries]
        if times[0] != 0 or any(a >= b for a, b in zip(times, times[1:])):
            raise ValueError()
        return entries
    except (AttributeError, ValueError, TypeError, KeyError) as exc:
        raise VideoError(422, 'Calibration needs ordered timestamps starting at zero and paired image/pitch points.') from exc


def homographies(cv, np, entries, width, height):
    result = []
    for entry in entries:
        pixels = np.asarray(entry['points'], dtype='float32') * np.array([width, height], dtype='float32')
        metres = np.asarray(entry.get('pitch', PITCH_CORNERS), dtype='float32')
        if cv.contourArea(cv.convexHull(pixels)) < width * height * .01:
            raise VideoError(422, 'Pitch landmarks must cover a wider area and cannot lie on one line.')
        matrix, inliers = cv.findHomography(pixels, metres, cv.RANSAC, 1.2)
        if matrix is None or not np.isfinite(matrix).all() or inliers is None or int(inliers.sum()) < 4:
            raise VideoError(422, 'The pitch projection could not be solved. Check each landmark.')
        result.append(matrix)
    return result


def jersey_color(cv, np, image, bounds):
    x, y, end_x, end_y = bounds
    w, h = end_x - x, end_y - y
    left, right = max(0, int(x + .22 * w)), min(image.shape[1], int(end_x - .22 * w))
    top, bottom = max(0, int(y + .19 * h)), min(image.shape[0], int(y + .52 * h))
    torso = image[top:bottom, left:right]
    if torso.size < 27:
        return None
    small = cv.resize(torso, (7, 7), interpolation=cv.INTER_AREA)
    return np.median(cv.cvtColor(small, cv.COLOR_BGR2LAB).reshape(-1, 3), axis=0)


def tag_teams(np, frames, samples, roles, positions, home_right):
    colors = {identifier: np.median(values, axis=0) for identifier, values in samples.items() if values}
    role = {identifier: counts.most_common(1)[0][0] for identifier, counts in roles.items()}
    field = [identifier for identifier in colors if role[identifier] == 'player']
    tags = {}
    if len(field) >= 4:
        data = np.array([colors[key] for key in field])
        middle = np.median(data, axis=0)
        seed = data[np.argmax(np.linalg.norm(data - middle, axis=1))]
        groups = np.array([seed, data[np.argmax(np.linalg.norm(data - seed, axis=1))]])
        for _ in range(8):
            distances = np.linalg.norm(data[:, None] - groups[None], axis=2)
            labels = np.argmin(distances, axis=1)
            if len(set(labels)) < 2:
                break
            groups = np.array([np.median(data[labels == index], axis=0) for index in range(2)])
        if min(np.bincount(labels, minlength=2)) >= 2 and np.linalg.norm(groups[0] - groups[1]) >= 16:
            cluster_x = [np.median([np.median(positions[key]) for key, label in zip(field, labels) if label == index])
                         for index in range(2)]
            home = int(np.argmin(cluster_x) if home_right else np.argmax(cluster_x))
            for i, key in enumerate(field):
                if abs(distances[i][0] - distances[i][1]) > 8:
                    tags[key] = 'home' if labels[i] == home else 'away'
            for key, player_role in role.items():
                if player_role == 'goalkeeper':
                    x = np.median(positions[key])
                    if x < 28 or x > LENGTH - 28:
                        tags[key] = 'home' if (x < LENGTH / 2) == home_right else 'away'
    for frame in frames:
        for player in frame['players']:
            key = player['id']
            player['role'] = role[key]
            player['team'] = tags.get(key, 'unknown')
    return bool(tags)


def detector(yolo):
    configured = os.environ.get('PL_VIDEO_WEIGHTS')
    if configured:
        file = Path(configured).expanduser()
        if not file.is_file() or file.suffix.lower() != '.pt':
            raise VideoError(503, 'PL_VIDEO_WEIGHTS must point to a trusted local .pt checkpoint.')
        try:
            return yolo(str(file.resolve())), file.name
        except Exception as exc:
            raise VideoError(503, 'The configured YOLO checkpoint could not be loaded.') from exc

    preferred = os.environ.get('PL_VIDEO_MODEL', MODELS[0])
    models = dict.fromkeys((preferred, *MODELS) if preferred in MODELS else MODELS)
    last_error = None
    for name in models:
        local = PROJECT / 'backend' / 'models' / name
        if not local.exists() and os.environ.get('PL_VIDEO_DOWNLOAD', '1') == '0':
            continue
        try:
            local.parent.mkdir(parents=True, exist_ok=True)
            return yolo(str(local)), name
        except Exception as exc:
            last_error = exc
            LOG.warning('Could not load %s. Trying the next detector.', name)
    raise VideoError(503, 'YOLO weights are unavailable. Install a supported model or use the synthetic sample.') from last_error


def detections(result):
    boxes = result.boxes
    if boxes is None or len(boxes) == 0:
        return ()
    ids = boxes.id.tolist() if boxes.id is not None else [None] * len(boxes)
    return zip(ids, boxes.cls.tolist(), boxes.conf.tolist(), boxes.xyxy.tolist())


def track_video(path, calibration, settings, home_right, name, half, size, max_seconds):
    import cv2 as cv
    import numpy as np
    from ultralytics import YOLO

    video = cv.VideoCapture(str(path))
    frames, samples, positions, roles = [], defaultdict(list), defaultdict(list), defaultdict(Counter)
    markers = [entry['t'] for entry in calibration]
    try:
        if not video.isOpened():
            raise VideoError(422, 'OpenCV could not decode the video. Try H.264 MP4 or VP8/VP9 WebM.')
        original_fps = video.get(cv.CAP_PROP_FPS)
        if not isfinite(original_fps) or not 1 <= original_fps <= 240:
            raise VideoError(422, 'The video has no usable frame rate.')
        count = video.get(cv.CAP_PROP_FRAME_COUNT)
        if isfinite(count) and count / original_fps > max_seconds + .25:
            raise VideoError(413, f'This server accepts clips up to {max_seconds} seconds.')
        width = round(video.get(cv.CAP_PROP_FRAME_WIDTH))
        height = round(video.get(cv.CAP_PROP_FRAME_HEIGHT))
        if width < 32 or height < 32 or width * height > 3840 * 2160:
            raise VideoError(422, 'A readable video up to 4K resolution is required.')
        transforms = homographies(cv, np, calibration, width, height)
        model, model_name = detector(YOLO)
        names = model.names
        labels = names.items() if isinstance(names, dict) else enumerate(names)
        normalized = {key: str(value).lower().strip().replace('-', ' ').replace('_', ' ') for key, value in labels}
        class_map = {key: CLASSES[value] for key, value in normalized.items() if value in CLASSES}
        if 'player' not in class_map.values() or 'ball' not in class_map.values():
            raise VideoError(503, 'The checkpoint must contain player/person and football/sports ball classes.')
        stride = max(1, round(original_fps / settings), ceil(count / 16000) if isfinite(count) else 1)
        index, previous_shot, last_t, last_ball = -1, 0, -1, None
        while video.grab():
            index += 1
            if index / original_fps > max_seconds + .25:
                raise VideoError(413, f'This server accepts clips up to {max_seconds} seconds.')
            if index % stride:
                continue
            ok, image = video.retrieve()
            if not ok:
                continue
            pts = video.get(cv.CAP_PROP_POS_MSEC) / 1000
            elapsed = pts if isfinite(pts) and pts > last_t else index / original_fps
            t = round(max(elapsed, last_t + .001), 3)
            shot = max(0, bisect_right(markers, t) - 1)
            cut = shot != previous_shot
            if cut:
                for tracker in model.predictor.trackers:
                    tracker.reset()
                last_ball = None
            output = model.track(image, persist=True, tracker='bytetrack.yaml', half=half,
                                 device=0 if half else 'cpu', imgsz=size, conf=.1, max_det=64,
                                 classes=list(class_map), verbose=False)[0]
            found, candidates = [], []
            rows = list(detections(output))
            if rows:
                source = np.asarray([[(box[0] + box[2]) / 2, box[3]] for _, _, _, box in rows], dtype='float32')
                ground = cv.perspectiveTransform(source[None, :, :], transforms[shot])[0]
                for (identifier, label, score, box), (x, y) in zip(rows, ground):
                    if not (-5 <= x <= LENGTH + 5 and -5 <= y <= WIDTH + 5):
                        continue
                    kind = class_map[int(label)]
                    point = {'x': round(float(x), 3), 'y': round(float(y), 3)}
                    if kind == 'ball':
                        candidates.append((score, point))
                    elif identifier is not None and 0 <= x <= LENGTH and 0 <= y <= WIDTH:
                        key = int(identifier) + shot * 1_000_000
                        found.append({'id': key, **point})
                        roles[key][kind] += 1
                        if len(positions[key]) < 24:
                            positions[key].append(float(x))
                        if kind == 'player' and len(samples[key]) < 24 and index % (stride * 3) == 0:
                            color = jersey_color(cv, np, image, box)
                            if color is not None:
                                samples[key].append(color)
            def ball_rank(candidate):
                score, point = candidate
                continuity = (min(25, np.hypot(point['x'] - last_ball['x'], point['y'] - last_ball['y'])) * .012
                              if last_ball else 0)
                return score - continuity
            ball = max(candidates, key=ball_rank)[1] if candidates else None
            frame = {'t': t, 'ball': ball, 'players': found}
            if cut:
                frame['cut'] = True
            frames.append(frame)
            last_t, previous_shot, last_ball = t, shot, ball
    finally:
        video.release()

    if len(frames) < 2:
        raise VideoError(422, 'The video did not contain enough decodable frames.')
    team_tags = False
    # Camera changes reset tracking. Infer shirt clusters independently in each shot.
    for shot in set(key // 1_000_000 for key in roles):
        tagged = tag_teams(np, [f for f in frames if bisect_right(markers, f['t']) - 1 == shot],
                           {k: v for k, v in samples.items() if k // 1_000_000 == shot},
                           {k: v for k, v in roles.items() if k // 1_000_000 == shot}, positions, home_right)
        team_tags = team_tags or tagged
    events = classify(frames, home_right)
    visible = set(class_map.values())
    return {'fps': round(original_fps / stride, 3), 'frames': frames, 'events': events,
            'stats': summarize(frames, events),
            'meta': {'source': 'yolo', 'model': model_name, 'precision': 'fp16' if half else 'fp32 CPU',
                     'tracker': 'ByteTrack', 'name': name, 'home_attacks_right': home_right,
                     'roles': sorted(visible), 'team_tags': team_tags,
                     'ball_frames': sum(frame['ball'] is not None for frame in frames)}}


def run_analysis(path, calibration, limits, home_right, name):
    os.environ.setdefault('YOLO_CONFIG_DIR', str(Path(tempfile.gettempdir()) / 'pl-video-yolo'))
    os.environ.setdefault('YOLO_AUTOINSTALL', 'false')
    import torch

    cuda = torch.cuda.is_available()
    fps = int_setting('PL_VIDEO_FPS', 8, 2, 15)
    try:
        return track_video(path, calibration, fps, home_right, name, cuda, 640, limits['max_seconds'])
    except torch.cuda.OutOfMemoryError:
        LOG.warning('CUDA memory exhausted. Retrying this video on CPU.')
    gc.collect()
    torch.cuda.empty_cache()
    return track_video(path, calibration, fps, home_right, name, False, 512, limits['max_seconds'])


def upload_response(stream, length, headers):
    """Read a bounded raw-video request and return an HTTP status and JSON object."""
    limits = capabilities()
    try:
        if length is None or length <= 0:
            raise VideoError(411, 'A non-empty video with Content-Length is required.')
        if length > limits['max_bytes']:
            raise VideoError(413, f"Video limit is {limits['max_bytes'] // (1024 * 1024)} MiB.")
        name = unquote(headers.get('X-Video-Name', '')).replace('\\', '/').split('/')[-1][:150]
        suffix = Path(name).suffix.lower()
        if suffix not in ('.mp4', '.webm', '.mkv'):
            raise VideoError(415, 'Choose an MP4, WebM, or MKV file.')
        calibration = calibration_specs(headers.get('X-Pitch-Calibration'))
        if not limits['available']:
            raise VideoError(503, 'YOLO is unavailable. Install requirements-video.txt or load the synthetic sample.')
        if not JOBS.acquire(blocking=False):
            raise VideoError(429, 'Analysis is already running. Try again when the current video finishes.')
        try:
            with tempfile.TemporaryDirectory(prefix='pl-video-') as directory:
                path = Path(directory) / ('clip' + suffix)
                with path.open('wb') as dest:
                    remaining = length
                    first = True
                    while remaining:
                        chunk = stream.read(min(remaining, 1024 * 1024))
                        if not chunk:
                            raise VideoError(400, 'The upload ended before the complete video arrived.')
                        if first:
                            valid = chunk[4:8] == b'ftyp' if suffix == '.mp4' else chunk[:4] == b'\x1aE\xdf\xa3'
                            if not valid:
                                raise VideoError(415, 'The file contents do not match the selected video format.')
                            first = False
                        dest.write(chunk)
                        remaining -= len(chunk)
                return 200, run_analysis(path, calibration, limits, headers.get('X-Home-Attacks') != 'left', name)
        finally:
            JOBS.release()
    except VideoError as exc:
        return exc.status, {'error': str(exc)}
    except (ConnectionError, TimeoutError):
        return 400, {'error': 'The upload connection ended before analysis completed.'}
    except Exception:
        LOG.exception('Video analysis failed')
        return 500, {'error': 'Video analysis failed. Check the server log, weights and video codec.'}
