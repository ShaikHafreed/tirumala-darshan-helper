// End-to-end tests of fill.js against the bundled practice page, in a real Chromium.
// Run: node tests/e2e/fill.e2e.cjs   (needs `npm i playwright` and a Chromium)
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');
const URL = q => 'file://' + path.resolve(__dirname, '../../mock.html') + (q || '');
const P = [
  { name: 'Ravi Kumar', age: '41', gender: 'Male', idType: '1', idNum: '123412341234' },
  { name: 'Lakshmi Devi', age: '38', gender: 'Female', idType: '2', idNum: 'K1234567' },
  { name: 'Third Person', age: '12', gender: 'Male', idType: '1', idNum: '999988887777' }
];
let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); console.log('  ok  ', name); passed++; } catch (e) { console.log('  FAIL', name, '\n      ', e.message.split('\n')[0]); failed++; }
}

(async () => {
  const browser = await chromium.launch();
  const open = async q => { const pg = await browser.newPage(); await pg.goto(URL(q)); return pg; };
  const pick = async (pg, row, col, text) => {                 // real (trusted) clicks, like a person
    const inputs = pg.locator(`input[name="${col}"]`);
    await inputs.nth(row).click();
    await pg.locator('.opts div', { hasText: text }).first().click();
  };

  await t('scan: finds 2 rows by attribute, logged in, rows separate', async () => {
    const pg = await open('?tickets=2');
    const s = await pg.evaluate(() => window.__ttdScan());
    assert.equal(s.ok, true); assert.equal(s.how, 'attribute'); assert.equal(s.rows, 2);
    assert.equal(s.loggedIn, true); assert.equal(s.sectionsOk, true);
    await pg.close();
  });

  await t('control: plain .value assignment is ignored by the practice form (like the real site)', async () => {
    const pg = await open('?tickets=1');
    await pg.evaluate(() => { const el = document.querySelector('input[name="fname"]'); el.value = 'Plain Set'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await pg.waitForTimeout(100);
    assert.equal((await pg.evaluate(() => window.__mockState()))[0].name, '');
    await pg.close();
  });

  await t('control: scripted clicks do not open the dropdown, real clicks do', async () => {
    const pg = await open('?tickets=1');
    await pg.evaluate(() => document.querySelector('input[name="gender"]').click());
    assert.equal(await pg.locator('.opts div').count(), 0);
    await pg.locator('input[name="gender"]').click();
    assert.ok(await pg.locator('.opts div').count() >= 3);
    await pg.close();
  });

  await t('fill: Name and Age typed and kept for 2 pilgrims; dropdowns untouched', async () => {
    const pg = await open('?tickets=2');
    const r = await pg.evaluate(p => window.__ttdFill(p), P.slice(0, 2));
    assert.equal(r.ok, true); assert.deepEqual(r.nameOk, [true, true]); assert.deepEqual(r.ageOk, [true, true]);
    const st = await pg.evaluate(() => window.__mockState());
    assert.equal(st[0].name, 'Ravi Kumar'); assert.equal(st[0].age, '41');
    assert.equal(st[1].name, 'Lakshmi Devi'); assert.equal(st[1].age, '38');
    assert.equal(st[0].gender, ''); assert.equal(st[0].idType, '');
    await pg.close();
  });

  await t('full flow: user picks dropdowns, ID numbers fill themselves, form is VALID', async () => {
    const pg = await open('?tickets=2');
    await pg.evaluate(p => { window.__ttdFill(p); }, P.slice(0, 2));
    await pg.waitForTimeout(500);
    await pick(pg, 0, 'gender', 'Male'); await pick(pg, 0, 'photoIdType', 'Aadhaar');
    await pick(pg, 1, 'gender', 'Female'); await pick(pg, 1, 'photoIdType', 'Passport');
    await pg.waitForTimeout(700);
    await pg.click('#ppsub');
    await pg.waitForTimeout(300);
    await pg.click('#continue');
    const out = await pg.textContent('#result');
    assert.ok(out.startsWith('VALID'), out);
    const st = await pg.evaluate(() => window.__mockState());
    assert.equal(st[0].idNum, '123412341234'); assert.equal(st[1].idNum, 'K1234567');
    assert.match(await pg.textContent('#ttd-assistant-banner'), /All fields filled/);
    await pg.close();
  });

  await t('more pilgrims than rows: fills the rows that exist and says so', async () => {
    const pg = await open('?tickets=1');
    const r = await pg.evaluate(p => window.__ttdFill(p), P);
    assert.equal(r.rows, 1); assert.equal(r.total, 3);
    assert.match(await pg.textContent('#ttd-assistant-banner'), /1 row\(s\) but you selected 3/);
    await pg.close();
  });

  await t('invalid data is skipped, not typed', async () => {
    const pg = await open('?tickets=1');
    const r = await pg.evaluate(() => window.__ttdFill([{ name: 'R2D2', age: '500', idType: '1', idNum: '123412341234' }]));
    assert.equal(r.nameOk[0], false); assert.equal(r.ageOk[0], false); assert.equal(r.skipped.length, 2);
    assert.deepEqual((await pg.evaluate(() => window.__mockState()))[0].name, '');
    await pg.close();
  });

  await t('fallback to label matching when field names change', async () => {
    const pg = await open('?tickets=2&noattr=1');
    const r = await pg.evaluate(p => window.__ttdFill(p), P.slice(0, 2));
    assert.equal(r.how, 'label'); assert.equal(r.ok, true);
    assert.equal((await pg.evaluate(() => window.__mockState()))[1].name, 'Lakshmi Devi');
    await pg.close();
  });

  await t('position fallback is used only when names and labels are both gone, and every column looks right', async () => {
    const pg = await open('?tickets=2&noattr=1&nolabel=1');
    const r = await pg.evaluate(p => window.__ttdFill(p), P.slice(0, 2));
    assert.equal(r.how, 'position'); assert.equal(r.ok, true);
    assert.equal((await pg.evaluate(() => window.__mockState()))[0].age, '41');
    await pg.close();
  });

  await t('refuses to guess: position fallback with columns that look wrong fills nothing', async () => {
    const pg = await open('?tickets=2&noattr=1&nolabel=1&badshape=1');
    const r = await pg.evaluate(p => window.__ttdFill(p), P.slice(0, 2));
    assert.equal(r.ok, false); assert.equal(r.reason, 'fields');
    const st = await pg.evaluate(() => window.__mockState());
    assert.ok(st.every(x => !x.name && !x.age));
    assert.match(await pg.textContent('#ttd-assistant-banner'), /nothing was filled/);
    await pg.close();
  });

  await t('passport pop-up: text boxes filled, date left for the user, banner guides', async () => {
    const pg = await open('?tickets=1');
    const pp = { country: 'USA', visaNo: 'V1234567', visaType: 'H1B', visaExp: '2030-01-01' };
    await pg.evaluate(p => { window.__ttdFill(p); }, [{ name: 'Nri Person', age: '45', gender: 'Male', idType: '2', idNum: 'P7654321', pp }]);
    await pg.waitForTimeout(300);
    await pick(pg, 0, 'gender', 'Male'); await pick(pg, 0, 'photoIdType', 'Passport');
    await pg.waitForTimeout(900);
    const st = (await pg.evaluate(() => window.__mockState()))[0];
    assert.equal(st.pp.passport, 'P7654321'); assert.equal(st.pp.country, 'USA'); assert.equal(st.pp.visaNo, 'V1234567'); assert.equal(st.pp.visaType, 'H1B');
    assert.ok(!st.pp.visaExp, 'date must be left to the user');
    assert.match(await pg.textContent('#ttd-assistant-banner'), /Visa Validity Date: 01\/01\/2030/);
    await pg.locator('input[formcontrolname="visaValidity"]').click();
    await pg.waitForTimeout(500);
    assert.match(await pg.textContent('#ttd-assistant-banner'), /all filled/);
    await pg.close();
  });

  await t('passport pop-up: no saved extras, only the passport number is filled', async () => {
    const pg = await open('?tickets=1');
    await pg.evaluate(p => { window.__ttdFill(p); }, [{ name: 'Nri Person', age: '45', gender: 'Male', idType: '2', idNum: 'P7654321' }]);
    await pick(pg, 0, 'gender', 'Male'); await pick(pg, 0, 'photoIdType', 'Passport');
    await pg.waitForTimeout(900);
    const st = (await pg.evaluate(() => window.__mockState()))[0];
    assert.equal(st.pp.passport, 'P7654321'); assert.ok(!st.pp.country && !st.pp.visaNo);
    assert.match(await pg.textContent('#ttd-assistant-banner'), /Country \(type it\)/);
    await pg.close();
  });

  await t('wrong page: no form found, nothing filled, clear message', async () => {
    const pg = await open('?empty=1');
    const s = await pg.evaluate(() => window.__ttdScan());
    assert.equal(s.ok, false); assert.equal(s.rows, 0);
    const r = await pg.evaluate(p => window.__ttdFill(p), P);
    assert.equal(r.ok, false);
    await pg.close();
  });

  await t('report never contains any typed value', async () => {
    const pg = await open('?tickets=2');
    await pg.evaluate(p => window.__ttdFill(p), P.slice(0, 2));
    const rep = await pg.evaluate(() => window.__ttdReport());
    for (const secret of ['Ravi', 'Kumar', 'Lakshmi', '123412341234', 'K1234567', '41']) assert.ok(!rep.includes(`"${secret}"`) && !rep.includes(secret + ' ') , 'leaked ' + secret);
    const j = JSON.parse(rep);
    assert.equal(j.strategy, 'attribute'); assert.equal(j.rows, 2); assert.ok(j.controls.length >= 10);
    assert.ok(!('value' in j.controls[0]));
    await pg.close();
  });

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
