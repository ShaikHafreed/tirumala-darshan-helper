import test from 'node:test'; import assert from 'node:assert/strict';
import { buildIcs } from '../../lib/ics.js';
test('ics has event, UTC start and three alarms', () => {
  const s = buildIcs(Date.UTC(2026, 10, 20, 4, 30), Date.UTC(2026, 10, 5));
  assert.match(s, /DTSTART:20261120T043000Z/); assert.equal((s.match(/BEGIN:VALARM/g) || []).length, 3);
  assert.match(s, /TRIGGER:-PT10M/); assert.match(s, /TRIGGER:-PT5M/); assert.match(s, /TRIGGER:PT0S/); assert.ok(s.endsWith('\r\n'));
});
