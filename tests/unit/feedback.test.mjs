import test from 'node:test'; import assert from 'node:assert/strict';
import { feedbackText, feedbackUrl } from '../../lib/feedback.js';
test('feedback text and url', () => {
  const f = { rating: 4, kind: 'idea', message: 'Add Seva forms\nplease', version: '1.0.0' };
  const t = feedbackText(f); assert.match(t, /\(4\/5\)/); assert.match(t, /Type: Idea/); assert.match(t, /Version: 1.0.0/);
  const u = feedbackUrl(f); assert.ok(u.startsWith('https://github.com/')); assert.ok(u.includes('labels=feedback')); assert.ok(!u.includes('\n'));
  assert.match(feedbackText({ rating: 9, kind: 'x', message: 'a'.repeat(5000) }), /\(5\/5\)/);
  assert.ok(feedbackText({ message: 'a'.repeat(5000) }).length < 1700);
});
