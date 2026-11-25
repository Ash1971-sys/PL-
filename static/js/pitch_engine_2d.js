(function (root) {
  'use strict';
  const paint = { home: '#65ffd3', away: '#ffa7bc', unknown: '#d5d1df' };
  const width = 105;
  const height = 68;

  class PitchEngine {
    constructor(canvas, onSelect) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.field = document.createElement('canvas');
      this.field.width = 840;
      this.field.height = 544;
      this.drawField();
      this.visible = [];
      this.layers = { lanes: true };
      this.index = -1;
      this.time = 0;
      canvas.addEventListener('click', event => {
        const rect = canvas.getBoundingClientRect();
        const x = width * (event.clientX - rect.left) / rect.width;
        const y = height * (event.clientY - rect.top) / rect.height;
        let match = null;
        let best = 3.1;
        for (const token of this.visible) {
          const gap = Math.hypot(token.x - x, token.y - y);
          if (gap <= best) {
            match = this.tracks[token.index].id;
            best = gap;
          }
        }
        onSelect(match);
      });
      if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(canvas);
      else window.addEventListener('resize', () => this.resize());
      this.resize();
      this.draw(0);
    }

    resize() {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
      const h = Math.max(1, Math.round(w * height / width));
      if (w === this.canvas.width && h === this.canvas.height) return;
      this.canvas.width = w;
      this.canvas.height = h;
      this.draw(this.time);
    }

    setData(data) {
      this.frames = data.frames;
      this.homeRight = data.meta?.home_attacks_right !== false;
      this.tracks = [];
      const names = new Map();
      const frames = this.frames;
      this.times = new Float32Array(frames.length);
      this.balls = new Float32Array(frames.length * 2).fill(NaN);
      this.offsets = new Uint32Array(frames.length + 1);
      this.points = new Float32Array(frames.reduce((n, frame) => n + frame.players.length * 3, 0));
      frames.forEach((frame, i) => {
        let cursor = this.offsets[i];
        this.times[i] = frame.t;
        if (frame.ball) this.balls.set([frame.ball.x, frame.ball.y], i * 2);
        for (const p of frame.players) {
          if (!names.has(p.id)) {
            names.set(p.id, this.tracks.length);
            this.tracks.push(p);
          }
          this.points[cursor++] = names.get(p.id);
          this.points[cursor++] = p.x;
          this.points[cursor++] = p.y;
        }
        this.offsets[i + 1] = cursor;
      });
      this.lookup = names;
      this.next = new Float32Array(this.tracks.length * 2);
      this.heat = new Uint32Array(21 * 14);
      this.heatKey = undefined;
      this.selected = null;
      this.index = -1;
      this.draw(0);
      return this.tracks;
    }

    drawField() {
      const ctx = this.field.getContext('2d');
      ctx.scale(8, 8);
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i % 2 ? '#226b44' : '#1b5b39';
        ctx.fillRect(i * 10.5, 0, 10.5, 68);
      }
      ctx.strokeStyle = '#d9f8e8';
      ctx.lineWidth = .34;
      ctx.strokeRect(.8, .8, 103.4, 66.4);
      ctx.beginPath();
      ctx.moveTo(52.5, .8);
      ctx.lineTo(52.5, 67.2);
      ctx.moveTo(61.65, 34);
      ctx.arc(52.5, 34, 9.15, 0, Math.PI * 2);
      ctx.stroke();
      for (const side of [0, 1]) {
        const x = side ? 104.2 : .8;
        const direction = side ? -1 : 1;
        ctx.strokeRect(x, 13.84, direction * 16.5, 40.32);
        ctx.strokeRect(x, 24.84, direction * 5.5, 18.32);
        ctx.fillStyle = '#d9f8e8';
        for (const spot of [x + direction * 11, 52.5]) ctx.fillRect(spot - .23, 33.77, .46, .46);
      }
    }

    indexAt(t) {
      let lo = 0;
      let hi = this.times.length;
      while (lo < hi) {
        const centre = (lo + hi) >>> 1;
        if (this.times[centre] <= t + .0001) lo = centre + 1;
        else hi = centre;
      }
      return Math.max(0, lo - 1);
    }

    draw(t) {
      this.time = t;
      const ctx = this.ctx;
      ctx.setTransform(this.canvas.width / width, 0, 0, this.canvas.height / height, 0, 0);
      ctx.drawImage(this.field, 0, 0, width, height);
      if (!this.frames?.length) return;
      const i = this.indexAt(t);
      const next = i + 1;
      const dt = this.times[next] - this.times[i];
      let blend = 0;
      this.next.fill(NaN);
      if (dt > 0 && dt <= .6 && !this.frames[next]?.cut) {
        blend = Math.min(1, Math.max(0, (t - this.times[i]) / dt));
        for (let cursor = this.offsets[next]; cursor < this.offsets[next + 1]; cursor += 3) {
          const key = this.points[cursor] * 2;
          this.next[key] = this.points[cursor + 1];
          this.next[key + 1] = this.points[cursor + 2];
        }
      }
      this.visible.length = 0;
      for (let cursor = this.offsets[i]; cursor < this.offsets[i + 1]; cursor += 3) {
        const index = this.points[cursor];
        const x = this.points[cursor + 1];
        const y = this.points[cursor + 2];
        const nextX = this.next[index * 2];
        const nextY = this.next[index * 2 + 1];
        this.visible.push({ index, x: Number.isFinite(nextX) ? x + (nextX - x) * blend : x,
          y: Number.isFinite(nextY) ? y + (nextY - y) * blend : y });
      }
      if (this.layers.heatmap) this.drawHeatmap();
      if (this.layers.trails) this.drawTrails(i);
      if (this.layers.lines) this.drawDefence();
      if (this.layers.lanes) this.drawLanes(this.frames[i].control);
      for (const token of this.visible) this.drawToken(token);
      const ballX = this.balls[i * 2], ballY = this.balls[i * 2 + 1];
      const destX = this.balls[next * 2], destY = this.balls[next * 2 + 1];
      if (Number.isFinite(ballX)) {
        this.circle(Number.isFinite(destX) ? ballX + (destX - ballX) * blend : ballX,
          Number.isFinite(destY) ? ballY + (destY - ballY) * blend : ballY, .9, 'white', '#27142c');
      }
      this.index = i;
    }

    circle(x, y, radius, colour, rim) {
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = colour;
      ctx.strokeStyle = rim;
      ctx.lineWidth = .33;
      ctx.fill();
      ctx.stroke();
    }

    drawToken(token) {
      const track = this.tracks[token.index];
      const active = track.id === this.selected;
      this.circle(token.x, token.y, active ? 2.65 : 2.15, paint[track.team] || paint.unknown, active ? '#fff' : '#25102a');
      const ctx = this.ctx;
      ctx.fillStyle = '#1b0d21';
      ctx.font = 'bold 2.35px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = track.role === 'goalkeeper' ? 'GK' : track.role === 'referee' ? 'R' : String(track.shirt ?? track.id % 1000);
      ctx.fillText(label, token.x, token.y, 4.1);
    }

    line(a, b, color, dashed = false) {
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.setLineDash(dashed ? [1.15, .72] : []);
      ctx.lineWidth = .4;
      ctx.strokeStyle = color;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    drawLanes(control) {
      const holder = control && this.visible.find(token => this.tracks[token.index].id === control.id);
      if (!holder) return;
      const nearby = this.visible.filter(token => token !== holder && this.tracks[token.index].team === control.team)
        .map(token => [token, Math.hypot(holder.x - token.x, holder.y - token.y)])
        .filter(pair => pair[1] <= 33).sort((a, b) => a[1] - b[1]).slice(0, 4);
      for (const [target, span] of nearby) {
        if (span < 2) continue;
        const dx = target.x - holder.x, dy = target.y - holder.y;
        const blocked = this.visible.some(token => {
          if (this.tracks[token.index].team === control.team || this.tracks[token.index].team === 'unknown') return false;
          const x = token.x - holder.x, y = token.y - holder.y;
          const p = (x * dx + y * dy) / (span * span);
          return p > .08 && p < .96 && Math.abs(x * dy - y * dx) / span < 1.8;
        });
        this.line(holder, target, blocked ? '#f7bf76' : '#9cf6ff', blocked);
      }
    }

    drawDefence() {
      for (const team of ['home', 'away']) {
        const direction = (team === 'home') === this.homeRight ? 1 : -1;
        const back = this.visible.filter(token => {
          const p = this.tracks[token.index];
          return p.team === team && p.role === 'player';
        }).sort((a, b) => (a.x - b.x) * direction).slice(0, 3);
        if (back.length < 3) continue;
        const x = back[1].x;
        this.line({ x, y: 1.2 }, { x, y: 66.8 }, paint[team], true);
      }
    }

    drawTrails(i) {
      const from = this.indexAt(this.frames[i].t - 3.5);
      const previous = new Map();
      const selected = this.lookup.get(this.selected);
      for (let fi = from; fi <= i; fi++) {
        if (this.frames[fi].cut) previous.clear();
        const sprints = new Set(this.frames[fi].motion?.filter(item => item[2] >= 7).map(item => this.lookup.get(item[0])));
        for (let cursor = this.offsets[fi]; cursor < this.offsets[fi + 1]; cursor += 3) {
          const key = this.points[cursor];
          if (selected !== undefined && key !== selected) continue;
          const point = { x: this.points[cursor + 1], y: this.points[cursor + 2] };
          const last = previous.get(key);
          if (last?.fi === fi - 1 && sprints.has(key)) this.line(last.point, point, paint[this.tracks[key].team] || '#ddd');
          previous.set(key, { point, fi });
        }
      }
    }

    drawHeatmap() {
      if (this.heatKey !== this.selected) {
        this.heatKey = this.selected;
        const selected = this.lookup.get(this.selected);
        this.heat.fill(0);
        for (let i = 0; i < this.points.length; i += 3) {
          if (selected !== undefined && this.points[i] !== selected) continue;
          const x = Math.min(20, Math.floor(this.points[i + 1] / 5));
          const y = Math.min(13, Math.floor(this.points[i + 2] / 5));
          if (x >= 0 && y >= 0) this.heat[y * 21 + x]++;
        }
        this.heatMax = Math.max(1, ...this.heat);
      }
      this.heat.forEach((count, i) => {
        if (!count) return;
        this.ctx.fillStyle = 'rgba(255, 180, 48,' + (.48 * count / this.heatMax) + ')';
        this.ctx.fillRect((i % 21) * 5, Math.floor(i / 21) * 5, 5, 5);
      });
    }
  }

  root.PLTacticalPitch = PitchEngine;
})(window);
