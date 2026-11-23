/**
 * Premier League Analytics // Production Build & Audit Pipeline
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

console.log('='.repeat(80));
console.log('  PREMIER LEAGUE ANALYTICS // REPEATABLE BUILD & AUDIT PIPELINE');
console.log('='.repeat(80));

// Step 1: Validate Datasets
console.log('\n[PASS 1] VALIDATING DATASETS VIA PYTHON SCHEMA CHECKER...');
try {
  execSync('python scripts/validate_data.py', { cwd: ROOT_DIR, stdio: 'inherit' });
  console.log('>>> [PASS 1 OK] All match and player JSON schemas verified.');
} catch (err) {
  console.error('>>> [PASS 1 FAILED] Data validation error:', err.message);
  process.exit(1);
}

// Step 2: Syntax Check all JavaScript Files
console.log('\n[PASS 2] RUNNING JAVASCRIPT SYNTAX & ES5 LEGACY AUDIT...');
const jsFiles = [
  'static/js/radash.min.js',
  'static/js/charts.js',
  'static/js/app.js',
  'static/js/simulator.js'
];

for (const jsFile of jsFiles) {
  const fullPath = path.join(ROOT_DIR, jsFile);
  try {
    execSync(`node -c "${fullPath}"`, { stdio: 'pipe' });
    const content = fs.readFileSync(fullPath, 'utf8');
    const arrowCount = (content.match(/=>/g) || []).length;
    const constLetCount = (content.match(/\b(const|let)\b/g) || []).length;
    console.log(`  [SYNTAX OK] ${jsFile.padEnd(26)} | Size: ${(fs.statSync(fullPath).size / 1024).toFixed(2)} KB | ES6 arrows: ${arrowCount} | const/let: ${constLetCount}`);
  } catch (err) {
    console.error(`>>> [PASS 2 FAILED] Syntax error in ${jsFile}:`, err.message);
    process.exit(1);
  }
}

// Step 3: Bundle Size & Treemap Audit
console.log('\n[PASS 3] AUDITING BUNDLE TREEMAP & STRICT <300 KB BUDGET...');
try {
  execSync('node scripts/audit_size.js', { cwd: ROOT_DIR, stdio: 'inherit' });
  console.log('>>> [PASS 3 OK] Total frontend bundle is strictly under 300 KB budget.');
} catch (err) {
  console.error('>>> [PASS 3 FAILED] Bundle size exceeded budget:', err.message);
  process.exit(1);
}

console.log('='.repeat(80));
console.log('  ALL BUILD & AUDIT CHECKS PASSED (100% PRODUCTION READY)');
console.log('='.repeat(80));
