const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const MAX_BUDGET_BYTES = 300 * 1024; // 300 KB

const assetPaths = [
  'templates/index.html',
  'templates/players.html',
  'templates/simulator.html',
  'static/css/main.css',
  'static/css/simulator.css',
  'static/js/radash.min.js',
  'static/js/charts.js',
  'static/js/app.js',
  'static/js/simulator.js'
];

console.log('='.repeat(80));
console.log('  PREMIER LEAGUE ANALYTICS // ASSET SIZE & TREEMAP AUDIT');
console.log('  Target Budget: < 300.00 KB');
console.log('='.repeat(80));

let totalBytes = 0;
const results = [];

for (const relPath of assetPaths) {
  const fullPath = path.join(ROOT_DIR, relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`[MISSING] File not found: ${relPath}`);
    process.exit(1);
  }
  const stats = fs.statSync(fullPath);
  totalBytes += stats.size;
  results.push({
    path: relPath,
    category: relPath.startsWith('templates/') ? 'HTML Template' : relPath.endsWith('.css') ? 'CSS Stylesheet' : 'JavaScript',
    bytes: stats.size,
    kb: (stats.size / 1024).toFixed(2)
  });
}

// Display Treemap Breakdown by Category
const categories = {};
for (const item of results) {
  categories[item.category] = (categories[item.category] || 0) + item.bytes;
}

console.log('\n[1] ASSET INVENTORY:');
console.log('-'.repeat(80));
console.log(`${'Path'.padEnd(38)} | ${'Category'.padEnd(14)} | ${'Size (Bytes)'.padStart(12)} | ${'Size (KB)'.padStart(10)}`);
console.log('-'.repeat(80));

for (const r of results) {
  console.log(`${r.path.padEnd(38)} | ${r.category.padEnd(14)} | ${r.bytes.toString().padStart(12)} | ${(r.kb + ' KB').padStart(10)}`);
}

console.log('-'.repeat(80));
console.log('\n[2] CATEGORY TREEMAP BREAKDOWN:');
console.log('-'.repeat(80));

for (const [cat, bytes] of Object.entries(categories)) {
  const pct = ((bytes / totalBytes) * 100).toFixed(1);
  const barLen = Math.round((bytes / totalBytes) * 40);
  const bar = '█'.repeat(barLen) + '░'.repeat(40 - barLen);
  console.log(`${cat.padEnd(16)} | ${(bytes / 1024).toFixed(2).padStart(8)} KB (${pct.padStart(5)}%) | [${bar}]`);
}

console.log('-'.repeat(80));
const totalKb = (totalBytes / 1024).toFixed(2);
const headroomKb = ((MAX_BUDGET_BYTES - totalBytes) / 1024).toFixed(2);
const budgetUsagePct = ((totalBytes / MAX_BUDGET_BYTES) * 100).toFixed(1);

console.log(`\nTOTAL PAYLOAD : ${totalBytes} bytes (${totalKb} KB)`);
console.log(`BUDGET LIMIT  : ${MAX_BUDGET_BYTES} bytes (300.00 KB)`);
console.log(`USAGE         : ${budgetUsagePct}%`);
console.log(`HEADROOM      : ${headroomKb} KB under budget`);

if (totalBytes <= MAX_BUDGET_BYTES) {
  console.log('\n>>> AUDIT RESULT: PASSED (Under 300 KB budget)\n');
  process.exit(0);
} else {
  console.error(`\n>>> AUDIT RESULT: FAILED! Exceeded budget by ${Math.abs(headroomKb)} KB\n`);
  process.exit(1);
}
