// Starts everything: game, panel, saved town, and the frame loop.
import { Game } from './game.js';
import { UI } from './ui.js';
import { loadGame, saveGame, loadData, lastSaveSize } from './save.js';
import { Music } from './music.js';
import { Recorder } from './recorder.js';
import { setLang } from './i18n.js';

const stage = document.getElementById('stage');
const frame = document.getElementById('frame');
const game = new Game(frame);
window.game = game; // handy for debugging in the browser console

// Visitor mode: shows the published town.json (read only).
// On the internet (e.g. GitHub Pages) it is the default; on your PC add ?view to try it. ?edit forces the editor.
const params = new URLSearchParams(location.search);
const online = !['localhost', '127.0.0.1', ''].includes(location.hostname);
if (params.has('view') || (online && !params.has('edit'))) {
  game.viewer = true;
  game.noSave = true;
  game.followNew = false;
  document.body.classList.add('viewer');
  let data = null, text = '';
  try { text = await (await fetch('town.json', { cache: 'no-store' })).text(); data = JSON.parse(text); } catch { /* no published town yet */ }
  // visitors see the town in their phone's language (Arabic or English), or the one they picked last time
  const LANG_KEY = 'animal-town-visitor-lang';
  let lang = null;
  try { lang = localStorage.getItem(LANG_KEY); } catch { /* private mode */ }
  if (lang !== 'ar' && lang !== 'en') {
    const prefs = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
    lang = (prefs.find(l => /^(ar|en)/i.test(l)) || 'en').slice(0, 2).toLowerCase();
  }
  setLang(lang);
  if (!loadData(game, data, { keepLang: true })) game.newTown();
  game.visitorLangKey = LANG_KEY;
  game.screenMode = 'fill';
  // when you upload a newer town.json, visitors get it automatically (checked every 90 seconds)
  let current = data ? text.length : 0;
  setInterval(async () => {
    try {
      const fresh = await (await fetch('town.json', { cache: 'no-store' })).text();
      if (current && fresh.length !== current && JSON.parse(fresh)?.v === 2) location.reload();
      current = fresh.length;
    } catch { /* offline: try again later */ }
  }, 90000);
} else if (!(await loadGame(game))) game.newTown();
game.bus.ensureStop(); // older towns get a bus stop too
game.water.update(0); game.water.ensureBenches(); // older lakes get benches round their beach
for (const p of [...game.props.list]) if (!p.natural && p.type !== 'busstop' && game.tiles.onAsphalt(p.x, p.z)) game.props.remove(p);
const ui = new UI(game);
// background music: browsers only allow sound after a click, so a saved "music on" starts at the first click
const music = game.music = new Music();
music.setVolume(game.savedMusic?.vol ?? .5);
ui.setupMusic(music);
ui.setupRecorder(game.recorder = new Recorder(game, music));
if (game.savedMusic?.on) {
  const go = () => { if (!music.on) { music.start(); ui.renderMusic(); } removeEventListener('pointerdown', go); removeEventListener('keydown', go); };
  addEventListener('pointerdown', go);
  addEventListener('keydown', go);
}
ui.refreshAll();
// big town: build what is near the camera now, the rest comes as the camera moves
game.chunks.flush();
console.info(`town ready: ${game.chars.length} residents, ${game.town.all.length} buildings, ${Math.round(performance.now())} ms after opening`);

// screen shape: phone (9:16, for TikTok), computer (16:9) or fill the whole window
function fit() {
  const W = stage.clientWidth, H = stage.clientHeight;
  const ratio = { phone: 9 / 16, pc: 16 / 9 }[game.screenMode];
  let w = W, h = H;
  if (ratio) {
    h = H; w = Math.floor(h * ratio);
    if (w > W) { w = W; h = Math.floor(w / ratio); }
  }
  frame.style.width = w + 'px';
  frame.style.height = h + 'px';
  game.world.resize(w, h);
}
new ResizeObserver(fit).observe(stage);
ui.onScreen = fit;
ui.setScreen(game.screenMode);
fit();

// ?follow=name opens the game on that resident
const want = (params.get('follow') || '').toLowerCase();
if (want) {
  const c = game.chars.find(x => (x.account?.handle || '').toLowerCase() === want || x.name.replace(/^@+/, '').toLowerCase() === want);
  if (c) setTimeout(() => game.select(c, true), 300);
}

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, .05);
  last = now;
  game.update(dt);
  music.setNight(game.daynight.isNight);
  game.world.adapt(dt);
  game.world.render();
  game.recorder?.frame();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
// the town is drawn: the loading screen fades away (shown at least a moment, so it doesn't just flash)
requestAnimationFrame(() => requestAnimationFrame(() => {
  const el = document.getElementById('loading');
  if (!el) return;
  setTimeout(() => { el.classList.add('done'); setTimeout(() => el.remove(), 800); }, Math.max(0, 900 - (Date.now() - (window.__ldStart || 0))));
}));

// saving: every 4 seconds, a big town (slower to write) every 30 seconds, and when the page is hidden or closed
let lastSave = performance.now();
setInterval(() => {
  const every = lastSaveSize > 1.5e6 ? 30000 : 4000;
  if (!game.noSave && performance.now() - lastSave >= every - 50) { lastSave = performance.now(); saveGame(game); }
}, 4000);
document.addEventListener('visibilitychange', () => { if (document.hidden && !game.noSave) saveGame(game); });
addEventListener('beforeunload', () => { if (!game.noSave) saveGame(game); });
