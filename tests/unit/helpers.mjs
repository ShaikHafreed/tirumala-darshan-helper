// in-memory stand-in for chrome.storage.local
export function memStore() {
  const d = {};
  return {
    d,
    async get(keys) { const o = {}; for (const k of [].concat(keys)) if (k in d) o[k] = JSON.parse(JSON.stringify(d[k])); return o; },
    async set(o) { for (const k in o) d[k] = JSON.parse(JSON.stringify(o[k])); },
    async remove(keys) { for (const k of [].concat(keys)) delete d[k]; }
  };
}
