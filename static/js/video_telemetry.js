(function () {
  'use strict';
  const get = id => document.getElementById('analysis-' + id);
  const video = get('video');
  const seek = get('seek');
  const calibration = get('calibration');
  const pitch = new window.PLTacticalPitch(get('pitch'), selectPlayer);
  const { MatchReport, timeLabel, eventLabel, exportReport, teamName } = window.PLMatchReport;
  const fullFrame = [[0, 0], [1, 0], [1, 1], [0, 1]];
  let chosen = null, objectUrl = null, data = null, report = null, selected = null;
  let limits = null, generation = 0, busy = false, points = [], draft = null;
  let time = 0, reportTime = -1, nativeTick = null, fallbackTick = null;
  let activeMetric = null, activeClip = null;

  function notice(message) { get('status').textContent = message; }
  function duration() {
    return Number.isFinite(video.duration) ? video.duration : report?.totalTime || 0;
  }
  function nativeVideo() { return video.readyState >= 1 && !video.error; }

  function updateButtons() {
    get('run').disabled = !chosen || busy || !points.length || limits?.available === false;
    get('mark').disabled = !chosen || busy || !nativeVideo();
    get('overhead').disabled = !chosen || busy;
    get('reset').disabled = !chosen || busy || (!points.length && !draft);
    get('sample').disabled = busy;
    get('play').disabled = !(nativeVideo() || report);
    get('play').textContent = video.paused && fallbackTick === null ? 'Play' : 'Pause';
    seek.disabled = !duration();
    seek.max = duration() || 1;
    get('landmarks').textContent = draft ? 'Mark ' + ['far left', 'far right', 'near right', 'near left'][draft.length] +
      ' (' + draft.length + '/4)' : points.length ? points.length + ' calibrated shot(s)' : 'No calibration set.';
  }

  function mountVideo(source, file) {
    stopPlayback();
    video.pause();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = file ? source : null;
    video.src = source;
    video.load();
    time = 0;
    points = [];
    endMarking();
    clearData();
    sync(0, true);
  }

  function clearData() {
    data = report = activeMetric = activeClip = null;
    selectPlayer(null);
    pitch.setData({ frames: [], events: [] });
    get('source').textContent = 'Waiting for analysis';
    get('coverage').textContent = 'Load telemetry to see estimates.';
    get('pins').replaceChildren();
    get('metrics').replaceChildren();
    const dropdown = get('player');
    dropdown.replaceChildren(new Option('All players', ''));
    for (const key of ['json', 'csv', 'next']) get(key).disabled = true;
    get('event').textContent = '';
  }

  function setData(payload) {
    if (!Array.isArray(payload.frames) || !payload.frames.length || !Array.isArray(payload.events)) {
      throw new Error('The server did not return usable telemetry.');
    }
    data = payload;
    const tracks = pitch.setData(payload);
    report = new MatchReport(payload, tracks);
    get('player').replaceChildren(new Option('All players', ''), ...tracks.map(track =>
      new Option(teamName(track.team) + ' · ' + track.role + ' #' + (track.shirt ?? track.id), track.id)));
    const meta = payload.meta || {};
    get('source').textContent = meta.source === 'synthetic' ? 'Synthetic sample' :
      [meta.model || 'YOLO', meta.tracker || 'ByteTrack', meta.precision].filter(Boolean).join(' · ');
    get('json').disabled = get('csv').disabled = false;
    get('next').disabled = !payload.events.length;
    renderPins();
    sync(time, true);
    updateButtons();
  }

  function selectPlayer(id) {
    selected = id;
    pitch.selected = id;
    get('player').value = id == null ? '' : id;
    const track = pitch.tracks?.find(item => item.id === id);
    get('inspect').textContent = track ? teamName(track.team) + ' · ' + track.role +
      ' #' + (track.shirt ?? track.id) : 'Select a checker to inspect a track.';
    if (track) get('scope').value = 'player';
    else get('scope').value = 'team';
    resetClips();
    pitch.draw(time);
  }

  function selection() {
    return { scope: get('scope').value, range: get('range').value, team: get('team').value, id: selected };
  }

  function resetClips() {
    activeMetric = activeClip = null;
    get('event').textContent = '';
    get('next').disabled = !report?.events.length;
    renderReport();
  }

  function renderReport() {
    if (!report) return;
    const picked = selection();
    get('team').disabled = picked.scope === 'player';
    const summary = report.report(picked, time);
    get('coverage').textContent = summary.title + ' · ' + timeLabel(summary.until) + ' analyzed · ' +
      summary.tracked.toFixed(1) + ' s with tracked control. ' +
      (summary.tracking ? '' : 'No reliable ball detections.');
    const rows = summary.rows.map(row => {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      if (row.types.length && row.number != null && row.number > 0) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.metric = row.id;
        button.textContent = row.label;
        th.append(button);
      } else th.textContent = row.label;
      const td = document.createElement('td');
      td.textContent = row.display;
      tr.append(th, td);
      return tr;
    });
    const active = document.activeElement?.dataset.metric;
    get('metrics').replaceChildren(...rows);
    if (active) get('metrics').querySelector('[data-metric="' + active + '"]')?.focus();
  }

  function renderPins() {
    const total = duration() || report?.totalTime;
    if (!report || !total) return;
    const buckets = new Map();
    for (const e of report.events) {
      const bin = Math.floor(e.t / total * 35);
      if (!buckets.has(bin) || ['shot', 'save', 'goal_candidate'].includes(e.type)) buckets.set(bin, e);
    }
    get('pins').replaceChildren(...Array.from(buckets.values(), e => {
      const pin = document.createElement('button');
      pin.className = 'studio-pin';
      pin.type = 'button';
      pin.textContent = e.type === 'pass' ? 'P' : e.type === 'shot' ? 'S' : '•';
      pin.title = eventLabel(e);
      pin.setAttribute('aria-label', pin.title);
      pin.style.left = Math.max(2, Math.min(98, e.t / total * 100)) + '%';
      pin.onclick = () => { activeMetric = null; jump(e); };
      return pin;
    }));
  }

  function jump(marker) {
    if (!marker) return;
    activeClip = marker;
    get('event').textContent = eventLabel(marker);
    moveTo(marker.t);
  }

  function nextClip() {
    if (!report) return;
    const current = selection();
    const clips = activeMetric ? report.clips(activeMetric, current, clipLimit) :
      report.events.filter(e => report.accepts(e, current) && (e.observed_at ?? e.t) <= report.limit(current, time));
    if (!clips.length) {
      get('event').textContent = 'No matching clips in this view.';
      return;
    }
    const next = clips.find(e => e.t > (activeClip?.t ?? time) + .001) || clips[0];
    jump(next);
  }

  let clipLimit = 0;
  get('metrics').addEventListener('click', event => {
    const key = event.target.dataset.metric;
    if (!key || !report) return;
    activeMetric = key;
    activeClip = null;
    clipLimit = time;
    get('next').disabled = false;
    nextClip();
  });
  get('next').onclick = nextClip;
  for (const kind of ['json', 'csv']) get(kind).onclick = () => {
    if (report) exportReport(kind, report.report(selection(), time), report.meta, selection());
  };

  function sync(value, force = false) {
    time = Math.max(0, value || 0);
    if (Math.abs(Number(seek.value) - time) > .045 || force) seek.value = time;
    const clock = timeLabel(time) + ' / ' + timeLabel(duration());
    if (get('clock').textContent !== clock) get('clock').textContent = clock;
    pitch.draw(time);
    if (force || (get('range').value === 'current' && Math.abs(time - reportTime) >= .65)) {
      reportTime = time;
      renderReport();
    }
  }

  function moveTo(value) {
    const target = Math.max(0, Math.min(duration(), value));
    if (nativeVideo()) video.currentTime = target;
    sync(target, true);
  }

  function stopPlayback() {
    if (nativeTick !== null) video.cancelVideoFrameCallback?.(nativeTick);
    if (fallbackTick !== null) cancelAnimationFrame(fallbackTick);
    nativeTick = fallbackTick = null;
  }

  function followVideo() {
    if (!video.requestVideoFrameCallback || nativeTick !== null) return;
    function frame(_, metadata) {
      nativeTick = null;
      sync(metadata.mediaTime);
      if (!video.paused && !video.ended) nativeTick = video.requestVideoFrameCallback(frame);
    }
    nativeTick = video.requestVideoFrameCallback(frame);
  }

  function startFallback() {
    let before = performance.now();
    function frame(now) {
      const target = Math.min(duration(), time + (now - before) / 1000 * Number(get('speed').value));
      before = now;
      sync(target);
      fallbackTick = target < duration() ? requestAnimationFrame(frame) : null;
      if (fallbackTick === null) updateButtons();
    }
    if (time >= duration()) sync(0, true);
    fallbackTick = requestAnimationFrame(frame);
    updateButtons();
  }

  get('play').onclick = () => {
    if (fallbackTick !== null) {
      stopPlayback();
      updateButtons();
    } else if (nativeVideo()) {
      if (video.paused) video.play().catch(() => { if (report) startFallback(); });
      else video.pause();
    } else if (report) startFallback();
  };
  video.addEventListener('play', () => { endMarking(); followVideo(); updateButtons(); });
  video.addEventListener('pause', () => { stopPlayback(); sync(video.currentTime, true); updateButtons(); });
  video.addEventListener('ended', updateButtons);
  video.addEventListener('seeked', () => sync(video.currentTime, true));
  video.addEventListener('timeupdate', () => {
    if (!video.requestVideoFrameCallback || video.paused) sync(video.currentTime);
  });
  video.addEventListener('loadedmetadata', () => {
    if (fallbackTick !== null) {
      stopPlayback();
      video.currentTime = time;
    }
    video.playbackRate = Number(get('speed').value);
    sync(video.currentTime, true);
    updateButtons();
    renderPins();
    if (chosen && !busy) get('setup').open = true;
  });
  video.addEventListener('error', () => {
    if (!chosen && !report) return;
    notice('This browser cannot play the video codec. Available telemetry can still play on the tactical pitch.');
    updateButtons();
  });
  seek.addEventListener('input', () => moveTo(Number(seek.value)));
  get('speed').onchange = event => { video.playbackRate = Number(event.target.value); };
  get('player').onchange = event => selectPlayer(event.target.value === '' ? null : Number(event.target.value));
  for (const key of ['scope', 'range', 'team']) get(key).onchange = resetClips;
  document.querySelectorAll('[data-layer]').forEach(input => {
    input.onchange = () => { pitch.layers[input.dataset.layer] = input.checked; pitch.draw(time); };
  });

  function endMarking() {
    draft = null;
    calibration.hidden = true;
    get('mark').textContent = 'Mark corners';
  }

  function calibrationAt(corners) {
    const t = points.length ? Math.round(video.currentTime * 100) / 100 : 0;
    points = points.filter(entry => entry.t !== t).concat({ t, points: corners }).sort((a, b) => a.t - b.t);
    endMarking();
    updateButtons();
  }

  get('mark').onclick = () => {
    if (draft) endMarking();
    else {
      video.pause();
      draft = [];
      calibration.width = Math.max(1, video.clientWidth * 2);
      calibration.height = Math.max(1, video.clientHeight * 2);
      calibration.hidden = false;
      get('mark').textContent = 'Cancel marking';
    }
    updateButtons();
  };
  calibration.addEventListener('click', event => {
    if (!draft) return;
    const rect = calibration.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
    draft.push([Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))]);
    if (draft.length === 4) return calibrationAt(draft);
    const ctx = calibration.getContext('2d');
    ctx.fillStyle = '#00ff92';
    ctx.beginPath();
    ctx.arc(x * calibration.width, y * calibration.height, 7, 0, 2 * Math.PI);
    ctx.fill();
    updateButtons();
  });
  get('overhead').onclick = () => calibrationAt(fullFrame);
  get('reset').onclick = () => { points = []; endMarking(); updateButtons(); };

  function choose(file) {
    if (!file || busy) return;
    if (!/\.(mp4|webm|mkv)$/i.test(file.name)) return notice('Choose an MP4, WebM, or MKV file.');
    if (limits && file.size > limits.max_bytes) return notice('This file exceeds the server’s video size limit.');
    generation++;
    chosen = file;
    mountVideo(URL.createObjectURL(file), file);
    get('setup').open = true;
    notice(limits?.available === false ? 'YOLO is unavailable on this server. The sample is ready to use.' :
      'Loaded ' + file.name + '. Calibrate the pitch, then analyze the clip.');
    updateButtons();
  }

  const drop = document.getElementById('video-drop');
  drop.ondragover = event => { event.preventDefault(); drop.classList.add('is-dragging'); };
  drop.ondragleave = () => drop.classList.remove('is-dragging');
  drop.ondrop = event => {
    event.preventDefault();
    drop.classList.remove('is-dragging');
    choose(event.dataTransfer.files[0]);
  };
  get('upload').onchange = event => { choose(event.target.files[0]); event.target.value = ''; };

  get('sample').onclick = async () => {
    if (busy) return;
    const active = ++generation;
    chosen = null;
    mountVideo('');
    notice('Loading synthetic sample…');
    updateButtons();
    try {
      const [response, clip] = await Promise.all([
        fetch('/static/data/tactical-sample.json'),
        fetch('/static/data/tactical-sample.webm').then(r => r.ok ? r.blob() : null).catch(() => null)
      ]);
      if (!response.ok) throw new Error('Sample telemetry is unavailable.');
      const sample = await response.json();
      if (active !== generation) return;
      if (clip) mountVideo(URL.createObjectURL(clip), true);
      setData(sample);
      notice(clip ? 'Synthetic training clip. Use Play, the scrubber, or an event pin.' :
        'Synthetic training telemetry. Use Play to replay it on the pitch.');
    } catch (error) {
      if (active === generation) notice(error.message);
    }
  };

  get('run').onclick = async () => {
    if (!chosen || !points.length || busy) return;
    if (limits && duration() > limits.max_seconds + .25) return notice('Trim the clip to ' + limits.max_seconds + ' seconds.');
    const active = generation;
    endMarking();
    busy = true;
    video.pause();
    notice('Uploading and tracking locally. CPU analysis can take several minutes.');
    updateButtons();
    try {
      const response = await fetch('/api/analyze-video', { method: 'POST', body: chosen,
        headers: { 'Content-Type': 'application/octet-stream', 'X-Video-Name': encodeURIComponent(chosen.name),
          'X-Pitch-Calibration': JSON.stringify(points), 'X-Home-Attacks': get('direction').value } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Analysis could not finish.');
      if (active !== generation) return;
      setData(payload);
      moveTo(0);
      const meta = payload.meta || {};
      notice(!meta.ball_frames ? 'Tracking complete. No ball detections were available for event estimates.' :
        !meta.team_tags ? 'Tracking complete. The two shirt colors could not be assigned reliably.' :
        'Tracking complete. Select an event or play the clip to inspect the result.');
    } catch (error) {
      if (active === generation) notice(error.message + ' You can still load the synthetic sample.');
    } finally {
      busy = false;
      updateButtons();
    }
  };

  fetch('/api/analyze-video').then(response => response.ok ? response.json() : { available: false })
    .then(result => { limits = result; updateButtons(); }).catch(() => { limits = { available: false }; updateButtons(); });
  updateButtons();
})();
