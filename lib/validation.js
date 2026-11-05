// Pure validation helpers (no browser APIs), shared by the popup and the tests.
export const ID_TYPES = { '1': 'Aadhaar', '2': 'Passport' };
export const GENDERS = ['Male', 'Female', 'Transgender'];

export const cleanName = s => String(s || '').replace(/\s+/g, ' ').trim();
export const validPhone = p => /^[6-9]\d{9}$/.test(String(p || ''));
export const validNewPin = p => /^\d{6}$/.test(String(p || ''));
export const validLegacyPin = p => /^\d{4,6}$/.test(String(p || ''));

// keeps only what the ID type allows, and caps the length
export function cleanId(type, value) {
  const v = String(value || '');
  return type === '2'
    ? v.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12)
    : v.replace(/\D/g, '').slice(0, 12);
}

export function validateIdNumber(type, num) {
  if (type === '1' && !/^\d{12}$/.test(num)) return 'Aadhaar number must be exactly 12 digits.';
  if (type === '2' && !/^[A-Za-z0-9]{6,12}$/.test(num)) return 'Passport number: 6 to 12 letters or digits.';
  return '';
}

// idRequired=false means the ID number may be left empty (it is not saved on this computer)
export function validatePilgrim(p, { idRequired = true } = {}) {
  const name = cleanName(p.name);
  if (!/^[A-Za-z ]{2,80}$/.test(name)) return 'Name: letters and spaces only (2 to 80 characters).';
  const age = Number(p.age);
  if (!Number.isInteger(age) || age < 1 || age > 120) return 'Age must be a whole number from 1 to 120.';
  if (!GENDERS.includes(p.gender)) return 'Choose a gender.';
  if (!ID_TYPES[p.idType]) return 'Choose a photo ID type.';
  if (idRequired || p.idNum) return validateIdNumber(p.idType, p.idNum || '');
  return '';
}

export const maskId = n => (!n ? '' : n.length > 4 ? '•'.repeat(n.length - 4) + n.slice(-4) : n);

// ---- passport extras (only used by NRI / foreign passport holders on the TTD pop-up) ----
export const cleanVisa = s => String(s || '').replace(/[^A-Za-z0-9/-]/g, '').toUpperCase().slice(0, 20);
export const cleanWords = (s, n = 40, digits = false) => String(s || '').replace(digits ? /[^A-Za-z0-9 .,'/-]/g : /[^A-Za-z .,'/-]/g, '').replace(/\s+/g, ' ').trimStart().slice(0, n);
export const cleanPP = pp => ({
  country: cleanWords(pp && pp.country).trim(), visaNo: cleanVisa(pp && pp.visaNo),
  visaType: cleanWords(pp && pp.visaType, 40, true).trim(), visaExp: /^\d{4}-\d{2}-\d{2}$/.test(String(pp && pp.visaExp || '')) ? pp.visaExp : '' });
export const hasPP = pp => !!pp && !!(pp.country || pp.visaNo || pp.visaType || pp.visaExp);
export function validatePP(pp) {
  if (!hasPP(pp)) return '';
  if (pp.visaNo && pp.visaNo.length < 4) return 'Visa/OCS number looks too short.';
  if (pp.visaExp) {
    const d = new Date(pp.visaExp + 'T00:00:00');
    if (isNaN(d) || d.getFullYear() < 2000 || d.getFullYear() > 2100) return 'Visa validity date looks wrong.';
  }
  return '';
}
// dd/mm/yyyy, the way the TTD page shows dates
export const showDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s.split('-').reverse().join('/') : '';
