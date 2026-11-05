// Service worker: release reminders (PC alerts + phone alerts queued on ntfy) and auto-lock.
import { LEADS, MIN, plan, stageTime, alertText, phonePriority } from './lib/schedule.js';

const PREFIX = 'ttd-r-';
const NOTE_PREFIX = 'ttd-note-';
const SITE = 'https://ttdevasthanams.ap.gov.in/';
const NTFY = 'https://ntfy.sh/';
const MAX_AHEAD = 71 * 3600 * 1000;        // ntfy keeps a delayed message for at most 3 days
const fmt = ms => new Date(ms).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const asciiHeader = s => String(s).replace(/[^\x20-\x7E]/g, ' ');   // HTTP headers must be plain ASCII

async function log(msg) {
  const { alarmLog = [] } = await chrome.storage.local.get(['alarmLog']);
  alarmLog.push(new Date().toLocaleTimeString('en-IN') + ' ' + msg);
  await chrome.storage.local.set({ alarmLog: alarmLog.slice(-12) });
}

// ---------- one alarm per alert stage ----------
async function schedule() {
  await chrome.alarms.clear('ttd-reminder');                       // very old single-alarm version
  const { reminder } = await chrome.storage.local.get(['reminder']);
  const existing = (await chrome.alarms.getAll()).filter(a => a.name.startsWith(PREFIX));
  if (!reminder) {
    for (const a of existing) await chrome.alarms.clear(a.name);
    await chrome.alarms.clear('ttd-check');
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  const now = Date.now();
  const p = plan(reminder, now);
  if (p.expired) {
    for (const a of existing) await chrome.alarms.clear(a.name);
    await chrome.alarms.clear('ttd-check');
    await chrome.storage.local.remove('reminder');
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  if (p.skip.length) {
    await chrome.storage.local.set({ reminder: { ...reminder, sent: [...(reminder.sent || []), ...p.skip] } });
  }
  for (const l of LEADS) {
    const name = PREFIX + l, a = existing.find(x => x.name === name), want = p.arm.find(x => x.lead === l);
    if (!want) { if (a) await chrome.alarms.clear(name); continue; }
    if (!a || Math.abs(a.scheduledTime - want.when) > 1500) { await chrome.alarms.clear(name); chrome.alarms.create(name, { when: want.when }); }
  }
  if (!(await chrome.alarms.get('ttd-check'))) chrome.alarms.create('ttd-check', { periodInMinutes: 60 });
  queuePhone();
  if (p.arm.length) { chrome.action.setBadgeBackgroundColor({ color: '#5B2C6F' }); chrome.action.setBadgeText({ text: 'ON' }); }
}

chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
schedule();

// ---------- phone alerts: queued on the ntfy server so they arrive even if this PC is off ----------
const hasNtfyAccess = () => chrome.permissions.contains({ origins: [NTFY + '*'] }).catch(() => false);

async function pushNow(title, message, priority) {
  const { ntfy } = await chrome.storage.local.get(['ntfy']);
  if (!ntfy || !ntfy.enabled || !ntfy.topic || !(await hasNtfyAccess())) return;
  try {
    const r = await fetch(NTFY + encodeURIComponent(ntfy.topic), {
      method: 'POST', headers: { Title: asciiHeader(title), Priority: String(priority), Tags: 'bell', Click: SITE }, body: message });
    await log(r.ok ? 'Phone alert sent' : 'Phone alert failed: HTTP ' + r.status);
  } catch (e) { await log('Phone alert failed: ' + e.message); }
}

let qLock = Promise.resolve();
function queuePhone() { qLock = qLock.then(doQueue).catch(() => {}); return qLock; }
async function doQueue() {
  const { ntfy, reminder } = await chrome.storage.local.get(['ntfy', 'reminder']);
  if (!ntfy || !ntfy.enabled || !ntfy.topic || !reminder || !(await hasNtfyAccess())) return;
  const queued = { ...(reminder.queued || {}) };
  let changed = false;
  for (const lead of LEADS) {
    if (queued[lead] || (reminder.sent || []).includes(lead)) continue;
    const at = stageTime(reminder.releaseAt, lead), ahead = at - Date.now();
    if (ahead < 15000 || ahead > MAX_AHEAD) continue;
    const { title, message } = alertText(lead, reminder.releaseAt, at, fmt(reminder.releaseAt));
    try {
      const r = await fetch(NTFY + encodeURIComponent(ntfy.topic), {
        method: 'POST',
        headers: { Title: asciiHeader(title), Priority: String(phonePriority(lead)), Tags: 'bell', Click: SITE, Delay: String(Math.floor(at / 1000)) },
        body: message });
      if (r.ok) { queued[lead] = (await r.json()).id; changed = true; await log(`Phone alert (${lead === 0 ? 'release time' : lead + ' min'}) queued on server`); }
      else await log('Could not queue phone alert: HTTP ' + r.status);
    } catch (e) { await log('Could not queue phone alert: ' + e.message); }
  }
  if (changed) {
    const cur = (await chrome.storage.local.get(['reminder'])).reminder;
    if (cur && cur.releaseAt === reminder.releaseAt) await chrome.storage.local.set({ reminder: { ...cur, queued } });
    else await deleteIds(ntfy.topic, Object.values(queued));     // the reminder changed while we were queueing
  }
}
async function deleteIds(topic, ids) {
  for (const id of ids) { try { await fetch(NTFY + encodeURIComponent(topic) + '/' + id, { method: 'DELETE' }); } catch (e) {} }
}
async function cancelQueued() {
  await qLock;
  const { ntfy, reminder } = await chrome.storage.local.get(['ntfy', 'reminder']);
  if (!reminder || !reminder.queued) return;
  if (ntfy && ntfy.topic) await deleteIds(ntfy.topic, Object.values(reminder.queued));
  await chrome.storage.local.set({ reminder: { ...reminder, queued: {} } });
}

// ---------- an alert stage fires ----------
async function fire(lead) {
  const { reminder } = await chrome.storage.local.get(['reminder']);
  if (!reminder || (reminder.sent || []).includes(lead)) return;
  await chrome.storage.local.set({ reminder: { ...reminder, sent: [...(reminder.sent || []), lead] } });
  const now = Date.now();
  const { title, message } = alertText(lead, reminder.releaseAt, now, fmt(reminder.releaseAt));
  await log(`Alert fired: ${title}`);
  const mins = Math.round((reminder.releaseAt - now) / MIN);
  chrome.action.setBadgeText({ text: mins > 0 ? mins + 'm' : 'NOW' });
  chrome.action.setBadgeBackgroundColor({ color: '#C0392B' });
  chrome.notifications.create(NOTE_PREFIX + lead, {
    type: 'basic', iconUrl: 'icon128.png', title, message, priority: 2, requireInteraction: true,
    buttons: [{ title: 'Open TTD site' }]
  }, () => { if (chrome.runtime.lastError) log('Notification error: ' + chrome.runtime.lastError.message); });
  if (!(reminder.queued && reminder.queued[lead])) pushNow(title, message, phonePriority(lead));   // otherwise the server sends it
  try { await chrome.windows.create({ url: 'reminder.html', type: 'popup', width: 440, height: 340, focused: true }); }
  catch (e) { await log('Window error: ' + e.message); }
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name.startsWith(PREFIX)) fire(parseInt(alarm.name.slice(PREFIX.length), 10));
  else if (alarm.name === 'ttd-check') queuePhone();
  else if (alarm.name === 'ttd-autolock') chrome.storage.session.remove(['session']);   // lock: forget the key
});

function openSite(id) {
  if (!id.startsWith(NOTE_PREFIX)) return;
  chrome.tabs.create({ url: SITE });
  chrome.notifications.clear(id);
}
chrome.notifications.onClicked.addListener(openSite);
chrome.notifications.onButtonClicked.addListener(openSite);

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (!msg) return;
  if (msg.type === 'ping') { send({ ok: true }); return; }
  if (msg.type === 'cancel') { cancelQueued().then(() => send({ ok: true })); return true; }
  if (msg.type === 'reschedule') { schedule().then(() => send({ ok: true })); return true; }
});
