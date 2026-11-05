import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, alertText, stageTime, MIN, tzChanged, phonePriority } from '../../lib/schedule.js';

const R = 1_000_000_000_000;
const rem = (o = {}) => ({ releaseAt: R, sent: [], ...o });

test('far release: all three stages armed at the right times', () => {
  const p = plan(rem(), R - 60 * MIN);
  assert.deepEqual(p.arm.map(a => [a.lead, a.when]), [[10, R - 10 * MIN], [5, R - 5 * MIN], [0, R]]);
  assert.deepEqual(p.skip, []);
});
test('already sent stages are not armed again', () => {
  const p = plan(rem({ sent: [10] }), R - 7 * MIN);
  assert.deepEqual(p.arm.map(a => a.lead), [5, 0]);
});
test('set 7 min before release: the 10 min alert is due now, 5 and 0 stay armed', () => {
  const now = R - 7 * MIN;
  const p = plan(rem(), now);
  assert.deepEqual(p.arm.map(a => [a.lead, a.when]), [[10, now + 2000], [5, R - 5 * MIN], [0, R]]);
});
test('both pre-alerts passed: only the closest one is sent right away', () => {
  const now = R - 3 * MIN;
  const p = plan(rem(), now);
  assert.deepEqual(p.skip, [10]);
  assert.deepEqual(p.arm.map(a => a.lead), [5, 0]);
  assert.equal(p.arm[0].when, now + 2000);
});
test('after the release time only the release alert remains (missed)', () => {
  const now = R + 4 * MIN;
  const p = plan(rem(), now);
  assert.deepEqual([...p.skip].sort((a, b) => a - b), [5, 10]);
  assert.deepEqual(p.arm.map(a => a.lead), [0]);
});
test('reminder expires 30 minutes after release', () => {
  assert.equal(plan(rem(), R + 31 * MIN).expired, true);
  assert.equal(plan(rem(), R + 29 * MIN).expired, false);
});
test('alert texts: normal, final pre-alert, release, missed', () => {
  const a = alertText(10, R, R - 10 * MIN, 'X');
  assert.match(a.title, /release in 10 min/);
  assert.match(alertText(5, R, R - 5 * MIN, 'X').title, /Only 5 min left/);
  assert.match(alertText(0, R, R, 'X').title, /release time reached/i);
  assert.match(alertText(0, R, R + 5 * MIN, 'X').title, /passed 5 min ago/);
});
test('stage time helper, phone priority and time zone change', () => {
  assert.equal(stageTime(R, 10), R - 600000);
  assert.equal(phonePriority(10), 4); assert.equal(phonePriority(5), 5); assert.equal(phonePriority(0), 5);
  assert.equal(tzChanged({ tz: 'Asia/Calcutta' }, 'Asia/Calcutta'), false);
  assert.equal(tzChanged({ tz: 'Asia/Calcutta' }, 'Europe/London'), true);
  assert.equal(tzChanged({}, 'Europe/London'), false);
});
