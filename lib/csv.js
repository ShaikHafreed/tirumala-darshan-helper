// Parses pilgrim rows from pasted spreadsheet text (CSV or tab-separated, first row = headers).
import { GENDERS, validatePilgrim, cleanName, cleanId, cleanPP, hasPP, validatePP } from './validation.js';
// accepts yyyy-mm-dd or dd/mm/yyyy (also - and .)
const normDate = s => { s = String(s || '').trim(); let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`; m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
const ALIAS = { name: ['name', 'full name', 'fullname', 'pilgrim'], age: ['age'], gender: ['gender', 'sex'],
  idType: ['id type', 'idtype', 'photo id', 'photo id type', 'id proof'], idNum: ['id number', 'idnumber', 'id no', 'id', 'aadhaar', 'aadhaar number', 'passport number'],
  country: ['country', 'passport country'], visaNo: ['visa number', 'visa/ocs number', 'visa no', 'ocs number'], visaType: ['visa type', 'type of visa'], visaExp: ['visa validity', 'visa validity date', 'visa expiry', 'visa valid till'] };
function splitLine(line, sep) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === sep) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out.map(x => x.trim());
}
export function parsePilgrimCsv(text, { saveIds = false } = {}) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { rows: [], errors: ['Need a header row and at least one data row.'] };
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const head = splitLine(lines[0], sep).map(h => h.toLowerCase());
  const col = {}; for (const k in ALIAS) col[k] = head.findIndex(h => ALIAS[k].includes(h));
  if (col.name < 0 || col.age < 0) return { rows: [], errors: ['Headers must include Name and Age.'] };
  const rows = [], errors = [];
  lines.slice(1).forEach((l, i) => {
    const c = splitLine(l, sep), get = k => (col[k] >= 0 ? c[col[k]] || '' : '');
    const g = get('gender').toLowerCase();
    const gender = GENDERS.find(x => x.toLowerCase() === g || (g && x.toLowerCase().startsWith(g[0]) && g.length === 1)) || 'Male';
    const idType = /pass/i.test(get('idType')) ? '2' : '1';
    const p = { name: cleanName(get('name')), age: String(get('age')).trim(), gender, idType, idNum: saveIds ? cleanId(idType, get('idNum')) : '' };
    if (idType === '2') { const pp = cleanPP({ country: get('country'), visaNo: saveIds ? get('visaNo') : '', visaType: get('visaType'), visaExp: normDate(get('visaExp')) }); if (hasPP(pp)) p.pp = pp; }
    const bad = validatePilgrim(p, { idRequired: false }) || (p.pp ? validatePP(p.pp) : '');
    if (bad) errors.push(`Row ${i + 2}: ${bad}`); else rows.push(p);
  });
  return { rows, errors };
}
