const SITE = 'https://ttdevasthanams.ap.gov.in/';
let releaseAt = 0, ctx = null, timer = null;
function tick() {
  const left = releaseAt - Date.now();
  const el = document.getElementById('when');
  if (left > 0) { const m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000); el.textContent = `${m}:${String(s).padStart(2, '0')} left`; }
  else if (left > -60000) el.textContent = 'Release time reached';
  else el.textContent = `Released ${Math.round(-left / 60000)} min ago`;
}
// best-effort beep (browsers may block sound until the user has clicked the window)
function beep() {
  try {
    ctx = ctx || new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.25);
  } catch (e) {}
}
chrome.storage.local.get(['reminder', 'soundOn'], ({ reminder, soundOn }) => {
  if (reminder) { releaseAt = reminder.releaseAt; document.getElementById('rel').textContent = 'Release: ' + new Date(releaseAt).toLocaleString('en-IN'); }
  tick(); setInterval(tick, 1000);
  if (soundOn !== false) { beep(); let n = 0; timer = setInterval(() => { beep(); if (++n >= 8) clearInterval(timer); }, 1500); }
  else document.getElementById('mute').hidden = true;
});
document.getElementById('mute').addEventListener('click', () => { clearInterval(timer); document.getElementById('mute').hidden = true; });
document.getElementById('go').addEventListener('click', () => { chrome.tabs.create({ url: SITE }); window.close(); });
