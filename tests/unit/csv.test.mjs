import test from 'node:test'; import assert from 'node:assert/strict';
import { parsePilgrimCsv } from '../../lib/csv.js';
test('csv import', () => {
  const t = 'Name,Age,Gender,ID Type,ID Number\nAsha Rao,34,Female,Aadhaar,123456789012\n"Ravi Rao",40,M,Passport,K1234567\nBad1,0,Male,Aadhaar,';
  const a = parsePilgrimCsv(t, { saveIds: true });
  assert.equal(a.rows.length, 2); assert.equal(a.rows[0].gender, 'Female'); assert.equal(a.rows[1].idType, '2'); assert.equal(a.rows[1].gender, 'Male');
  assert.equal(a.errors.length, 1);
  assert.equal(parsePilgrimCsv(t, { saveIds: false }).rows[0].idNum, '');
  assert.ok(parsePilgrimCsv('x\ny').errors.length);
  assert.equal(parsePilgrimCsv('Name\tAge\nAsha Rao\t30').rows.length, 1);
});

test('csv: passport rows carry visa details; dd/mm/yyyy dates normalised; visa number dropped when IDs are not saved', () => {
  const txt = 'Name,Age,Gender,ID Type,Passport Number,Country,Visa Number,Visa Type,Visa Validity\nAsha Rao,40,Female,Passport,K1234567,USA,V1234567,H1B,05/01/2030';
  const a = parsePilgrimCsv(txt, { saveIds: true });
  assert.equal(a.errors.length, 0); assert.deepEqual(a.rows[0].pp, { country: 'USA', visaNo: 'V1234567', visaType: 'H1B', visaExp: '2030-01-05' });
  const b = parsePilgrimCsv(txt, { saveIds: false });
  assert.equal(b.rows[0].pp.visaNo, ''); assert.equal(b.rows[0].pp.country, 'USA');
});
