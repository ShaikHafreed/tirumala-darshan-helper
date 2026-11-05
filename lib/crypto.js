// AES-GCM encryption with a key derived from the user's PIN (PBKDF2-SHA256).
// Uses only Web Crypto, so it runs in the extension and in Node for tests.
const enc = new TextEncoder();
const dec = new TextDecoder();
export const KDF_ITER = 600000;

export const b64 = buf => { let s = ''; new Uint8Array(buf).forEach(b => { s += String.fromCharCode(b); }); return btoa(s); };
export const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));
export const newSalt = () => b64(randomBytes(16));

export async function deriveKey(secret, saltB64, iter = KDF_ITER) {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: unb64(saltB64), iterations: iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
export const exportKey = async key => b64(await crypto.subtle.exportKey('raw', key));
export const importKey = raw => crypto.subtle.importKey('raw', unb64(raw), 'AES-GCM', true, ['encrypt', 'decrypt']);

export async function encryptJSON(key, obj) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}
export async function decryptJSON(key, rec) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv) }, key, unb64(rec.ct));
  return JSON.parse(dec.decode(pt));
}

// 128 bits of randomness, URL-safe: "ttd-" + 22 characters
export function randomTopic() {
  return 'ttd-' + b64(randomBytes(16)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// old accounts (before encryption existed) stored a PBKDF2 hash of the PIN; used once to migrate them
export async function legacyHash(pin, saltHex) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, base, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// password-protected text for export / import
export async function sealText(password, obj) {
  const salt = newSalt();
  const key = await deriveKey(password, salt);
  const rec = await encryptJSON(key, obj);
  return 'TTDHELPER1.' + btoa(JSON.stringify({ v: 1, salt, iter: KDF_ITER, ...rec }));
}
export async function openText(password, text) {
  const t = String(text || '').trim();
  if (!t.startsWith('TTDHELPER1.')) throw new Error('BAD_FORMAT');
  const o = JSON.parse(atob(t.slice('TTDHELPER1.'.length)));
  const key = await deriveKey(password, o.salt, o.iter);
  return decryptJSON(key, o);
}
