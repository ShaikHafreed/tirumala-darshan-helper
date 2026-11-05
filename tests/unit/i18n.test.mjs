import test from 'node:test';
import assert from 'node:assert/strict';
import { STR, LANGS, tr } from '../../lib/i18n.js';

test('every language only uses keys that exist in English', () => {
  for (const [code] of LANGS) for (const k of Object.keys(STR[code])) assert.ok(k in STR.en, `${code}: unknown key ${k}`);
});
test('translated languages cover the main screen texts', () => {
  const must = ['nav_home', 'nav_pilgrims', 'nav_alerts', 'nav_settings', 'disc_body', 'btn_login', 'btn_create', 'cl_title', 'btn_preview', 'p_add', 'r_set', 'ph_title', 'hc_run', 's_delete'];
  for (const code of ['te', 'hi', 'ta']) for (const k of must) assert.ok(STR[code][k] && STR[code][k] !== STR.en[k], `${code} missing ${k}`);
});
test('fallback to English and variable replacement', () => {
  assert.equal(tr('te', 'tagline_in'), STR.en.tagline_in);
  assert.equal(tr('en', 'nope'), 'nope');
  assert.equal(tr('en', 'x', { n: 3 }), 'x');
});
