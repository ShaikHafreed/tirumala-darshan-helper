// Syntax-check every JS file and validate manifest references.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = new URL('..', import.meta.url).pathname;
let bad = 0;
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return /node_modules|\.git|dist/.test(p) ? [] : statSync(p).isDirectory() ? walk(p) : [p]; });
for (const f of walk(root)) {
  if (!['.js', '.mjs', '.cjs'].includes(extname(f)) || f.includes('qrcode.js')) continue;
  const esm = f.endsWith('.mjs') || /popup\.js|background\.js|lib[\\/]/.test(f);
  const r = esm ? spawnSync('node', ['--input-type=module', '--check'], { input: readFileSync(f) }) : spawnSync('node', ['--check', f]);
  if (r.status !== 0) { bad++; console.error('SYNTAX', f, String(r.stderr)); }
}
const m = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const refs = [m.action?.default_popup, m.background?.service_worker, ...Object.values(m.icons || {})].filter(Boolean);
for (const r of refs) if (!existsSync(join(root, r))) { bad++; console.error('MISSING', r); }
console.log(bad ? `${bad} problem(s)` : 'lint ok'); process.exit(bad ? 1 : 0);
