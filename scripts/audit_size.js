/** Audit the assets included by the public pages. */
const { readFileSync, existsSync, statSync } = require('node:fs');
const path = require('node:path');
const { gzipSync } = require('node:zlib');

const root = path.resolve(__dirname, '..');
const shell = ['static/css/site.css', 'static/premier-league-brand.svg'];
const reports = ['templates/analysis.html', ...shell];
const portal = [...shell, 'static/js/radash.min.js', 'static/js/charts.js', 'static/js/app.js'];
const routes = {
  '/': ['templates/index.html', ...portal, 'static/js/chat.js'],
  '/players': ['templates/players.html', ...portal],
  '/simulator': ['templates/simulator.html', ...shell, 'static/css/simulator.css', 'static/js/tactical-ai.js', 'static/js/simulator.js'],
  '/coach-board': ['templates/coach-board.html', ...shell, 'static/css/coach-board.css', 'static/js/coach-board.js'],
  '/video-analysis': ['templates/video_analysis.html', ...shell, 'static/css/tactical_studio.css', 'static/js/radash.min.js',
    'static/js/pitch_engine_2d.js', 'static/js/match_analytics.js', 'static/js/video_telemetry.js'],
  '/live, /predictions': [...reports, 'static/js/league-hub.js'],
  '/standings, /trends, /clubs, /methodology': reports
};

const assets = new Map();
for (const file of new Set(Object.values(routes).flat())) {
  const source = path.join(root, file);
  const compiled = path.join(root, 'static/dist', path.basename(file));
  const current = file.startsWith('static/js/') && !file.endsWith('.min.js') && existsSync(compiled) &&
    statSync(compiled).mtimeMs >= statSync(source).mtimeMs;
  const bytes = readFileSync(current ? compiled : source);
  assets.set(file, { raw: bytes.length, gzip: gzipSync(bytes, { level: 6 }).length });
}

const kb = bytes => (bytes / 1024).toFixed(2) + ' KiB';
for (const [route, files] of Object.entries(routes)) {
  const sizes = files.map(file => assets.get(file));
  const raw = sizes.reduce((total, size) => total + size.raw, 0);
  const gzip = sizes.reduce((total, size) => total + size.gzip, 0);
  console.log(route.padEnd(45) + kb(raw) + ' raw / ' + kb(gzip) + ' gzip');
}
const rawTotal = [...assets.values()].reduce((total, size) => total + size.raw, 0);
console.log('Unique frontend assets: ' + kb(rawTotal) + ' / 300 KiB (data responses audited separately)');
if (rawTotal > 300 * 1024) process.exitCode = 1;
