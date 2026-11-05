// A practice copy of the TTD "Pilgrim Details" form. It copies the behaviours that matter:
//  - the dropdowns open only for real (trusted) clicks,
//  - text fields ignore plain `input.value = x` (like a React-controlled input) but accept typing,
//  - the ID number box stays disabled until a Photo ID type is chosen.
// URL options for the tests: ?tickets=2  ?noattr=1  ?nolabel=1  ?badshape=1  ?empty=1
(function () {
  const q = new URLSearchParams(location.search);
  const tickets = Math.max(1, Math.min(6, Number(q.get('tickets') || 2)));
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const state = [];
  const GENDERS = ['Male', 'Female', 'Transgender'], IDTYPES = ['Aadhaar Card', 'Passport'];

  const sel = document.getElementById('tickets');
  for (let i = 1; i <= 6; i++) { const o = document.createElement('option'); o.value = i; o.textContent = i; if (i === tickets) o.selected = true; sel.appendChild(o); }
  sel.onchange = () => { q.set('tickets', sel.value); location.search = q.toString(); };

  function controlled(el, onAccept) {                // emulates React's value tracker
    let tracked = '';
    Object.defineProperty(el, 'value', { configurable: true, get() { return desc.get.call(el); }, set(v) { tracked = String(v); desc.set.call(el, v); } });
    el.addEventListener('input', () => {
      const cur = desc.get.call(el);
      if (cur === tracked) { setTimeout(() => { const keep = onAccept.read(); desc.set.call(el, keep); tracked = keep; }, 0); return; }   // ignored, then reverted
      tracked = cur; onAccept(cur);
    });
  }
  function cell(row, key, label, nameAttr, opts) {
    const w = document.createElement('div');
    const inner = document.createElement('div'); inner.className = 'w';
    const input = document.createElement('input');
    input.className = 'floating-input'; input.autocomplete = 'off';
    if (!q.get('noattr')) input.setAttribute('name', nameAttr);
    input.setAttribute('label', label);
    if (opts.type) input.type = opts.type;
    if (opts.max) input.maxLength = opts.max;
    if (opts.readonly) input.readOnly = true;
    if (opts.disabled) input.disabled = true;
    if (q.get('badshape') && key === 'age') input.type = 'text';
    if (q.get('badshape') && key === 'gender') input.readOnly = false;
    const lab = document.createElement('div'); lab.className = 'lab';
    const l = document.createElement('label');
    const text = q.get('nolabel') ? 'Field ' + key : label;
    l.appendChild(document.createTextNode(text));
    const sup = document.createElement('sup'); sup.textContent = ' *'; l.appendChild(sup);
    lab.appendChild(l);
    const optBox = document.createElement('div'); optBox.className = 'opts';
    inner.append(input, lab, optBox); w.appendChild(inner);
    row[key] = '';
    if (opts.list) {
      input.style.cursor = 'pointer';
      input.addEventListener('click', e => {
        if (!e.isTrusted) return;                          // the real site ignores scripted clicks
        optBox.textContent = '';
        opts.list.forEach(v => {
          const d = document.createElement('div'); d.textContent = v;
          d.addEventListener('click', ev => {
            if (!ev.isTrusted) return;
            desc.set.call(input, v); row[key] = v; optBox.textContent = '';
            if (key === 'idType') { const n = row._idNumInput; n.disabled = false; if (/passport/i.test(v)) openPassport(row); }
          });
          optBox.appendChild(d);
        });
      });
    } else {
      const reader = () => row[key];
      const accept = v => { row[key] = opts.digits ? v : v; };
      accept.read = reader;
      controlled(input, Object.assign(accept, { read: reader }));
    }
    row['_' + key + 'Input'] = input;
    return w;
  }

  // the real site opens this pop-up when Passport is chosen
  function openPassport(row) {
    const o = document.createElement('div'); o.id = 'ppmodal'; o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:5000;display:flex;align-items:center;justify-content:center';
    o.innerHTML = '<div style="background:#fff;border-radius:20px;width:900px;max-width:96vw"><div style="background:#663399;color:#fff;padding:16px 24px;border-radius:20px 20px 0 0;font-weight:700;font-size:20px">Photo ID Proof Instructions <span id="ppx" style="float:right;cursor:pointer">&times;</span></div><ol style="padding:0 40px"><li>Passport option is only applicable for NRIs.</li></ol><div id="ppf" style="display:grid;grid-template-columns:repeat(5,1fr);gap:1.5em;padding:20px 30px"></div><div style="padding:10px 30px 20px;text-align:right"><button id="ppsub" type="button">Submit</button></div></div>';
    document.body.appendChild(o);
    const f = o.querySelector('#ppf'); row.pp = {};
    [['passport', 'Passport Number', 'text'], ['country', 'Country', 'text'], ['visaNo', 'Visa/OCS Number', 'text'], ['visaType', 'Type of Visa', 'text'], ['visaExp', 'Visa Validity Date', 'text']].forEach(([k, lab, type]) => {
      const w = document.createElement('div'); w.className = 'w';
      const i = document.createElement('input'); i.type = type; i.setAttribute('formcontrolname', k === 'visaNo' ? 'visaNumber' : k === 'visaExp' ? 'visaValidity' : k); if (k === 'visaExp') i.readOnly = true;
      const l = document.createElement('div'); l.className = 'lab'; l.innerHTML = '<label>' + lab + '</label><sup>*</sup>';
      w.append(i, l); f.appendChild(w);
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      i.addEventListener('input', () => { row.pp[k] = i.value; });
      if (k === 'visaExp') i.addEventListener('click', e => { if (e.isTrusted) { set.set.call(i, '01/01/2030'); row.pp[k] = i.value; } });
    });
    const close = () => o.remove();
    o.querySelector('#ppx').onclick = close; o.querySelector('#ppsub').onclick = close;
  }
  if (!q.get('empty')) {
    const rowsEl = document.getElementById('rows');
    for (let i = 0; i < tickets; i++) {
      const row = {}; state.push(row);
      const g = document.createElement('div'); g.className = 'grid';
      g.append(
        cell(row, 'name', 'Name', 'fname', { type: 'text', max: 80 }),
        cell(row, 'age', 'Age', 'age', { type: 'number', max: 3 }),
        cell(row, 'gender', 'Gender', 'gender', { readonly: true, list: GENDERS }),
        cell(row, 'idType', 'Photo ID Proof', 'photoIdType', { readonly: true, list: IDTYPES }),
        cell(row, 'idNum', 'Photo Id Number', 'idProofNumber', { type: 'text', max: 12, disabled: true }));
      rowsEl.appendChild(g);
    }
  } else {
    document.getElementById('pcard').textContent = 'No form here (practice: wrong page).';
  }

  document.getElementById('continue').onclick = () => {
    const out = state.map(r => ({ name: r.name, age: r.age, gender: r.gender, idType: r.idType, idNum: r.idNum }));
    const complete = out.length > 0 && out.every(r => r.name && r.age && r.gender && r.idType && /^[A-Za-z0-9]{6,12}$/.test(r.idNum));
    document.getElementById('result').textContent = (complete ? 'VALID' : 'INCOMPLETE') + '\n' + JSON.stringify(out, null, 1);
  };
  window.__mockState = () => state.map(r => ({ name: r.name, age: r.age, gender: r.gender, idType: r.idType, idNum: r.idNum, pp: r.pp }));

  // when opened from the extension, answer the popup's messages
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _s, send) => {
      if (!msg || !msg.type) return;
      if (msg.type === 'ttd-scan') send(window.__ttdScan());
      else if (msg.type === 'ttd-fill') { window.__ttdFill(msg.pilgrims).then(send); return true; }
      else if (msg.type === 'ttd-report') send(window.__ttdReport());
      else if (msg.type === 'ttd-panel') send(window.__ttdPanel(msg.pilgrims));
    });
  }
})();
