// Runs inside the TTD page (or the bundled practice page). Exposes:
//   window.__ttdScan()           what can be found on the page (no values are read or sent anywhere)
//   window.__ttdFill(pilgrims)   types Name and Age, then fills the ID number after the user picks the ID type
//   window.__ttdReport()         a redacted description of the form for bug reports (never any values)
(function () {
  const VERSION = '1.0.0';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => (s || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = el => !!el && el.offsetParent !== null;
  const innermost = list => list.filter(c => !list.some(o => o !== c && o.contains(c)));
  const KEYS = ['name', 'age', 'gender', 'idType', 'idNum'];
  const ATTR = { fname: 'name', age: 'age', gender: 'gender', photoidtype: 'idType', idproofnumber: 'idNum' };
  const LABELS = { name: 'Name', age: 'Age', gender: 'Gender', idType: 'Photo ID Proof', idNum: 'Photo Id Number' };

  // ---------- finding the fields: three strategies, each one checked before it is trusted ----------
  function textLabels(t) {
    const out = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) if (n.parentElement && norm(n.nodeValue) === t) out.push(n.parentElement);
    return out;
  }
  const emptyCols = () => ({ name: [], age: [], gender: [], idType: [], idNum: [] });
  const docOrder = (a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;

  function byAttr() {
    const cols = emptyCols();
    document.querySelectorAll('input, select, textarea').forEach(c => {
      const k = ATTR[(c.getAttribute('name') || '').toLowerCase()];
      if (k) cols[k].push(c);
    });
    return cols;
  }
  function controlsByLabel(labelText) {
    const found = [];
    textLabels(norm(labelText)).forEach(l => {
      let node = l;
      for (let i = 0; i < 6 && node; i++) {
        node = node.parentElement;
        if (!node) break;
        const c = innermost(Array.from(node.querySelectorAll('input, select, textarea'))).find(x => x.type !== 'hidden');
        if (c) { if (!found.includes(c)) found.push(c); break; }
      }
    });
    return found.sort(docOrder);
  }
  function byLabel() { const cols = emptyCols(); KEYS.forEach(k => { cols[k] = controlsByLabel(LABELS[k]); }); return cols; }
  function byPosition() {
    const heading = textLabels('pilgrim details')[0];
    let controls = Array.from(document.querySelectorAll('input, select, textarea')).filter(c => c.type !== 'hidden' && visible(c));
    if (heading) controls = controls.filter(c => heading.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
    const cols = emptyCols();
    controls.forEach((c, i) => { if (i < 30) cols[KEYS[i % 5]].push(c); });
    return cols;
  }
  const balanced = cols => cols.name.length > 0 && KEYS.every(k => cols[k].length === cols.name.length);
  // a guess by position is only accepted when every column looks like what it should be
  const shapeOk = cols =>
    cols.name.every(c => !c.readOnly && c.type !== 'number') &&
    cols.age.every(c => c.type === 'number' || /num/i.test(c.inputMode || '')) &&
    cols.gender.every(c => c.readOnly) && cols.idType.every(c => c.readOnly) &&
    cols.idNum.every(c => !c.readOnly);

  const lca = (a, b) => { let n = a; while (n && !n.contains(b)) n = n.parentElement; return n; };
  // every pilgrim's 5 fields must sit together, away from the other pilgrims' fields
  function sectionsOk(cols, n) {
    if (n < 2) return true;
    for (let i = 0; i < n; i++) {
      const mine = KEYS.map(k => cols[k][i]);
      let root = mine[0];
      mine.forEach(c => { root = lca(root, c); });
      if (!root) return false;
      for (let j = 0; j < n; j++) if (j !== i && KEYS.some(k => root.contains(cols[k][j]))) return false;
    }
    return true;
  }

  function resolve() {
    const tried = [];
    for (const [how, fn] of [['attribute', byAttr], ['label', byLabel], ['position', byPosition]]) {
      const cols = fn();
      if (!balanced(cols)) { tried.push(`${how}: not found or uneven`); continue; }
      if (how === 'position' && !shapeOk(cols)) { tried.push('position: fields do not look right'); continue; }
      const secOk = sectionsOk(cols, cols.name.length);
      if (how === 'position' && !secOk) { tried.push('position: pilgrim rows are not separate'); continue; }
      return { how, cols, n: cols.name.length, secOk, tried };
    }
    return { how: null, cols: null, n: 0, secOk: false, tried };
  }
  const hasText = t => textLabels(t).length > 0;

  window.__ttdScan = function () {
    const r = resolve();
    const loggedIn = hasText('log out') ? true : (hasText('login') || hasText('log in') || hasText('sign in')) ? false : null;
    const fields = [];
    for (let i = 0; i < r.n; i++) {
      const f = { i };
      KEYS.forEach(k => { const c = r.cols[k][i]; f[k] = { filled: String(c.value || '').trim() !== '', disabled: !!c.disabled }; });
      fields.push(f);
    }
    return { version: VERSION, ok: !!r.how, how: r.how, rows: r.n, sectionsOk: r.secOk, tried: r.tried, loggedIn, fields };
  };

  // ---------- typing like a real keyboard ----------
  function typeInto(el, v) {
    v = String(v);
    el.focus();
    try { el.select(); } catch (e) {}
    let ok = false;
    try { ok = document.execCommand('insertText', false, v); } catch (e) {}
    if (!ok || el.value !== v) {                       // fallback: the browser's own setter + events
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  const isFilled = el => !!el && String(el.value || '').trim() !== '';
  async function typeVerified(el, v) {
    for (let attempt = 0; attempt < 5; attempt++) {
      el.focus();
      typeInto(el, v);
      await sleep(attempt === 0 ? 70 : 150);
      if (el.value === String(v)) return true;
    }
    return false;
  }

  function banner(text, state) {
    let b = document.getElementById('ttd-assistant-banner');
    if (!b) {
      b = document.createElement('div');
      b.id = 'ttd-assistant-banner';
      b.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:620px;padding:12px 16px;border-radius:10px;font:14px Arial,sans-serif;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.35);cursor:pointer;';
      b.title = 'Click to dismiss';
      b.onclick = () => b.remove();
      document.body.appendChild(b);
    }
    b.style.background = state === 'done' ? '#1e8449' : state === 'error' ? '#b03a2e' : '#5B2C6F';
    b.textContent = text;
  }


  // ---------- Passport pop-up ("Photo ID Proof Instructions"): fills only its text boxes ----------
  const PPK = [['visaType', /type\s*of\s*visa|visa\s*type/], ['visaExp', /validity|valid\s*(till|upto)|expiry/], ['visaNo', /visa|ocs/], ['passport', /passport/], ['country', /country/]];
  function ppLabel(c) {
    const own = [c.placeholder, c.getAttribute('aria-label'), c.getAttribute('formcontrolname'), c.getAttribute('name'), c.id].filter(Boolean).join(' ');
    let n = c, txt = '';
    for (let i = 0; i < 4 && n && !txt; i++) {
      n = n.parentElement;
      const l = n && Array.from(n.querySelectorAll('label, mat-label, .mat-form-field-label, span')).find(x => !x.contains(c) && norm(x.textContent).length > 2 && norm(x.textContent).length < 40);
      if (l) txt = l.textContent;
    }
    return norm(own + ' ' + txt);
  }
  function ppModal() {
    const h = textLabels('photo id proof instructions').find(visible);
    if (!h) return null;
    let n = h;
    for (let i = 0; i < 8 && n; i++) {
      n = n.parentElement; if (!n) break;
      const ins = Array.from(n.querySelectorAll('input')).filter(c => c.type !== 'hidden' && visible(c));
      if (ins.length >= 3) {
        const f = {};
        ins.forEach(c => { const t = ppLabel(c); const hit = PPK.find(([, re]) => re.test(t)); if (hit && !f[hit[0]]) f[hit[0]] = c; });
        return f;
      }
    }
    return null;
  }
  const PPNAME = { passport: 'Passport Number', country: 'Country', visaNo: 'Visa/OCS Number', visaType: 'Type of Visa', visaExp: 'Visa Validity Date' };
  // returns a hint for the banner while the pop-up is open, or '' when it is closed
  function passportStep(pilgrims, rows, cols) {
    const st = window.__ttdPP || (window.__ttdPP = { done: new Set(), tried: new Set(), who: -1 });
    const f = ppModal();
    if (!f) { if (st.who >= 0 && st.tried.size) st.done.add(st.who); st.who = -1; st.tried.clear(); return ''; }
    if (st.who < 0) {
      for (let i = 0; i < rows; i++) if (!st.done.has(i) && cols.idType[i] && /passport|^2$/i.test(cols.idType[i].value || '')) { st.who = i; break; }
      if (st.who < 0) return '';
    }
    const P = pilgrims[st.who], pp = P.pp || {}, left = [];
    const want = { passport: P.idNum, country: pp.country, visaNo: pp.visaNo, visaType: pp.visaType };
    for (const k of ['passport', 'country', 'visaNo', 'visaType']) {
      const el = f[k]; if (!el) continue;
      if (want[k] && !el.readOnly && !el.disabled && !isFilled(el) && !st.tried.has(k)) { st.tried.add(k); typeInto(el, want[k]); }
      if (isFilled(el)) el.style.outline = want[k] && String(el.value).toLowerCase() === String(want[k]).toLowerCase() ? '3px solid #1e8449' : (want[k] ? '3px solid #F28C28' : '');
      else { el.style.outline = '3px solid #F28C28'; left.push(PPNAME[k] + (want[k] ? '' : ' (type it)')); }
    }
    const d = f.visaExp;
    if (d) { if (isFilled(d)) d.style.outline = '3px solid #1e8449'; else { d.style.outline = '3px solid #F28C28'; left.push('Visa Validity Date' + (pp.visaExp ? ': ' + pp.visaExp.split('-').reverse().join('/') : '')); } }
    return `Passport pop-up (pilgrim ${st.who + 1}): ` + (left.length ? 'still to do: ' + left.join(', ') + '. ' : 'all filled. Click Submit yourself. ');
  }

  // ---------- fill ----------
  const okName = s => /^[A-Za-z ]{2,80}$/.test(String(s || ''));
  const okAge = s => Number.isInteger(Number(s)) && Number(s) >= 1 && Number(s) <= 120;

  window.__ttdFill = async function (pilgrims) {
    if (window.__ttdWatch) clearInterval(window.__ttdWatch);
    window.__ttdPP = null;
    const r = resolve();
    if (!r.how) {
      banner('Could not safely identify the Pilgrim Details fields, so nothing was filled. Open the Pilgrim Details page, or fill the fields yourself (the extension can show your details to copy).', 'error');
      return { ok: false, reason: 'fields', tried: r.tried };
    }
    const cols = r.cols, rows = Math.min(pilgrims.length, r.n);
    const nameOk = [], ageOk = [], skipped = [];
    for (let i = 0; i < rows; i++) {
      const p = pilgrims[i];
      if (okName(p.name)) nameOk.push(await typeVerified(cols.name[i], p.name)); else { nameOk.push(false); skipped.push(`Pilgrim ${i + 1}: Name looks invalid`); }
      if (okAge(p.age))   ageOk.push(await typeVerified(cols.age[i], p.age));    else { ageOk.push(false);  skipped.push(`Pilgrim ${i + 1}: Age looks invalid`); }
    }
    const extra = pilgrims.length > rows
      ? ` The page shows ${rows} row(s) but you selected ${pilgrims.length}: change the ticket count to add rows.` : '';
    const started = Date.now();
    const pending = () => {
      const todo = [];
      for (let i = 0; i < rows; i++) {
        if (!isFilled(cols.name[i]))   todo.push(`Pilgrim ${i + 1}: Name`);
        if (!isFilled(cols.age[i]))    todo.push(`Pilgrim ${i + 1}: Age`);
        if (!isFilled(cols.gender[i])) todo.push(`Pilgrim ${i + 1}: Gender`);
        if (!isFilled(cols.idType[i])) todo.push(`Pilgrim ${i + 1}: Photo ID Proof`);
        if (!isFilled(cols.idNum[i]))  todo.push(`Pilgrim ${i + 1}: ID number` + (pilgrims[i].idNum ? '' : ' (type it yourself)'));
      }
      return todo;
    };
    banner('Name and Age filled. Please pick Gender and Photo ID Proof yourself (the site only accepts your own clicks there). The ID number fills automatically after you choose the ID type.' + extra, 'info');

    window.__ttdWatch = setInterval(() => {
      for (let i = 0; i < rows; i++) {
        if (cols.name[i] && !isFilled(cols.name[i]) && okName(pilgrims[i].name) && !window.__ttdRetry) {
          window.__ttdRetry = true;
          typeVerified(cols.name[i], pilgrims[i].name).finally(() => { window.__ttdRetry = false; });
        }
        const el = cols.idNum[i];
        if (el && pilgrims[i].idNum && !el.disabled && !isFilled(el) && isFilled(cols.idType[i])) typeInto(el, pilgrims[i].idNum);
      }
      const todo = pending();
      let hint = '';
      const ppHint = passportStep(pilgrims, rows, cols);
      for (let i = 0; i < rows; i++) {
        const P = pilgrims[i], ID = { '1': 'Aadhaar', '2': 'Passport' };
        for (const [k, el, want] of [['name', cols.name[i], P.name], ['age', cols.age[i], P.age], ['idNum', cols.idNum[i], P.idNum]]) {
          if (el && isFilled(el)) el.style.outline = String(el.value) === String(want) ? '3px solid #1e8449' : (want ? '3px solid #b03a2e' : '');
        }
        for (const [k, el, want] of [['Gender', cols.gender[i], P.gender], ['Photo ID type', cols.idType[i], ID[P.idType]]]) {
          if (!el) continue;
          if (isFilled(el)) el.style.outline = '3px solid #1e8449';
          else { el.style.outline = '3px solid #F28C28'; if (!hint) hint = `Pick ${k}: ${want || ''} (pilgrim ${i + 1}). `; }
        }
      }
      if (ppHint) { banner(ppHint, 'info'); return; }
      if (todo.length === 0) { clearInterval(window.__ttdWatch); banner('All fields filled. Please verify everything, then click Continue yourself.', 'done'); }
      else if (Date.now() - started > 5 * 60 * 1000) clearInterval(window.__ttdWatch);
      else banner(hint + 'Still to do: ' + todo.join(', ') + '.', 'info');
    }, 150);
    return { ok: true, how: r.how, rows, total: pilgrims.length, nameOk, ageOk, skipped, sectionsOk: r.secOk };
  };


  // ---------- on-page copy panel (closed shadow root; values only live in memory until closed) ----------
  window.__ttdPanel = function (pilgrims) {
    const old = document.getElementById('pfh-panel'); if (old) old.remove();
    const host = document.createElement('div'); host.id = 'pfh-panel';
    host.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    const ID = { '1': 'Aadhaar', '2': 'Passport' };
    const css = document.createElement('style');
    css.textContent = ':host{all:initial}.b{font:13px Arial,sans-serif;background:#FFFBF2;color:#3B2216;border:2px solid #C9962B;border-radius:12px;width:290px;max-height:70vh;overflow:auto;box-shadow:0 6px 24px rgba(0,0,0,.35)}.h{background:#8E1B2B;color:#fff;padding:8px 10px;display:flex;justify-content:space-between;align-items:center;font-weight:700}.h button{background:none;border:none;color:#fff;font-size:18px;cursor:pointer}.p{padding:6px 10px;border-bottom:1px solid #EBD9B0}.p b{color:#8E1B2B}.r{display:flex;justify-content:space-between;align-items:center;margin:3px 0}.r span{color:#7A6552;font-size:11px}.r button{background:#FFF3DC;border:1px solid #EBD9B0;border-radius:6px;padding:3px 8px;cursor:pointer;color:#8E1B2B;font-weight:700}.n{padding:6px 10px;color:#7A6552;font-size:11px}';
    const box = document.createElement('div'); box.className = 'b';
    const head = document.createElement('div'); head.className = 'h'; head.textContent = 'Click Copy, then paste into the box';
    const x = document.createElement('button'); x.textContent = '×'; x.setAttribute('aria-label', 'Close'); x.onclick = () => host.remove(); head.appendChild(x);
    box.appendChild(head);
    pilgrims.forEach((p, i) => {
      const d = document.createElement('div'); d.className = 'p';
      const t = document.createElement('b'); t.textContent = `${i + 1}. ${p.name}`; d.appendChild(t);
      [['Name', p.name], ['Age', p.age], ['Gender', p.gender], ['ID type', ID[p.idType] || ''], ['ID number', p.idNum]].concat(p.idType === '2' && p.pp ? [['Country', p.pp.country], ['Visa/OCS number', p.pp.visaNo], ['Type of Visa', p.pp.visaType], ['Visa validity', p.pp.visaExp ? p.pp.visaExp.split('-').reverse().join('/') : '']] : []).forEach(([k, v]) => {
        if (!v) return;
        const r = document.createElement('div'); r.className = 'r';
        const l = document.createElement('span'); l.textContent = k + (k === 'ID number' || k === 'Visa/OCS number' ? ' (hidden)' : ': ' + v);
        const b = document.createElement('button'); b.textContent = 'Copy';
        b.onclick = async () => { try { await navigator.clipboard.writeText(String(v)); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1200); } catch (e) { b.textContent = 'Blocked'; } };
        r.appendChild(l); r.appendChild(b); d.appendChild(r);
      });
      box.appendChild(d);
    });
    const n = document.createElement('div'); n.className = 'n'; n.textContent = 'Closes by itself after 10 minutes.'; box.appendChild(n);
    root.appendChild(css); root.appendChild(box); document.body.appendChild(host);
    setTimeout(() => host.remove(), 10 * 60 * 1000);
    return { ok: true, count: pilgrims.length };
  };

  // ---------- redacted report: structure only, never any typed value ----------
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const KNOWN = new Set(Object.values(LABELS).map(norm).concat(['pilgrim details']));
  function labelOf(c) {
    let n = c;
    for (let i = 0; i < 4 && n; i++) {
      n = n.parentElement;
      const l = n && Array.from(n.querySelectorAll('label')).find(x => !x.contains(c));
      if (l) { const t = norm(l.textContent); return KNOWN.has(t) ? t : '#' + hash(t); }
    }
    return '';
  }
  window.__ttdReport = function () {
    const r = resolve();
    const controls = Array.from(document.querySelectorAll('input, select, textarea')).slice(0, 60).map(c => ({
      tag: c.tagName.toLowerCase(), type: c.type || '', name: ATTR[(c.getAttribute('name') || '').toLowerCase()] ? c.getAttribute('name') : '#' + hash(c.getAttribute('name') || ''),
      label: labelOf(c), readOnly: !!c.readOnly, disabled: !!c.disabled, maxLength: c.maxLength > 0 ? c.maxLength : 0,
      cls: '#' + hash(c.className || ''), id: '#' + hash(c.id || '')
    }));
    return JSON.stringify({ tool: 'tirumala-darshan-helper', version: VERSION, page: location.origin + location.pathname,
      strategy: r.how, rows: r.n, sectionsOk: r.secOk, tried: r.tried, controls }, null, 1);
  };
})();
