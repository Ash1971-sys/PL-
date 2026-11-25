/** Validate the bundled data and build the site's local CSS. */
const { execFileSync } = require('node:child_process');
const { mkdirSync, readdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { minify_sync } = require('terser');

const root = path.resolve(__dirname, '..');
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' });

run('python', ['scripts/validate_data.py']);
mkdirSync(path.join(root, 'static/dist'), { recursive: true });
for (const asset of readdirSync(path.join(root, 'static/js'))) {
  if (!asset.endsWith('.js') || asset.endsWith('.min.js')) continue;
  const input = path.join(root, 'static/js', asset);
  run(process.execPath, ['--check', input]);
  const output = minify_sync(readFileSync(input, 'utf8'), { ecma: 2020 });
  writeFileSync(path.join(root, 'static/dist', asset), output.code + '\n');
}
run(process.execPath, [require.resolve('tailwindcss/lib/cli.js'), '-i', 'scripts/tailwind.css',
  '-o', 'static/css/site.css', '--minify']);
run(process.execPath, ['scripts/audit_size.js']);
