// Popup UI. All pilgrim data is read/written through lib/vault.js (AES-GCM, key derived from the PIN).
import * as V from './lib/vault.js';
import { exportKey, importKey, randomTopic } from './lib/crypto.js';
import { ID_TYPES, GENDERS, cleanName, validPhone, validNewPin, validLegacyPin, validatePilgrim, validateIdNumber, cleanId, maskId, cleanPP, hasPP, validatePP, showDate, cleanVisa } from './lib/validation.js';
import { LEADS, MIN, plan, tzChanged } from './lib/schedule.js';
import { LANGS, tr } from './lib/i18n.js';
import { buildIcs } from './lib/ics.js';
import { parsePilgrimCsv } from './lib/csv.js';
import { feedbackText, feedbackUrl, KINDS } from './lib/feedback.js';

const $ = id => document.getElementById(id);
const store = chrome.storage.local;
const NTFY = 'https://ntfy.sh/';
const SITE_HOST = 'ttdevasthanams.ap.gov.in';
const MAX_SELECT = 6;
const AUTOLOCK_MIN = 5;

const S = { lang: 'en', acct: null, key: null, pilgrims: [], archive: [], groups: [], editing: null, mode: 'login', tab: 'home', undo: null, timer: null };
const t = (k, v) => tr(S.lang, k, v);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sget = async k => (await store.get([k]))[k];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtDT = ms => new Date(ms).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const pad = n => String(n).padStart(2, '0');
const toLocalInput = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const tzNow = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ''; } };
const send = msg => new Promise(res => { try { chrome.runtime.sendMessage(msg, r => res(chrome.runtime.lastError ? null : r)); } catch (e) { res(null); } });

const TAGS = () => ['ఓం నమో వేంకటేశాయ', 'గోవిందా! గోవిందా!', t('tagline_in')];
let tagIdx = 0;
function renderTag(fade) { const el = $('tagline'); el.textContent = TAGS()[tagIdx % 3]; if (fade) { el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); } }
setInterval(() => { tagIdx++; renderTag(true); }, 4500);
// the header sky follows the time of day
function applySky() {
  const d = new Date(), x = d.getHours() + d.getMinutes() / 60;
  document.querySelector('header').dataset.sky = x < 5 ? 'night' : x < 8 ? 'dawn' : x < 17 ? 'day' : x < 19.5 ? 'dusk' : 'night';
}
applySky(); setInterval(applySky, 60000);
const DAWN = `<svg class="dawn" viewBox="0 0 340 110" aria-hidden="true"><defs><clipPath id="sk"><rect x="0" y="0" width="340" height="92"/></clipPath></defs>
  <g clip-path="url(#sk)"><g class="rays" stroke="#F6C945" stroke-width="2" opacity=".55">${Array.from({ length: 18 }, (_, i) => `<line x1="170" y1="92" x2="170" y2="-60" transform="rotate(${i * 20} 170 92)"/>`).join('')}</g>
  <circle class="sun" cx="170" cy="70" r="20" fill="#F28C28"/><circle class="sun" cx="170" cy="70" r="13" fill="#FFE08A"/></g>
  <path d="M0 110V78l34-14 30 12 40-22 40 20 34-14 46 18 44-24 36 20 36-12V110z" fill="#5E9B5C" opacity=".7"/>
  <path d="M0 110V90l50-14 44 12 50-16 52 14 46-12 98 18V110z" fill="#2F6B3A"/>
  <g transform="translate(150 52)"><path d="M0 42V16l5-3h30l5 3v26z" fill="#FFF6E3"/><path d="M4 16l5-8h22l5 8z" fill="#F3E3BF"/><path d="M10 8l4-6h12l4 6z" fill="#FFF6E3"/><circle cx="20" cy="-1" r="2.4" fill="#E8B64B"/><rect x="16" y="26" width="8" height="16" rx="4" fill="#B7791F"/></g></svg>`;
function applyI18n() {
  document.documentElement.lang = S.lang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $('disc-body').textContent = t('disc_body');
  $('about-text').textContent = t('disc_body');
  $('pin-hint').textContent = S.mode === 'signup' ? '(' + t('pin_hint') + ')' : '';
  $('auth-go').textContent = S.mode === 'signup' ? t('btn_create') : t('btn_login');
  renderTag();
  fillSelect($('f-gender'), GENDERS, g => t(g === 'Male' ? 'g_male' : g === 'Female' ? 'g_female' : 'g_trans'));
}
function fillSelect(sel, vals, label) {
  const cur = sel.value;
  sel.innerHTML = vals.map(v => `<option value="${esc(v)}">${esc(label ? label(v) : v)}</option>`).join('');
  if (cur) sel.value = cur;
}

// ---------- modal ----------
function modal(html, wire) {
  const m = $('modal'), sh = $('sheet');
  sh.innerHTML = '<button type="button" class="xbtn" data-close aria-label="Close">×</button>' + html; m.hidden = false;
  const onKey = e => { if (e.key === 'Escape') close(); };
  const onBackdrop = e => { if (e.target === m) close(); };
  const close = () => { m.hidden = true; sh.innerHTML = ''; document.removeEventListener('keydown', onKey); m.removeEventListener('click', onBackdrop); };
  document.addEventListener('keydown', onKey); m.addEventListener('click', onBackdrop);
  sh.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  if (wire) wire(sh, close);
  const first = sh.querySelector('input,textarea,button.primary'); if (first) first.focus();
  return close;
}

// ---------- screens ----------
function show(which) {
  $('disclaimer').hidden = which !== 'disclaimer';
  $('auth').hidden = which !== 'auth';
  $('app').hidden = which !== 'app';
  $('who').hidden = which !== 'app';
}

async function boot() {
  const { lang, disclaimerOk } = await store.get(['lang', 'disclaimerOk']);
  S.lang = lang || 'en';
  document.querySelectorAll('.screen').forEach(s => s.insertAdjacentHTML('afterbegin', DAWN));
  document.querySelector('.namam').addEventListener('click', e => { burst(e.currentTarget); tagIdx = 1; renderTag(true); });
  LANGS.forEach(([c, n]) => { for (const id of ['lang', 'lang-pre']) $(id).add(new Option(n, c)); });
  $('lang').value = $('lang-pre').value = S.lang;
  applyI18n();
  if (!disclaimerOk) { show('disclaimer'); return; }
  // resume an unlocked session (the key only lives in storage.session until the auto-lock alarm clears it)
  const { session } = await chrome.storage.session.get(['session']).catch(() => ({}));
  if (session) {
    try {
      const acct = await V.getAccount(store, session.id), key = await importKey(session.key);
      if (acct && (await V.verifyKey(key, acct))) { await enter(acct, key, false); return; }
    } catch (e) { /* fall through to login */ }
    chrome.storage.session.remove(['session']);
  }
  await openAuth();
}

async function openAuth() {
  const accts = await V.listAccounts(store);
  const { lastPhone } = await store.get(['lastPhone']);
  S.mode = accts.length ? 'login' : 'signup';
  setMode(S.mode);
  if (lastPhone && accts.some(a => a.phone === lastPhone)) { $('a-phone').value = lastPhone; }
  show('auth');
  if (lastPhone) $('a-pin').focus(); else $('a-phone').focus();
}
function setMode(m) {
  S.mode = m;
  $('tab-login').classList.toggle('on', m === 'login');
  $('tab-signup').classList.toggle('on', m === 'signup');
  $('row-name').hidden = $('row-pin2').hidden = m !== 'signup';
  $('forgot').hidden = m !== 'login';
  $('auth-err').textContent = '';
  applyI18n();
}

$('disc-accept').addEventListener('click', async () => { await store.set({ disclaimerOk: Date.now() }); await openAuth(); });
$('lang-pre').addEventListener('change', async e => { S.lang = e.target.value; await store.set({ lang: S.lang }); $('lang').value = S.lang; applyI18n(); });
$('lang').addEventListener('change', async e => { S.lang = e.target.value; await store.set({ lang: S.lang }); applyI18n(); renderAll(); });
$('tab-login').addEventListener('click', () => setMode('login'));
$('tab-signup').addEventListener('click', () => setMode('signup'));
for (const id of ['a-phone', 'a-pin', 'a-pin2']) $(id).addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, ''); });
for (const id of ['a-name', 'a-phone', 'a-pin', 'a-pin2']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') $('auth-go').click(); });

let lockTick = null;
function showLock(until) {
  clearInterval(lockTick);
  const upd = () => {
    const s = Math.ceil((until - Date.now()) / 1000);
    if (s <= 0) { clearInterval(lockTick); $('auth-err').textContent = ''; $('auth-go').disabled = false; return; }
    $('auth-err').textContent = `Too many wrong PINs. Try again in ${s}s.`; $('auth-go').disabled = true;
  };
  upd(); lockTick = setInterval(upd, 500);
}

$('auth-go').addEventListener('click', async () => {
  const err = m => { $('auth-err').textContent = m; };
  err('');
  const phone = $('a-phone').value.trim(), pin = $('a-pin').value;
  if (!validPhone(phone)) return err('Enter a valid 10-digit mobile number.');
  $('auth-go').disabled = true;
  try {
    if (S.mode === 'signup') {
      const name = cleanName($('a-name').value);
      if (!/^[A-Za-z ]{2,60}$/.test(name)) return err('Name: letters and spaces only.');
      if (!validNewPin(pin)) return err('PIN must be exactly 6 digits.');
      if (pin !== $('a-pin2').value) return err('The two PINs do not match.');
      const r = await V.createAccount(store, { name, phone, pin });
      await store.set({ lastPhone: phone });
      await enter(r.acct, r.key, true);
    } else {
      if (!validLegacyPin(pin)) return err('Enter your PIN.');
      const r = await V.unlock(store, phone, pin);
      await store.set({ lastPhone: phone });
      await enter(r.acct, r.key, true);
    }
    $('a-pin').value = $('a-pin2').value = '';
  } catch (e) {
    if (e instanceof V.VaultError) {
      if (e.code === 'EXISTS') err('A profile with this number already exists. Use Log in.');
      else if (e.code === 'NO_ACCOUNT') err('No profile for this number. Use Sign up.');
      else if (e.code === 'LOCKED') showLock(e.until);
      else if (e.code === 'BAD_PIN') { err('Wrong PIN.' + (e.until > Date.now() ? '' : ' (' + e.fails + ' wrong so far)')); if (e.until > Date.now()) showLock(e.until); }
      else err('Something went wrong (' + e.code + ').');
    } else err('Something went wrong: ' + e.message);
  } finally { if (!lockTick || $('auth-err').textContent.indexOf('Try again') < 0) $('auth-go').disabled = false; }
});

$('forgot').addEventListener('click', () => {
  const phone = $('a-phone').value.trim();
  if (!validPhone(phone)) { $('auth-err').textContent = 'Enter the mobile number of the profile first.'; return; }
  modal(`<h3>Erase this profile?</h3><p class="para">Your PIN cannot be recovered, because it protects the encryption. Erasing deletes the profile and all its saved pilgrims on this computer.</p>
    <div class="acts"><button class="btn ghost" data-close type="button">Cancel</button><button id="m-erase" class="btn primary" type="button">Erase</button></div>`,
    (sh, close) => sh.querySelector('#m-erase').addEventListener('click', async () => {
      await V.eraseAccount(store, phone); close(); await openAuth(); $('auth-err').textContent = 'Profile erased. You can sign up again.';
    }));
});

async function enter(acct, key, fresh) {
  S.acct = acct; S.key = key;
  await chrome.storage.session.set({ session: { id: acct.id, key: await exportKey(key) } }).catch(() => {});
  chrome.alarms.create('ttd-autolock', { delayInMinutes: AUTOLOCK_MIN });
  S.pilgrims = await V.loadPilgrims(store, acct.id, key);
  S.archive = await V.loadArchive(store, acct.id, key);
  S.groups = await V.loadGroups(store, acct.id);
  $('who-name').textContent = acct.name;
  $('weak').hidden = !acct.weakPin;
  S.editing = null;
  show('app'); applyI18n(); let last = ''; try { last = localStorage.getItem('pfh-tab') || ''; } catch (e) {}
  switchTab(fresh && ['home', 'pilgrims', 'alerts', 'settings'].includes(last) ? last : S.tab); openDoors();
  await renderAll();
  if (fresh && acct.migrated) toast('Your profile was upgraded to encrypted storage.');
  if (fresh && !acct.idConsent && !acct.saveIds) { /* first run: ID saving is off by default */ }
  tickCountdown(); clearInterval(S.timer); S.timer = setInterval(tickCountdown, 1000);
  runChecklist();
}

async function lockNow() {
  clearInterval(S.timer);
  await chrome.storage.session.remove(['session']).catch(() => {});
  chrome.alarms.clear('ttd-autolock');
  S.acct = S.key = null; S.pilgrims = []; S.archive = []; S.groups = [];
  await openAuth();
}
$('lock-btn').addEventListener('click', lockNow);
$('s-lock').addEventListener('click', lockNow);
document.addEventListener('click', () => { if (S.acct) chrome.alarms.create('ttd-autolock', { delayInMinutes: AUTOLOCK_MIN }); }, true);

// ---------- tabs ----------
function switchTab(name) {
  S.tab = name;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  for (const n of ['home', 'pilgrims', 'alerts', 'settings']) $('tab-' + n).hidden = n !== name;
  const on = document.querySelector('#tabs button.on'), ind = document.querySelector('#tabs .ind');
  if (on && ind && on.offsetWidth) { ind.style.width = on.offsetWidth + 'px'; ind.style.transform = `translateX(${on.offsetLeft}px)`; }
  document.querySelectorAll('#tabs button').forEach(b => { b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(b.dataset.tab === name)); b.tabIndex = b.dataset.tab === name ? 0 : -1; });
  try { localStorage.setItem('pfh-tab', name); } catch (e) {}
  if (name === 'home') runChecklist();
}
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
async function renderAll() { renderPilgrims(); renderGroups(); await renderReminder(); await renderPhone(); renderSettings(); }

function toast(msg, undo) {
  $('toast-text').textContent = msg; $('undo-btn').hidden = !undo; S.undo = undo || null;
  $('toast').hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { $('toast').hidden = true; S.undo = null; }, 6000);
}
$('undo-btn').addEventListener('click', async () => { if (S.undo) await S.undo(); $('toast').hidden = true; S.undo = null; });

// ---------- pilgrims ----------
const savePil = async () => { await V.savePilgrims(store, S.acct.id, S.key, S.pilgrims); };
const selected = () => S.pilgrims.filter(p => p.selected);

const LAMP = '<svg viewBox="0 0 24 24"><path class="flame" d="M12 2c3 4 4 6 4 8.5A4 4 0 0 1 8 10.5C8 8 9 6.5 12 2z"/><path d="M3 15h18c0 4-3.6 6-9 6s-9-2-9-6z" fill="#B7791F"/><rect x="3" y="14" width="18" height="2" rx="1" fill="#E8B64B"/></svg>';
function renderDiyas() { const n = selected().length; $('diyas').innerHTML = Array.from({ length: MAX_SELECT }, (_, i) => `<span class="lamp${i < n ? ' lit' : ''}">${LAMP}</span>`).join(''); }
function renderPilgrims() {
  renderDiyas();
  const list = $('list');
  $('p-count').textContent = `${selected().length}/${MAX_SELECT} selected`;
  if (!S.pilgrims.length) list.innerHTML = `<div class="empty">${esc(t('p_none'))}</div>`;
  else list.innerHTML = S.pilgrims.map(p => `
    <div class="pcard ${p.selected ? 'on' : ''}" data-id="${p.id}">
      <label><input type="checkbox" ${p.selected ? 'checked' : ''} data-sel="${p.id}" aria-label="Select ${esc(p.name)}">
        <span><span class="nm">${esc(p.name)}</span><br><span class="muted small">${esc(p.age)} yrs · ${esc(p.gender)} · ${esc(ID_TYPES[p.idType] || '')} ${p.idNum ? esc(maskId(p.idNum)) : '<i>(ID not saved)</i>'}</span>${p.idType === '2' && hasPP(p.pp) ? `<br><span class="ppchip">${esc([p.pp.country, p.pp.visaType, p.pp.visaExp ? 'till ' + showDate(p.pp.visaExp) : ''].filter(Boolean).join(' · ') || 'Visa details saved')}</span>` : ''}</span></label>
      <div class="acts"><button class="linkbtn" data-edit="${p.id}" type="button">${esc(t('p_edit'))}</button><button class="linkbtn danger" data-del="${p.id}" type="button">${esc(t('p_delete'))}</button></div>
    </div>`).join('');
  $('group-save').hidden = selected().length < 2;
}
$('list').addEventListener('change', async e => {
  const id = e.target.dataset.sel; if (!id) return;
  const p = S.pilgrims.find(x => x.id === id);
  if (e.target.checked && selected().length >= MAX_SELECT) { e.target.checked = false; toast(`You can select at most ${MAX_SELECT} pilgrims.`); return; }
  p.selected = e.target.checked; await savePil(); renderPilgrims(); runChecklist();
});
$('list').addEventListener('click', async e => {
  const ed = e.target.dataset.edit, del = e.target.dataset.del;
  if (ed) openForm(S.pilgrims.find(p => p.id === ed));
  if (del) {
    const p = S.pilgrims.find(x => x.id === del), idx = S.pilgrims.indexOf(p);
    S.pilgrims.splice(idx, 1); S.archive = [p, ...S.archive.filter(a => a.name !== p.name)].slice(0, 20);
    await savePil(); await V.saveArchive(store, S.acct.id, S.key, S.archive); renderPilgrims(); runChecklist();
    toast(`Deleted ${p.name}.`, async () => {
      S.pilgrims.splice(Math.min(idx, S.pilgrims.length), 0, p); S.archive = S.archive.filter(a => a.id !== p.id);
      await savePil(); await V.saveArchive(store, S.acct.id, S.key, S.archive); renderPilgrims(); runChecklist();
    });
  }
});

function openForm(p) {
  S.editing = p || null;
  $('form-title').textContent = p ? t('p_edit') : t('p_add');
  $('f-name').value = p ? p.name : ''; $('f-age').value = p ? p.age : '';
  fillSelect($('f-gender'), GENDERS, g => t(g === 'Male' ? 'g_male' : g === 'Female' ? 'g_female' : 'g_trans'));
  $('f-gender').value = p ? p.gender : 'Male';
  fillSelect($('f-idtype'), Object.keys(ID_TYPES), k => ID_TYPES[k]);
  $('f-idtype').value = p ? p.idType : '1';
  $('f-idnum').value = p ? (p.idNum || '') : '';
  $('f-idnum').type = 'password';
  const pp = (p && p.pp) || {};
  $('f-country').value = pp.country || ''; $('f-visatype').value = pp.visaType || ''; $('f-visano').value = S.acct.saveIds ? (pp.visaNo || '') : ''; $('f-visaexp').value = pp.visaExp || '';
  $('visano-wrap').hidden = !S.acct.saveIds; ppToggle();
  $('form-err').textContent = ''; $('suggest').innerHTML = '';
  const keep = S.acct.saveIds;
  $('idnum-wrap').hidden = !keep; $('noid-note').hidden = keep;
  idHint(); $('form').hidden = false; $('add-btn').hidden = true; $('f-name').focus();
}
function ppToggle() { const on = $('f-idtype').value === '2'; $('pp-wrap').hidden = !on; }
function idHint() {
  const type = $('f-idtype').value, el = $('f-idnum');
  el.maxLength = type === '1' ? 12 : 12;
  const n = el.value.length;
  $('idnum-hint').textContent = type === '1' ? `Aadhaar: 12 digits (${n}/12)` : `Passport: 6 to 12 letters or digits (${n}/12)`;
}
$('f-idtype').addEventListener('change', () => { ppToggle(); $('f-idnum').value = cleanId($('f-idtype').value, $('f-idnum').value); idHint(); });
$('f-idnum').addEventListener('input', e => { e.target.value = cleanId($('f-idtype').value, e.target.value); idHint(); });
$('f-idnum').addEventListener('dblclick', e => { e.target.type = e.target.type === 'password' ? 'text' : 'password'; });
$('add-btn').addEventListener('click', () => openForm(null));
$('cancel-btn').addEventListener('click', () => { $('form').hidden = true; $('add-btn').hidden = false; S.editing = null; });
$('turn-on-ids').addEventListener('click', () => askSaveIds(true).then(ok => { if (ok) openForm(S.editing); }));

$('f-name').addEventListener('input', () => {
  const q = $('f-name').value.trim().toLowerCase();
  if (S.editing || q.length < 2) { $('suggest').innerHTML = ''; return; }
  const m = S.archive.filter(a => a.name.toLowerCase().startsWith(q)).slice(0, 3);
  $('suggest').innerHTML = m.map(a => `<div class="sg"><button class="use" data-use="${a.id}" type="button">Use saved: ${esc(a.name)}, ${esc(a.age)}</button><button class="linkbtn danger" data-forget="${a.id}" type="button">Forget</button></div>`).join('');
});
$('suggest').addEventListener('click', async e => {
  const use = e.target.dataset.use, fg = e.target.dataset.forget;
  if (use) {
    const a = S.archive.find(x => x.id === use);
    $('f-name').value = a.name; $('f-age').value = a.age; $('f-gender').value = a.gender; $('f-idtype').value = a.idType;
    $('f-idnum').value = S.acct.saveIds ? (a.idNum || '') : ''; const ap = a.pp || {}; $('f-country').value = ap.country || ''; $('f-visatype').value = ap.visaType || ''; $('f-visano').value = S.acct.saveIds ? (ap.visaNo || '') : ''; $('f-visaexp').value = ap.visaExp || ''; ppToggle(); idHint(); $('suggest').innerHTML = '';
  }
  if (fg) { S.archive = S.archive.filter(x => x.id !== fg); await V.saveArchive(store, S.acct.id, S.key, S.archive); $('suggest').innerHTML = ''; }
});

$('save-btn').addEventListener('click', async () => {
  const p = { name: cleanName($('f-name').value), age: $('f-age').value, gender: $('f-gender').value, idType: $('f-idtype').value,
              idNum: S.acct.saveIds ? cleanId($('f-idtype').value, $('f-idnum').value) : '' };
  if (p.idType === '2') {
    const pp = cleanPP({ country: $('f-country').value, visaType: $('f-visatype').value, visaNo: S.acct.saveIds ? $('f-visano').value : '', visaExp: $('f-visaexp').value });
    if (hasPP(pp)) p.pp = pp; else p.pp = undefined;
  } else p.pp = undefined;
  const bad = validatePilgrim(p, { idRequired: false }) || (p.pp ? validatePP(p.pp) : '');
  if (bad) { $('form-err').textContent = bad; return; }
  if (!S.editing && S.pilgrims.length >= 30) { $('form-err').textContent = 'You can save up to 30 pilgrims.'; return; }
  if (S.editing) Object.assign(S.editing, p);
  else S.pilgrims.push({ id: uid(), selected: false, ...p });
  await savePil();
  $('form').hidden = true; $('add-btn').hidden = false; S.editing = null; renderPilgrims(); runChecklist(); burst($('add-btn'));
});

// ---------- groups (saved selections) ----------
function renderGroups() {
  $('groups').innerHTML = S.groups.map(g => `<span class="chip"><button class="use" data-use="${g.id}" type="button">${esc(g.name)} (${g.ids.length})</button><button data-rm="${g.id}" type="button" aria-label="Remove group ${esc(g.name)}">×</button></span>`).join('');
}
$('groups').addEventListener('click', async e => {
  const use = e.target.dataset.use, rm = e.target.dataset.rm;
  if (use) {
    const g = S.groups.find(x => x.id === use);
    S.pilgrims.forEach(p => { p.selected = false; });
    g.ids.filter(id => S.pilgrims.some(p => p.id === id)).slice(0, MAX_SELECT).forEach(id => { S.pilgrims.find(p => p.id === id).selected = true; });
    await savePil(); renderPilgrims(); runChecklist();
  }
  if (rm) { S.groups = S.groups.filter(x => x.id !== rm); await V.saveGroups(store, S.acct.id, S.groups); renderGroups(); }
});
$('g-save').addEventListener('click', async () => {
  const name = cleanName($('g-name').value).slice(0, 30);
  if (!name) { toast('Give the group a name.'); return; }
  S.groups.push({ id: uid(), name, ids: selected().map(p => p.id) });   // only pilgrim ids, no personal data in plaintext
  await V.saveGroups(store, S.acct.id, S.groups); $('g-name').value = ''; renderGroups();
});

// ---------- consent for ID saving ----------
function askSaveIds(on) {
  return new Promise(resolve => {
    if (!on) {
      modal(`<h3>Stop saving ID numbers?</h3><p class="para">All saved ID numbers will be deleted from this computer now. You will type them just before filling.</p>
        <div class="acts"><button class="btn ghost" data-close id="m-no" type="button">Cancel</button><button id="m-yes" class="btn primary" type="button">Delete ID numbers</button></div>`,
        (sh, close) => {
          sh.querySelector('#m-no').addEventListener('click', () => resolve(false));
          sh.querySelector('#m-yes').addEventListener('click', async () => { S.acct = await V.setSaveIds(store, S.acct, S.key, false); S.pilgrims = await V.loadPilgrims(store, S.acct.id, S.key); S.archive = await V.loadArchive(store, S.acct.id, S.key); close(); renderAll(); resolve(true); });
        });
      return;
    }
    modal(`<h3>Save ID numbers on this computer?</h3><p class="para">Aadhaar and passport numbers are sensitive. If you agree, they are stored encrypted with your PIN in this browser profile only. They are never sent anywhere except into the TTD form when you press Fill. Anyone who knows your PIN and uses this Windows account can read them, so use a PIN that is not easy to guess. You can turn this off any time and the numbers are deleted.</p>
      <div class="acts"><button class="btn ghost" data-close id="m-no" type="button">No, don't save</button><button id="m-yes" class="btn primary" type="button">Yes, save them</button></div>`,
      (sh, close) => {
        sh.querySelector('#m-no').addEventListener('click', () => resolve(false));
        sh.querySelector('#m-yes').addEventListener('click', async () => { S.acct = await V.setSaveIds(store, S.acct, S.key, true); close(); renderAll(); resolve(true); });
      });
  });
}

// ---------- reminder, countdown ----------
async function renderReminder() {
  const r = await sget('reminder');
  $('rem-time').value = r ? toLocalInput(r.releaseAt) : ''; $('rem-pretty').textContent = r ? new Date(r.releaseAt).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '';
  const lines = [];
  if (r) {
    const alarms = (await chrome.alarms.getAll()).filter(a => a.name.startsWith('ttd-r-')).sort((a, b) => a.scheduledTime - b.scheduledTime);
    lines.push('Release: ' + fmtDT(r.releaseAt));
    lines.push(alarms.length ? 'Armed: ' + alarms.map(a => fmtDT(a.scheduledTime).replace(/^\w+, /, '')).join('  ·  ') : 'No alerts left to fire.');
    const q = Object.keys(r.queued || {}).length;
    if (q) lines.push(`${q} phone alert(s) queued on the server.`);
  } else lines.push('No reminder set.');
  const log = await sget('alarmLog');
  if (log && log.length) lines.push('Last event: ' + log[log.length - 1]);
  $('rem-status').textContent = lines.join('\n');
  $('stages').innerHTML = r ? LEADS.map(l => {
    const at = r.releaseAt - l * MIN, st = (r.sent || []).includes(l) ? 'done' : at > Date.now() ? 'armed' : 'missed';
    return `<div class="stg ${st}">${LAMP}<b>${l ? l + ' min' : 'Release'}</b><small>${new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</small></div>`;
  }).join('') : '';
  $('bell').classList.toggle('ring', !!r);
  const tzw = r && tzChanged(r, tzNow());
  $('tz-warn').hidden = !tzw;
  if (tzw) $('tz-warn').textContent = `This PC's time zone is now ${tzNow()}, but the reminder was set in ${r.tz}. Check the release time again in Alerts.`;
}
$('rem-ics').addEventListener('click', async () => {
  const r = await sget('reminder'); if (!r) { $('rem-status').textContent = 'Set the reminder first.'; return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buildIcs(r.releaseAt)], { type: 'text/calendar' }));
  a.download = 'ttd-release.ics'; document.body.appendChild(a); a.click(); a.remove();
  $('rem-status').textContent = 'Calendar file saved to Downloads. Open it on your phone to add it.';
});
const prettyTime = () => { const v = $('rem-time').value; $('rem-pretty').textContent = v ? new Date(v).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : ''; };
$('rem-time').addEventListener('input', prettyTime);
$('rem-set').addEventListener('click', async () => {
  const v = $('rem-time').value; if (!v) { $('rem-status').textContent = 'Pick the release date and time first.'; return; }
  const at = new Date(v).getTime();
  if (!(at > Date.now())) { $('rem-status').textContent = 'That time has already passed.'; return; }
  const h = new Date(at).getHours();
  const doSet = async () => {
    await send({ type: 'cancel' });
    await store.set({ reminder: { releaseAt: at, sent: [], queued: {}, tz: tzNow(), setAt: Date.now() } });
    await send({ type: 'reschedule' }); await renderReminder(); tickCountdown(); runChecklist(); burst($('rem-set'));
  };
  if (h < 5) {
    modal(`<h3>Check the time</h3><p class="para">You entered ${esc(fmtDT(at))}. That is very early in the morning. Did you mean PM?</p>
      <div class="acts"><button class="btn ghost" data-close type="button">Change it</button><button id="m-ok" class="btn primary" type="button">It is correct</button></div>`,
      (sh, close) => sh.querySelector('#m-ok').addEventListener('click', () => { close(); doSet(); }));
  } else doSet();
});
$('rem-clear').addEventListener('click', async () => {
  await send({ type: 'cancel' }); await store.remove('reminder'); await send({ type: 'reschedule' }); await renderReminder(); tickCountdown(); runChecklist();
});
$('rem-test').addEventListener('click', () => {
  chrome.notifications.create('ttd-test', { type: 'basic', iconUrl: 'icon128.png', title: 'Test alert', message: 'If you can see this, desktop alerts work.', priority: 2 },
    () => { $('rem-status').textContent = chrome.runtime.lastError ? 'Notification blocked: ' + chrome.runtime.lastError.message : 'Test alert sent. Did you see it?'; });
});

// each digit that changes rolls in, like a temple clock
function ticker(el, text) {
  if (el.dataset.v === text) return;
  const prev = el.dataset.v || '';
  el.innerHTML = [...text].map((c, i) => `<span class="dg${prev && prev.length === text.length && prev[i] !== c ? ' roll' : ''}">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
  el.dataset.v = text; el.setAttribute('aria-label', text);
}
// marigold-petal burst from an element (success feedback)
function burst(from) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = from.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, cols = ['#F28C28', '#F6C945', '#FFFBF0', '#C0392B'];
  for (let i = 0; i < 16; i++) {
    const p = document.createElement('i'); p.className = 'pt';
    const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 70;
    p.style.cssText = `left:${x}px;top:${y}px;background:${cols[i % 4]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 30}px;--rot:${Math.random() * 540}deg`;
    document.body.appendChild(p); setTimeout(() => p.remove(), 1000);
  }
}
// the temple doors open when you unlock
function openDoors() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const d = document.createElement('div'); d.className = 'doors'; d.setAttribute('aria-hidden', 'true');
  d.innerHTML = '<div class="door l"></div><div class="door r"></div><div class="om">ఓం</div>';
  document.body.appendChild(d); setTimeout(() => d.remove(), 1300);
}
async function tickCountdown() {
  const r = await sget('reminder'), el = $('count'), sub = $('count-sub');
  if (!r) { ticker(el, '--:--:--'); el.classList.remove('soon'); sub.textContent = t('h_none'); return; }
  const ms = r.releaseAt - Date.now();
  if (ms <= 0) { ticker(el, '00:00:00'); el.classList.add('soon'); sub.textContent = t('h_passed'); return; }
  const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4), s = Math.floor(ms % 6e4 / 1000);
  ticker(el, (d ? d + 'd ' : '') + `${pad(h)}:${pad(m)}:${pad(s)}`);
  el.classList.toggle('soon', ms < 10 * MIN);
  const next = LEADS.map(l => r.releaseAt - l * MIN).filter(x => x > Date.now())[0];
  sub.textContent = fmtDT(r.releaseAt) + (next ? '  ·  ' + t('h_next') + ': ' + fmtDT(next).replace(/^\w+, /, '') : '');
}

// ---------- phone alerts ----------
const hasNtfy = () => chrome.permissions.contains({ origins: [NTFY + '*'] }).catch(() => false);
async function renderPhone() {
  let n = await sget('ntfy');
  $('ph-topic').value = n && n.topic ? n.topic : '(created when you switch on phone alerts)';
  $('ph-on').checked = !!(n && n.enabled && (await hasNtfy()));
  const st = [];
  if (n && n.lastTest) st.push('Last test sent: ' + fmtDT(n.lastTest.at) + (n.lastTest.ok ? ' (server accepted it)' : ' (failed: ' + n.lastTest.err + ')'));
  $('ph-status').textContent = st.join('\n');
}
$('ph-on').addEventListener('change', async e => {
  const on = e.target.checked;
  if (!on) {
    await send({ type: 'cancel' });
    const n = (await sget('ntfy')) || {}; await store.set({ ntfy: { ...n, enabled: false } });
    await renderPhone(); return;
  }
  e.target.checked = false;
  modal(`<h3>Send alerts through ntfy.sh?</h3><p class="para">Phone alerts use the free public service ntfy.sh. It will receive your secret topic name and the alert text (for example "TTD tickets release in 10 min"). No names, ID numbers or phone number are sent. Anyone who learns your topic could read or send alerts on it, so keep it private.</p>
    <div class="acts"><button class="btn ghost" data-close type="button">Cancel</button><button id="m-ok" class="btn primary" type="button">Allow</button></div>`,
    (sh, close) => sh.querySelector('#m-ok').addEventListener('click', async () => {
      // permissions.request must run directly inside this click
      const granted = await chrome.permissions.request({ origins: [NTFY + '*'] }).catch(() => false);
      close();
      if (!granted) { $('ph-status').textContent = 'Permission was not granted, so phone alerts stay off.'; return; }
      const n = (await sget('ntfy')) || {};
      await store.set({ ntfy: { ...n, enabled: true, topic: n.topic || randomTopic(), consent: Date.now() } });
      await send({ type: 'reschedule' }); await renderPhone();
    }));
});
$('ph-copy').addEventListener('click', async () => { const v = $('ph-topic').value; if (v.startsWith('ttd-')) { await navigator.clipboard.writeText(v); $('ph-status').textContent = 'Topic copied.'; } });
$('ph-rotate').addEventListener('click', async () => {
  const n = (await sget('ntfy')) || {};
  await send({ type: 'cancel' });
  await store.set({ ntfy: { ...n, topic: randomTopic(), lastTest: null } });
  await send({ type: 'reschedule' }); await renderPhone(); $('ph-status').textContent = 'New topic created. Subscribe to it again in the ntfy app.';
});
$('ph-qr').addEventListener('click', async () => {
  const n = await sget('ntfy'); const box = $('ph-qrbox');
  if (!n || !n.topic) { $('ph-status').textContent = 'Switch on phone alerts first.'; return; }
  if (!box.hidden) { box.hidden = true; return; }
  const q = window.qrcode(0, 'M'); q.addData('ntfy://ntfy.sh/' + n.topic); q.make();
  box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }).replace('<svg ', '<svg style="width:170px;height:170px;background:#fff" role="img" aria-label="QR code to subscribe in the ntfy app" ');
  box.hidden = false;
});
$('ph-test').addEventListener('click', async () => {
  const n = await sget('ntfy');
  if (!n || !n.enabled || !(await hasNtfy())) { $('ph-status').textContent = 'Switch on "Send the alerts to my phone" first.'; return; }
  $('ph-status').textContent = 'Sending...';
  let res;
  try {
    const r = await fetch(NTFY + encodeURIComponent(n.topic), { method: 'POST', headers: { Title: 'Test alert', Priority: '4', Tags: 'bell' }, body: 'Phone alerts are working.' });
    res = { at: Date.now(), ok: r.ok, err: r.ok ? '' : 'HTTP ' + r.status };
  } catch (e) { res = { at: Date.now(), ok: false, err: e.message }; }
  await store.set({ ntfy: { ...(await sget('ntfy')), lastTest: res } });
  await renderPhone();
  $('ph-status').textContent += '\n' + (res.ok ? 'Sent. Check your phone. If nothing arrives, check the ntfy app subscription and its notification settings.' : 'Could not send. Check your internet connection.');
});

// ---------- health check ----------
function row(cls, text, hint) { return `<li class="${cls}"><span class="ic">${cls === 'ok' ? '✓' : cls === 'bad' ? '!' : cls === 'warn' ? '?' : '–'}</span><span>${esc(text)}${hint ? `<small>${esc(hint)}</small>` : ''}</span></li>`; }
$('hc-run').addEventListener('click', async () => {
  const out = []; const add = (c, t2, h) => { out.push(row(c, t2, h)); $('hc-list').innerHTML = out.join(''); };
  $('hc-list').innerHTML = '';
  // notifications
  chrome.notifications.getPermissionLevel(l => add(l === 'granted' ? 'ok' : 'bad', 'Desktop notifications ' + (l === 'granted' ? 'allowed' : 'blocked'), l === 'granted' ? '' : 'Windows Settings > System > Notifications > allow Microsoft Edge.'));
  // background worker
  const pong = await send({ type: 'ping' }); add(pong && pong.ok ? 'ok' : 'bad', pong && pong.ok ? 'Background worker is running' : 'Background worker did not answer', pong ? '' : 'Reload the extension in edge://extensions.');
  // alarms
  const r = await sget('reminder'), alarms = (await chrome.alarms.getAll()).filter(a => a.name.startsWith('ttd-r-'));
  if (!r) add('na', 'No reminder set'); else add(alarms.length || plan(r, Date.now()).arm.length === 0 ? 'ok' : 'bad', alarms.length ? alarms.length + ' alert(s) armed' : 'No alerts armed');
  if (r) { const h = new Date(r.releaseAt).getHours(); add(h >= 5 ? 'ok' : 'warn', 'Release time: ' + fmtDT(r.releaseAt), h >= 5 ? 'Double-check it against the official TTD announcement.' : 'Very early hour. Did you mean PM?'); }
  // clock
  try {
    const resp = await fetch(NTFY + 'v1/health', { method: 'GET' }).catch(() => null);
    const d = resp && resp.headers.get('date');
    if (d) { const skew = Math.abs(new Date(d).getTime() - Date.now()) / 1000; add(skew < 60 ? 'ok' : 'warn', skew < 60 ? 'PC clock is accurate' : `PC clock is off by about ${Math.round(skew)}s`, skew < 60 ? '' : 'Sync the Windows clock (Settings > Time & language).'); }
  } catch (e) {}
  // time zone
  add(r && tzChanged(r, tzNow()) ? 'warn' : 'ok', 'Time zone: ' + tzNow(), r && tzChanged(r, tzNow()) ? 'Different from when the reminder was set.' : '');
  // ntfy
  const n = await sget('ntfy');
  if (!n || !n.enabled) add('na', 'Phone alerts are off');
  else {
    add(await hasNtfy() ? 'ok' : 'bad', 'Permission for ntfy.sh');
    try { const x = await fetch(NTFY + 'v1/health'); add(x.ok ? 'ok' : 'bad', x.ok ? 'ntfy.sh is reachable' : 'ntfy.sh returned HTTP ' + x.status); } catch (e) { add('bad', 'ntfy.sh is not reachable', 'Check your internet connection.'); }
    add(n.lastTest && n.lastTest.ok ? 'ok' : 'warn', n.lastTest && n.lastTest.ok ? 'Last phone test: ' + fmtDT(n.lastTest.at) : 'Phone test not done yet', n.lastTest ? '' : 'Press "Send test to phone".');
    if (r) add('na', `${Object.keys(r.queued || {}).length} of ${LEADS.length} phone alerts queued on the server`, 'They are queued in the 3 days before release. Open Edge once in that window.');
  }
});

// ---------- settings ----------
function renderSettings() {
  $('lang').value = S.lang;
  $('set-saveids').checked = !!(S.acct && S.acct.saveIds);
  sget('soundOn').then(v => { $('set-sound').checked = v !== false; });
}
$('set-saveids').addEventListener('change', async e => {
  const want = e.target.checked; e.target.checked = !want;
  const ok = await askSaveIds(want); renderSettings(); if (ok) { renderPilgrims(); }
});
$('set-sound').addEventListener('change', e => store.set({ soundOn: e.target.checked }));

$('s-pin').addEventListener('click', () => {
  modal(`<h3>Change PIN</h3><label class="lbl" for="m-old">Current PIN</label><input id="m-old" type="password" inputmode="numeric" maxlength="6">
    <label class="lbl" for="m-new">New PIN (6 digits)</label><input id="m-new" type="password" inputmode="numeric" maxlength="6">
    <label class="lbl" for="m-new2">Confirm new PIN</label><input id="m-new2" type="password" inputmode="numeric" maxlength="6">
    <div id="m-err" class="err" role="alert"></div>
    <div class="acts"><button class="btn ghost" data-close type="button">Cancel</button><button id="m-ok" class="btn primary" type="button">Change</button></div>`,
    (sh, close) => sh.querySelector('#m-ok').addEventListener('click', async () => {
      const o = sh.querySelector('#m-old').value, n1 = sh.querySelector('#m-new').value, n2 = sh.querySelector('#m-new2').value, er = sh.querySelector('#m-err');
      if (!validNewPin(n1)) { er.textContent = 'New PIN must be exactly 6 digits.'; return; }
      if (n1 !== n2) { er.textContent = 'The new PINs do not match.'; return; }
      try {
        const r = await V.changePin(store, S.acct, S.key, o, n1);
        S.acct = r.acct; S.key = r.key; await chrome.storage.session.set({ session: { id: S.acct.id, key: await exportKey(S.key) } });
        $('weak').hidden = true; close(); toast('PIN changed.');
      } catch (e) { er.textContent = e instanceof V.VaultError && e.code === 'BAD_PIN' ? 'Current PIN is wrong.' : 'Could not change the PIN.'; }
    }));
});

$('s-export').addEventListener('click', () => {
  modal(`<h3>Export pilgrims</h3><p class="para">The text is encrypted with a password you choose now. Keep both safe. ${S.acct.saveIds ? 'It includes saved ID numbers.' : ''}</p>
    <label class="lbl" for="m-pw">Password (at least 8 characters)</label><input id="m-pw" type="password">
    <div id="m-err" class="err" role="alert"></div><textarea id="m-out" readonly hidden></textarea>
    <div class="acts"><button class="btn ghost" data-close type="button">Close</button><button id="m-ok" class="btn primary" type="button">Create text</button></div>`,
    sh => sh.querySelector('#m-ok').addEventListener('click', async () => {
      const pw = sh.querySelector('#m-pw').value, er = sh.querySelector('#m-err'), out = sh.querySelector('#m-out');
      if (pw.length < 8) { er.textContent = 'Use at least 8 characters.'; return; }
      out.value = await V.exportVault(store, S.acct, S.key, pw); out.hidden = false; out.select();
      try { await navigator.clipboard.writeText(out.value); er.style.color = 'var(--g)'; er.textContent = 'Copied. Paste it into a file or message to yourself.'; } catch (e) { er.textContent = 'Select the text and copy it.'; }
    }));
});
$('s-import').addEventListener('click', () => {
  modal(`<h3>Import pilgrims</h3><label class="lbl" for="m-in">Paste the exported text</label><textarea id="m-in"></textarea>
    <label class="lbl" for="m-pw">Password used for the export</label><input id="m-pw" type="password">
    <div id="m-err" class="err" role="alert"></div>
    <div class="acts"><button class="btn ghost" data-close type="button">Cancel</button><button id="m-ok" class="btn primary" type="button">Import</button></div>`,
    (sh, close) => sh.querySelector('#m-ok').addEventListener('click', async () => {
      const er = sh.querySelector('#m-err');
      try {
        const n = await V.importVault(store, S.acct, S.key, sh.querySelector('#m-pw').value, sh.querySelector('#m-in').value.trim());
        S.pilgrims = await V.loadPilgrims(store, S.acct.id, S.key); close(); renderPilgrims(); toast(`Imported ${n} pilgrim(s).`);
      } catch (e) { er.textContent = e.code === 'BAD_FORMAT' ? 'That text is not a valid export.' : 'Wrong password or damaged text.'; }
    }));
});

$('s-csv').addEventListener('click', () => {
  modal(`<h3>Import from spreadsheet</h3><p class="muted small">Copy rows from Excel or Sheets (with a header row: Name, Age, Gender, ID Type, ID Number) and paste, or choose a .csv file.</p>
    <input id="m-file" type="file" accept=".csv,.txt,.tsv"><textarea id="m-in" style="margin-top:6px"></textarea>
    <div id="m-err" class="err" role="alert"></div>
    <div class="acts"><button class="btn ghost" data-close type="button">Cancel</button><button id="m-ok" class="btn primary" type="button">Import</button></div>`,
    (sh, close) => {
      sh.querySelector('#m-file').addEventListener('change', async e => { const f = e.target.files[0]; if (f) sh.querySelector('#m-in').value = await f.text(); });
      sh.querySelector('#m-ok').addEventListener('click', async () => {
        const er = sh.querySelector('#m-err'), r = parsePilgrimCsv(sh.querySelector('#m-in').value, { saveIds: S.acct.saveIds });
        const room = 30 - S.pilgrims.length, add = r.rows.filter(p => !S.pilgrims.some(c => c.name.toLowerCase() === p.name.toLowerCase() && String(c.age) === String(p.age))).slice(0, Math.max(0, room));
        if (!add.length) { er.textContent = r.errors[0] || 'Nothing new to import.'; return; }
        add.forEach(p => S.pilgrims.push({ id: uid(), selected: false, ...p })); await savePil(); renderPilgrims(); close();
        toast(`Imported ${add.length}` + (r.errors.length ? `, skipped ${r.errors.length}` : '') + '.');
      });
    });
});
$('open-site').addEventListener('click', () => chrome.tabs.create({ url: 'https://' + SITE_HOST + '/' }));
$('s-feedback').addEventListener('click', () => {
  modal(`<h3>Your feedback</h3>
    <div id="m-stars" role="radiogroup" aria-label="Rating" style="font-size:26px;color:var(--gold);cursor:pointer">${[1, 2, 3, 4, 5].map(n => `<span data-n="${n}" role="radio" aria-label="${n} star" tabindex="0">☆</span>`).join('')}</div>
    <label class="lbl" for="m-kind">Type</label><select id="m-kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    <label class="lbl" for="m-msg">What should be better?</label><textarea id="m-msg" maxlength="1500" style="font-family:inherit;font-size:13px"></textarea>
    <p class="muted small">Opens a GitHub page with your text. Check it, then submit. Do not include ID numbers.</p>
    <div class="acts"><button id="m-copy" class="btn ghost" type="button">Copy</button><button id="m-go" class="btn primary" type="button">Send on GitHub</button></div>`,
    (sh, close) => {
      let rating = 0;
      const paint = () => sh.querySelectorAll('#m-stars span').forEach(x => { x.textContent = +x.dataset.n <= rating ? '★' : '☆'; });
      sh.querySelectorAll('#m-stars span').forEach(x => { const pick = () => { rating = +x.dataset.n; paint(); }; x.addEventListener('click', pick); x.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') pick(); }); });
      const data = () => ({ rating, kind: sh.querySelector('#m-kind').value, message: sh.querySelector('#m-msg').value, version: chrome.runtime.getManifest().version });
      sh.querySelector('#m-go').addEventListener('click', () => { chrome.tabs.create({ url: feedbackUrl(data()) }); close(); });
      sh.querySelector('#m-copy').addEventListener('click', async e => { try { await navigator.clipboard.writeText(feedbackText(data())); e.target.textContent = 'Copied'; } catch (er) {} });
    });
});
$('del-acct').addEventListener('click', () => {
  modal(`<h3>Delete my profile?</h3><p class="para">This erases the profile, all saved pilgrims, the reminder and queued phone alerts from this computer. It cannot be undone.</p>
    <div class="acts"><button class="btn ghost" data-close type="button">Cancel</button><button id="m-ok" class="btn primary" type="button">Delete everything</button></div>`,
    (sh, close) => sh.querySelector('#m-ok').addEventListener('click', async () => {
      await send({ type: 'cancel' }); await store.remove(['reminder', 'ntfy']); await send({ type: 'reschedule' });
      await V.eraseAccount(store, S.acct.id); close(); await lockNow();
    }));
});

// ---------- page access: TTD tab (injected on demand) or the practice page ----------
async function activeTab() { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); return tab || null; }
function kindOfUrl(tab) {
  if (!tab || !tab.url) return null;
  if (tab.url.startsWith(chrome.runtime.getURL('mock.html'))) return 'mock';
  try { return new URL(tab.url).hostname === SITE_HOST ? 'ttd' : null; } catch (e) { return null; }
}
// the URL is only visible after the user clicked the toolbar icon (activeTab); if it is hidden, probe the practice page
async function kindOf(tab) {
  const k = kindOfUrl(tab);
  if (k || !tab || tab.url) return k;
  try { const r = await chrome.tabs.sendMessage(tab.id, { type: 'ttd-scan' }); return r && r.version ? 'mock' : null; } catch (e) { return null; }
}
async function pageCall(tab, kind, type, extra) {
  if (kind === 'mock') return chrome.tabs.sendMessage(tab.id, { type, ...extra });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['fill.js'], world: 'MAIN' });
  const fn = type === 'ttd-scan' ? () => window.__ttdScan() : type === 'ttd-report' ? () => window.__ttdReport() : type === 'ttd-panel' ? (ps) => window.__ttdPanel(ps) : (ps) => window.__ttdFill(ps);
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: fn, args: type === 'ttd-fill' || type === 'ttd-panel' ? [extra.pilgrims] : [] });
  return res && res.result;
}

async function runChecklist() {
  if (!S.acct) return;
  if (!$('checklist').children.length) $('checklist').innerHTML = '<li class="sk"></li><li class="sk"></li><li class="sk"></li>';
  const r = await sget('reminder'), n = await sget('ntfy'), tab = await activeTab(), kind = await kindOf(tab);
  const items = [];
  items.push(row(r ? 'ok' : 'bad', t('cl_time')));
  items.push(row(r && plan(r, Date.now()).arm.length ? 'ok' : r ? 'warn' : 'bad', t('cl_alerts')));
  items.push(row(n && n.enabled ? (n.lastTest && n.lastTest.ok ? 'ok' : 'warn') : 'na', t('cl_phone'), n && n.enabled ? '' : 'Optional'));
  const sel = selected().length;
  items.push(row(sel ? 'ok' : 'bad', t('cl_pilgrims') + ` (${sel})`));
  items.push(row(kind ? 'ok' : 'warn', t('cl_tab'), kind === 'mock' ? 'Practice page' : kind ? '' : 'Open the TTD site in this tab.'));
  let scan = null;
  if (kind) { try { scan = await pageCall(tab, kind, 'ttd-scan'); } catch (e) { scan = null; } }
  items.push(row(scan && scan.loggedIn === true ? 'ok' : scan && scan.loggedIn === false ? 'warn' : 'na', t('cl_login'), scan && scan.loggedIn === false ? 'Log in with your OTP.' : ''));
  items.push(row(scan && scan.ok ? 'ok' : kind ? 'warn' : 'na', t('cl_form'), scan && scan.ok ? `${scan.rows} row(s) found` : kind ? 'Go to the Pilgrim Details page.' : ''));
  $('checklist').innerHTML = items.join('');
  const cls = items.map(x => (x.match(/^<li class="(\w+)"/) || [])[1]);
  $('mala').innerHTML = cls.map((c, i) => `<i class="bd ${c}" style="--i:${i}"></i>`).join('') + '<b class="tas"></b>';
  $('cl-n').textContent = `${cls.filter(c => c === 'ok').length}/${cls.length}`;
  if (cls.includes('bad') && !S.clTouched) $('cl-card').open = true;
  $('fill-btn').classList.toggle('soft', !sel);
  $('fill-btn').title = sel ? 'Check your details, then type Name and Age' : 'Tick a pilgrim in the Pilgrims tab first';
  const isReady = !!(r && plan(r, Date.now()).arm.length && sel > 0);
  $('ready').hidden = !isReady; document.querySelector('.card.hero').classList.toggle('ready-glow', isReady);
  S.scan = scan; S.kind = kind; S.tabObj = tab;
}
$('recheck').addEventListener('click', runChecklist);

function status(msg, bad) { $('status').textContent = msg; $('status').classList.toggle('err', !!bad); }

$('practice-btn').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('mock.html?tickets=' + Math.max(1, selected().length || 2)) }));

function payload(list, ids) { return list.map((p, i) => ({ name: p.name, age: p.age, gender: p.gender, idType: p.idType, idNum: ids[i] || '', pp: p.idType === '2' && hasPP(p.pp) ? p.pp : undefined })); }

$('fill-btn').addEventListener('click', async () => {
  const sel = selected();
  if (!sel.length) { status('Tick at least one pilgrim in the Pilgrims tab first.', true); return; }
  const tab = await activeTab(), kind = await kindOf(tab);
  if (!kind) { status('Open the TTD Pilgrim Details page in this tab first.', true); return; }
  let scan;
  try { scan = await pageCall(tab, kind, 'ttd-scan'); } catch (e) { status('Could not read the page: ' + e.message, true); return; }
  if (!scan || !scan.ok) { status('Could not safely find the Pilgrim Details fields. Open that page, or use "Show details to copy".', true); return; }
  const warns = [];
  if (scan.rows < sel.length) warns.push(`The page shows ${scan.rows} row(s) but you selected ${sel.length}. Only the first ${scan.rows} will be filled. Change the ticket count on the page to add rows.`);
  if (scan.sectionsOk === false) warns.push('The page layout looks unusual. Check each row after filling.');
  const needIds = !S.acct.saveIds || sel.some(p => !p.idNum);
  const rowsHtml = sel.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td>${esc(p.age)}</td><td>${esc(ID_TYPES[p.idType])} ${p.idNum ? esc(maskId(p.idNum)) : ''}</td></tr>`).join('');
  const idInputs = sel.map((p, i) => p.idNum ? '' : `<label class="lbl" for="pid-${i}">${esc(p.name)}: ${esc(ID_TYPES[p.idType])} number (optional, not saved)</label><input id="pid-${i}" type="password" autocomplete="off" maxlength="12" data-type="${p.idType}">`).join('');
  modal(`<h3>Fill preview</h3>
    <p class="muted small">Will type into the text boxes only. You pick Gender and Photo ID type yourself, then the ID number is filled.</p>
    <table class="pv"><tr><th>#</th><th>Name</th><th>Age</th><th>ID</th></tr>${rowsHtml}</table>
    ${warns.map(w => `<div class="notice warn">${esc(w)}</div>`).join('')}
    ${needIds ? `<div class="muted small" style="margin-top:8px">${S.acct.saveIds ? 'Some pilgrims have no saved ID number.' : 'ID numbers are not saved on this computer.'} Type them here if you want them filled.</div>${idInputs}` : ''}
    <div class="acts"><button class="btn ghost" data-close type="button">Cancel</button><button id="m-go" class="btn primary" type="button">Fill now</button></div>`,
    (sh, close) => {
      sh.querySelectorAll('input[id^=pid-]').forEach(i => i.addEventListener('input', () => { i.value = cleanId(i.dataset.type, i.value); }));
      sh.querySelector('#m-go').addEventListener('click', async () => {
        const ids = sel.map((p, i) => { const el = sh.querySelector('#pid-' + i); return p.idNum || (el ? cleanId(p.idType, el.value) : ''); });
        const bad = sel.findIndex((p, i) => ids[i] && !!validateIdNumber(p.idType, ids[i]));
        if (bad >= 0) { status(`ID number for ${sel[bad].name} looks invalid, so it was left out.`, true); ids[bad] = ''; }
        close(); status('Filling...');
        try {
          const res = await pageCall(tab, kind, 'ttd-fill', { pilgrims: payload(sel, ids) });
          if (!res || !res.ok) { status('Nothing was filled because the fields were not clear. Use "Show details to copy".', true); return; }
          const okAll = res.nameOk.every(Boolean) && res.ageOk.every(Boolean);
          if (okAll) burst($('fill-btn'));
          status((okAll ? 'Name and Age filled.' : 'Some fields did not accept the text. Check the page.') + '\nNow pick Gender and Photo ID type yourself. The ID number fills after that.' + (res.skipped && res.skipped.length ? '\n' + res.skipped.join('\n') : ''), !okAll);
        } catch (e) { status('Fill failed: ' + e.message, true); }
      });
    });
});

// ---------- manual fallback: copy details ----------
$('copy-btn').addEventListener('click', () => {
  const sel = selected();
  if (!sel.length) { status('Tick at least one pilgrim in the Pilgrims tab first.', true); return; }
  const line = (label, val) => `<div class="cp"><span><span class="muted small">${esc(label)}</span><br><code>${esc(val)}</code></span><button class="linkbtn" data-copy="${esc(val)}" type="button">Copy</button></div>`;
  const body = sel.map((p, i) => `<h3>${i + 1}. ${esc(p.name)}</h3>${line('Name', p.name)}${line('Age', String(p.age))}${line('Gender', p.gender)}${line('ID type', ID_TYPES[p.idType])}${p.idNum ? line('ID number', p.idNum) : ''}${p.idType === '2' && p.pp ? (p.pp.country ? line('Country', p.pp.country) : '') + (p.pp.visaNo ? line('Visa/OCS number', p.pp.visaNo) : '') + (p.pp.visaType ? line('Type of Visa', p.pp.visaType) : '') + (p.pp.visaExp ? line('Visa validity date', showDate(p.pp.visaExp)) : '') : ''}`).join('');
  modal(`<h3>Details to copy</h3><p class="muted small">Click Copy, then paste into the form yourself.</p>${body}<div class="acts"><button class="btn ghost" data-close type="button">Close</button><button id="m-panel" class="btn primary" type="button">Show on the page</button></div>`,
    sh => { sh.querySelector('#m-panel').addEventListener('click', async e => {
      const tab = await activeTab(), kind = await kindOf(tab);
      if (!kind) { e.target.textContent = 'Open the TTD page first'; return; }
      try { await pageCall(tab, kind, 'ttd-panel', { pilgrims: payload(sel, sel.map(p => p.idNum || '')) }); window.close(); } catch (er) { e.target.textContent = 'Could not open'; }
    });
    sh.addEventListener('click', async e => {
      const v = e.target.dataset.copy; if (v == null) return;
      try { await navigator.clipboard.writeText(v); e.target.textContent = 'Copied'; setTimeout(() => { e.target.textContent = 'Copy'; }, 1200); } catch (er) {}
    }); });
});

// ---------- redacted problem report ----------
$('report-btn').addEventListener('click', async () => {
  const tab = await activeTab(), kind = await kindOf(tab);
  if (!kind) { status('Open the TTD page (or the practice page) in this tab first.', true); return; }
  try {
    const rep = await pageCall(tab, kind, 'ttd-report');
    await navigator.clipboard.writeText(typeof rep === 'string' ? rep : JSON.stringify(rep));
    status('Problem report copied. It contains the form structure only, no names or ID numbers. Paste it into a GitHub issue.');
  } catch (e) { status('Could not create the report: ' + e.message, true); }
});

boot();


// ---- micro-detail: PIN eye, button ripple ----
document.querySelectorAll('.eye').forEach(b => b.addEventListener('click', () => {
  const inp = document.getElementById(b.dataset.eye); const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password'; b.classList.toggle('on', show); b.setAttribute('aria-label', show ? 'Hide PIN' : 'Show PIN'); inp.focus();
}));
document.addEventListener('pointerdown', e => {
  const b = e.target.closest && e.target.closest('.btn'); if (!b || b.disabled) return;
  const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2, s = document.createElement('span');
  s.className = 'rip'; s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  b.appendChild(s); setTimeout(() => s.remove(), 600);
});


// ---- final UX pass: remembered tab, keyboard, tilt ----
$('cl-card').addEventListener('toggle', () => { S.clTouched = true; });
(function () {
  const order = ['home', 'pilgrims', 'alerts', 'settings'];
  document.addEventListener('keydown', e => {
    if ($('app').hidden || !$('modal').hidden || e.ctrlKey || e.altKey || e.metaKey) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
    const cur = order.indexOf(S.tab);
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#tabs') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      const nx = order[(cur + (e.key === 'ArrowRight' ? 1 : 3)) % 4]; switchTab(nx); document.querySelector(`#tabs [data-tab=${nx}]`).focus(); e.preventDefault(); return;
    }
    if (!typing && /^[1-4]$/.test(e.key)) switchTab(order[Number(e.key) - 1]);
  });
  // the temple scene leans a little with the pointer (transform only, off for reduced motion)
  const hd = document.querySelector('header');
  if (hd && !matchMedia('(prefers-reduced-motion: reduce)').matches) hd.addEventListener('pointermove', e => {
    const r = hd.getBoundingClientRect(); hd.style.setProperty('--mx', ((e.clientX - r.left) / r.width - .5).toFixed(3));
  });
})();
