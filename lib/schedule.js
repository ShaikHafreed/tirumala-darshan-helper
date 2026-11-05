// Pure reminder-scheduling logic (no browser APIs), shared by the service worker and the tests.
export const MIN = 60000;
export const LEADS = [10, 5, 0];          // minutes before release when alerts are sent (0 = release time)
export const GRACE_MIN = 30;              // a reminder is dropped this long after release
export const stageTime = (releaseAt, lead) => releaseAt - lead * MIN;

// Decide what to do with the stages that are not sent yet.
// - stages whose time already passed: keep only the closest one and send it right away
// - after the release time: only the release-time stage is kept (shown as "missed")
export function plan(reminder, now, leads = LEADS) {
  if (now > reminder.releaseAt + GRACE_MIN * MIN) return { expired: true, skip: [], arm: [] };
  const sent = reminder.sent || [];
  let todo = leads.filter(l => !sent.includes(l));
  const due = todo.filter(l => stageTime(reminder.releaseAt, l) <= now);
  let skip = [];
  if (due.length > 1) {
    const keep = Math.min(...due);
    skip = due.filter(l => l !== keep);
    todo = todo.filter(l => !skip.includes(l));
  }
  const arm = todo.map(l => ({ lead: l, when: Math.max(stageTime(reminder.releaseAt, l), now + 2000) }));
  return { expired: false, skip, arm };
}

// Text of an alert. Works for normal, release-time and "missed" alerts.
export function alertText(lead, releaseAt, now, releaseLabel) {
  const late = now - releaseAt;
  if (late > MIN) {
    const m = Math.round(late / MIN);
    return { title: `Release time passed ${m} min ago`,
             message: `Release was ${releaseLabel}. If the booking window is still open, open the TTD site now.` };
  }
  if (lead === 0) {
    return { title: 'TTD release time reached',
             message: 'Open the official TTD portal now and continue with your booking.' };
  }
  const mins = Math.max(0, Math.round((releaseAt - now) / MIN));
  if (lead === Math.min(...LEADS.filter(l => l > 0))) {
    return { title: `Only ${mins} min left. TTD tickets release soon`,
             message: `Release: ${releaseLabel}. Be logged in and on the booking page now.` };
  }
  return { title: `TTD tickets release in ${mins} min`,
           message: `Release: ${releaseLabel}. Open the TTD site, log in with your OTP and get ready.` };
}

export const phonePriority = lead => (lead <= 5 ? 5 : 4);

// Has the user's time zone changed since the reminder was set?
export function tzChanged(reminder, currentTz) {
  return !!reminder && !!reminder.tz && !!currentTz && reminder.tz !== currentTz;
}
