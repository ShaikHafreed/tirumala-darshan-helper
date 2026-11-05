import test from 'node:test';
import assert from 'node:assert/strict';
import { memStore } from './helpers.mjs';
import * as V from '../../lib/vault.js';
import { legacyHash } from '../../lib/crypto.js';

const P = { id: 'a1', name: 'Test Person', age: '40', gender: 'Male', idType: '1', idNum: '123412341234', selected: true };

test('create, unlock, encrypt round trip; nothing readable in storage', async () => {
  const s = memStore();
  const { acct, key } = await V.createAccount(s, { name: 'Tester', phone: '9876543210', pin: '123456' });
  await V.savePilgrims(s, acct.id, key, [P]);
  const raw = JSON.stringify(s.d);
  assert.ok(!raw.includes('Test Person') && !raw.includes('123412341234'), 'plaintext leaked into storage');
  const u = await V.unlock(s, '9876543210', '123456');
  assert.deepEqual((await V.loadPilgrims(s, acct.id, u.key))[0], P);
});

test('wrong PIN is rejected and locks out with growing delay', async () => {
  const s = memStore();
  await V.createAccount(s, { name: 'T', phone: '9876543210', pin: '123456' });
  const t0 = 1_000_000;
  for (let i = 0; i < 2; i++) await assert.rejects(V.unlock(s, '9876543210', '000000', t0), e => e.code === 'BAD_PIN');
  await assert.rejects(V.unlock(s, '9876543210', '000000', t0), e => e.code === 'BAD_PIN' && e.until === t0 + 30000);
  await assert.rejects(V.unlock(s, '9876543210', '123456', t0 + 1000), e => e.code === 'LOCKED');
  const ok = await V.unlock(s, '9876543210', '123456', t0 + 31000);
  assert.ok(ok.key);
  await assert.rejects(V.unlock(s, '9876543210', '000000', t0 + 40000), e => e.code === 'BAD_PIN' && e.fails === 1);  // counter reset
});

test('duplicate profile is refused, unknown number reported', async () => {
  const s = memStore();
  await V.createAccount(s, { name: 'T', phone: '9876543210', pin: '123456' });
  await assert.rejects(V.createAccount(s, { name: 'T', phone: '9876543210', pin: '123456' }), e => e.code === 'EXISTS');
  await assert.rejects(V.unlock(s, '9123456789', '123456'), e => e.code === 'NO_ACCOUNT');
});

test('legacy (plaintext, 120k hash) accounts migrate to encrypted storage on first login', async () => {
  const s = memStore();
  const salt = '00112233445566778899aabbccddeeff';
  await s.set({
    accounts: { '9876543210': { id: '9876543210', name: 'Old', phone: '9876543210', salt, hash: await legacyHash('1234', salt) } },
    'pilgrims:9876543210': [P],
    'deletedPilgrims:9876543210': [{ ...P, id: 'z9', name: 'Gone Person' }]
  });
  const { acct, key } = await V.unlock(s, '9876543210', '1234');
  assert.equal(acct.migrated, true); assert.equal(acct.saveIds, true); assert.equal(acct.weakPin, true);
  assert.ok(!acct.hash && !acct.salt);
  assert.ok(!JSON.stringify(s.d).includes('123412341234'), 'old plaintext still present');
  assert.equal((await V.loadPilgrims(s, acct.id, key))[0].name, 'Test Person');
  assert.equal((await V.loadArchive(s, acct.id, key))[0].name, 'Gone Person');
  assert.equal(s.d['deletedPilgrims:9876543210'], undefined);
});

test('turning off ID saving wipes stored ID numbers', async () => {
  const s = memStore();
  let { acct, key } = await V.createAccount(s, { name: 'T', phone: '9876543210', pin: '123456' });
  acct = await V.setSaveIds(s, acct, key, true);
  await V.savePilgrims(s, acct.id, key, [P]);
  await V.saveArchive(s, acct.id, key, [P]);
  acct = await V.setSaveIds(s, acct, key, false);
  assert.equal(acct.saveIds, false);
  assert.equal((await V.loadPilgrims(s, acct.id, key))[0].idNum, '');
  assert.equal((await V.loadArchive(s, acct.id, key))[0].idNum, '');
});

test('change PIN re-encrypts data; old PIN stops working', async () => {
  const s = memStore();
  const { acct, key } = await V.createAccount(s, { name: 'T', phone: '9876543210', pin: '1234' });
  await V.savePilgrims(s, acct.id, key, [P]);
  await assert.rejects(V.changePin(s, acct, key, '999999', '654321'), e => e.code === 'BAD_PIN');
  const r = await V.changePin(s, acct, key, '1234', '654321');
  assert.equal(r.acct.weakPin, false);
  await assert.rejects(V.unlock(s, '9876543210', '1234'), e => e.code === 'BAD_PIN');
  const u = await V.unlock(s, '9876543210', '654321');
  assert.equal((await V.loadPilgrims(s, acct.id, u.key))[0].name, 'Test Person');
});

test('export / import: encrypted text, wrong password rejected, duplicates skipped, IDs follow the save setting', async () => {
  const s = memStore();
  let { acct, key } = await V.createAccount(s, { name: 'T', phone: '9876543210', pin: '123456' });
  acct = await V.setSaveIds(s, acct, key, true);
  await V.savePilgrims(s, acct.id, key, [P]);
  const text = await V.exportVault(s, acct, key, 'export-pass-1');
  assert.ok(text.startsWith('TTDHELPER1.') && !text.includes('Test Person'));
  const s2 = memStore();
  let b = await V.createAccount(s2, { name: 'B', phone: '9123456789', pin: '123456' });   // saveIds off
  await assert.rejects(V.importVault(s2, b.acct, b.key, 'wrong', text), e => e.code === 'BAD_PASSWORD');
  await assert.rejects(V.importVault(s2, b.acct, b.key, 'x', 'garbage'), e => e.code === 'BAD_FORMAT');
  assert.equal(await V.importVault(s2, b.acct, b.key, 'export-pass-1', text), 1);
  assert.equal(await V.importVault(s2, b.acct, b.key, 'export-pass-1', text), 0);
  const got = await V.loadPilgrims(s2, b.acct.id, b.key);
  assert.equal(got.length, 1); assert.equal(got[0].idNum, '');
});

test('erase removes everything for the profile', async () => {
  const s = memStore();
  const { acct, key } = await V.createAccount(s, { name: 'T', phone: '9876543210', pin: '123456' });
  await V.savePilgrims(s, acct.id, key, [P]); await V.saveGroups(s, acct.id, [{ id: 'g', name: 'Family', ids: ['a1'] }]);
  await V.eraseAccount(s, acct.id);
  assert.deepEqual(Object.keys(s.d), ['accounts']); assert.deepEqual(s.d.accounts, {});
});
