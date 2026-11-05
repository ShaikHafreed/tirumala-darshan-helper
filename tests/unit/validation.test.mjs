import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanId, validatePilgrim, validPhone, validNewPin, validLegacyPin, maskId, validateIdNumber } from '../../lib/validation.js';
import { randomTopic } from '../../lib/crypto.js';

const ok = { name: 'Ravi Kumar', age: '30', gender: 'Male', idType: '1', idNum: '123456789012' };

test('Aadhaar: digits only and never more than 12', () => {
  assert.equal(cleanId('1', '1234 5678 9012 345'), '123456789012');
  assert.equal(cleanId('1', 'ab12'), '12');
});
test('Passport: letters/digits, uppercase, max 12', () => {
  assert.equal(cleanId('2', 'a-1234567890123'), 'A12345678901');
});
test('pilgrim validation rules', () => {
  assert.equal(validatePilgrim(ok), '');
  assert.match(validatePilgrim({ ...ok, name: 'R2' }), /Name/);
  assert.match(validatePilgrim({ ...ok, age: '0' }), /Age/);
  assert.match(validatePilgrim({ ...ok, age: '121' }), /Age/);
  assert.match(validatePilgrim({ ...ok, age: '3.5' }), /Age/);
  assert.match(validatePilgrim({ ...ok, idNum: '123' }), /12 digits/);
  assert.match(validatePilgrim({ ...ok, idType: '2', idNum: '12' }), /Passport/);
  assert.equal(validatePilgrim({ ...ok, idType: '2', idNum: 'A1234567' }), '');
});
test('ID number may be empty only when IDs are not saved', () => {
  assert.match(validatePilgrim({ ...ok, idNum: '' }), /12 digits/);
  assert.equal(validatePilgrim({ ...ok, idNum: '' }, { idRequired: false }), '');
  assert.match(validatePilgrim({ ...ok, idNum: '12' }, { idRequired: false }), /12 digits/);
});
test('phone and PIN rules', () => {
  assert.ok(validPhone('9876543210')); assert.ok(!validPhone('1234567890')); assert.ok(!validPhone('98765'));
  assert.ok(validNewPin('123456')); assert.ok(!validNewPin('1234')); assert.ok(!validNewPin('12345a'));
  assert.ok(validLegacyPin('1234')); assert.ok(!validLegacyPin('123'));
});
test('masking and Aadhaar-length check', () => {
  assert.equal(maskId('123456789012'), '•'.repeat(8) + '9012');
  assert.equal(validateIdNumber('1', '123456789012'), '');
});
test('ntfy topic has 128 bits (22 url-safe chars) and is unique', () => {
  const a = randomTopic(), b = randomTopic();
  assert.match(a, /^ttd-[A-Za-z0-9_-]{22}$/); assert.notEqual(a, b);
});

import { cleanPP, hasPP, validatePP, showDate, cleanVisa } from '../../lib/validation.js';
test('passport extras: cleaned, validated, shown as dd/mm/yyyy', () => {
  const pp = cleanPP({ country: ' usa 12', visaNo: 'ab-1234 56', visaType: 'H1B!', visaExp: '2030-01-05' });
  assert.deepEqual(pp, { country: 'usa', visaNo: 'AB-123456', visaType: 'H1B', visaExp: '2030-01-05' });
  assert.equal(hasPP(cleanPP({})), false);
  assert.equal(validatePP(pp), '');
  assert.match(validatePP({ ...pp, visaNo: 'A1' }), /too short/);
  assert.match(validatePP({ ...pp, visaExp: '1990-01-01' }), /wrong/);
  assert.equal(showDate('2030-01-05'), '05/01/2030'); assert.equal(cleanPP({ visaExp: 'bad' }).visaExp, '');
  assert.equal(cleanVisa('x y/9'), 'XY/9');
});
