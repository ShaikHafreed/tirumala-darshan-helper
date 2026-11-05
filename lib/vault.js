// Encrypted storage of profiles and pilgrims. `store` is anything shaped like chrome.storage.local
// ({get, set, remove}, promise based), which lets the tests use a plain in-memory object.
import { KDF_ITER, newSalt, deriveKey, encryptJSON, decryptJSON, legacyHash, sealText, openText } from './crypto.js';

export class VaultError extends Error {
  constructor(code, extra = {}) { super(code); this.code = code; Object.assign(this, extra); }
}
const LADDER = [30, 60, 300, 900];                       // seconds locked after the 3rd, 4th, 5th, 6th+ wrong PIN
const kPil = id => 'pilgrims:' + id, kArc = id => 'archive:' + id, kLock = id => 'lock:' + id, kGrp = id => 'groups:' + id;
const MARK = { ok: 'ttd-helper' };

async function accounts(store) { return (await store.get(['accounts'])).accounts || {}; }
async function putAccount(store, a) { const all = await accounts(store); all[a.id] = a; await store.set({ accounts: all }); return a; }
const checkKey = async (key, acct) => { try { return (await decryptJSON(key, acct.verifier)).ok === MARK.ok; } catch (e) { return false; } };
const isEncrypted = r => r && typeof r === 'object' && 'ct' in r && 'iv' in r;

async function decryptList(key, arr) {
  const out = [];
  for (const r of arr || []) { try { out.push(await decryptJSON(key, r)); } catch (e) { /* skip unreadable record */ } }
  return out;
}
async function encryptList(key, list) { const out = []; for (const p of list) out.push(await encryptJSON(key, p)); return out; }

export async function listAccounts(store) { return Object.values(await accounts(store)); }
export async function getAccount(store, id) { return (await accounts(store))[id] || null; }

export async function createAccount(store, { name, phone, pin, now = Date.now() }) {
  const all = await accounts(store);
  if (all[phone]) throw new VaultError('EXISTS');
  const kSalt = newSalt();
  const key = await deriveKey(pin, kSalt);
  const acct = { id: phone, name, phone, kSalt, iter: KDF_ITER, verifier: await encryptJSON(key, MARK),
                 saveIds: false, idConsent: 0, weakPin: pin.length < 6, created: now };
  await putAccount(store, acct);
  // the very first profile adopts pilgrims saved by the oldest versions (before profiles existed)
  if (Object.keys(all).length === 0) {
    const old = await store.get(['pilgrims', 'deletedPilgrims']);
    if (Array.isArray(old.pilgrims) && old.pilgrims.length) {
      const list = old.pilgrims.filter(p => !isEncrypted(p));
      await store.set({ [kPil(phone)]: await encryptList(key, list) });
      if (list.some(p => p.idNum)) await putAccount(store, { ...acct, saveIds: true, idConsent: now });
    }
    if (Array.isArray(old.deletedPilgrims) && old.deletedPilgrims.length)
      await store.set({ [kArc(phone)]: await encryptList(key, old.deletedPilgrims) });
    await store.remove(['pilgrims', 'deletedPilgrims']);
  }
  return { acct: await getAccount(store, phone), key };
}

async function migrateLegacy(store, acct, pin, now) {
  const kSalt = newSalt();
  const key = await deriveKey(pin, kSalt);
  const old = await store.get([kPil(acct.id), 'deletedPilgrims:' + acct.id]);
  const plain = (old[kPil(acct.id)] || []).filter(p => !isEncrypted(p));
  const arch = old['deletedPilgrims:' + acct.id] || [];
  const hasIds = plain.some(p => p.idNum);
  const next = { ...acct, kSalt, iter: KDF_ITER, verifier: await encryptJSON(key, MARK),
                 saveIds: hasIds, idConsent: hasIds ? now : 0, weakPin: pin.length < 6, migrated: true };
  delete next.hash; delete next.salt;
  await store.set({ [kPil(acct.id)]: await encryptList(key, plain), [kArc(acct.id)]: await encryptList(key, arch) });
  await store.remove(['deletedPilgrims:' + acct.id]);
  await putAccount(store, next);
  return key;
}

export async function unlock(store, phone, pin, now = Date.now()) {
  const acct = await getAccount(store, phone);
  if (!acct) throw new VaultError('NO_ACCOUNT');
  const lock = (await store.get([kLock(phone)]))[kLock(phone)] || { fails: 0, until: 0 };
  if (lock.until > now) throw new VaultError('LOCKED', { until: lock.until });
  let key = null, ok = false;
  if (acct.verifier) {
    key = await deriveKey(pin, acct.kSalt, acct.iter || KDF_ITER);
    ok = await checkKey(key, acct);
  } else if (acct.hash && acct.salt) {
    ok = (await legacyHash(pin, acct.salt)) === acct.hash;
    if (ok) key = await migrateLegacy(store, acct, pin, now);
  }
  if (!ok) {
    const fails = lock.fails + 1;
    const until = fails >= 3 ? now + LADDER[Math.min(fails - 3, LADDER.length - 1)] * 1000 : 0;
    await store.set({ [kLock(phone)]: { fails, until } });
    throw new VaultError('BAD_PIN', { fails, until });
  }
  await store.remove([kLock(phone)]);
  return { acct: await getAccount(store, phone), key };
}

export async function loadPilgrims(store, id, key) { return decryptList(key, (await store.get([kPil(id)]))[kPil(id)]); }
export async function savePilgrims(store, id, key, list) { await store.set({ [kPil(id)]: await encryptList(key, list) }); }
export async function loadArchive(store, id, key) { return decryptList(key, (await store.get([kArc(id)]))[kArc(id)]); }
export async function saveArchive(store, id, key, list) { await store.set({ [kArc(id)]: await encryptList(key, list) }); }
export async function loadGroups(store, id) { return (await store.get([kGrp(id)]))[kGrp(id)] || []; }
export async function saveGroups(store, id, groups) { await store.set({ [kGrp(id)]: groups }); }

// turning ID saving off wipes every stored ID number
export async function setSaveIds(store, acct, key, on, now = Date.now()) {
  if (!on) {
    const strip = l => l.map(p => ({ ...p, idNum: '', pp: p.pp ? { ...p.pp, visaNo: '' } : p.pp }));
    await savePilgrims(store, acct.id, key, strip(await loadPilgrims(store, acct.id, key)));
    await saveArchive(store, acct.id, key, strip(await loadArchive(store, acct.id, key)));
  }
  return putAccount(store, { ...acct, saveIds: !!on, idConsent: on ? now : acct.idConsent });
}

export async function changePin(store, acct, key, oldPin, newPin) {
  const oldKey = await deriveKey(oldPin, acct.kSalt, acct.iter || KDF_ITER);
  if (!(await checkKey(oldKey, acct))) throw new VaultError('BAD_PIN');
  const pil = await loadPilgrims(store, acct.id, key), arc = await loadArchive(store, acct.id, key);
  const kSalt = newSalt();
  const nk = await deriveKey(newPin, kSalt);
  await savePilgrims(store, acct.id, nk, pil);
  await saveArchive(store, acct.id, nk, arc);
  const next = await putAccount(store, { ...acct, kSalt, iter: KDF_ITER, verifier: await encryptJSON(nk, MARK), weakPin: newPin.length < 6 });
  return { acct: next, key: nk };
}

export async function exportVault(store, acct, key, password) {
  const list = await loadPilgrims(store, acct.id, key);
  return sealText(password, { v: 1, at: Date.now(), pilgrims: list });
}
export async function importVault(store, acct, key, password, text) {
  let data;
  try { data = await openText(password, text); } catch (e) { throw new VaultError(e.message === 'BAD_FORMAT' ? 'BAD_FORMAT' : 'BAD_PASSWORD'); }
  const cur = await loadPilgrims(store, acct.id, key);
  const same = (a, b) => a.name.toLowerCase() === b.name.toLowerCase() && String(a.age) === String(b.age);
  let added = 0;
  for (const p of data.pilgrims || []) {
    if (cur.length >= 30 || cur.some(c => same(c, p))) continue;
    cur.push({ ...p, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), selected: false, idNum: acct.saveIds ? (p.idNum || '') : '' });
    added++;
  }
  await savePilgrims(store, acct.id, key, cur);
  return added;
}

export async function eraseAccount(store, id) {
  const all = await accounts(store); delete all[id];
  await store.set({ accounts: all });
  await store.remove([kPil(id), kArc(id), kLock(id), kGrp(id), 'deletedPilgrims:' + id]);
}
export const verifyKey = checkKey;
