// Starts everything: game, panel, saved town, and the frame loop.
import { Game } from './game.js';
import { UI } from './ui.js';
import { loadGame, saveGame, loadData } from './save.js';
import { Music } from './music.js';

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
  let data = null;
  try { data = await (await fetch('town.json', { cache: 'no-store' })).json(); } catch { /* no published town yet */ }
  if (!loadData(game, data)) game.newTown();
  game.screenMode = 'fill';
  // when you upload a newer town.json, visitors get it automatically (checked every 90 seconds)
  let current = data ? JSON.stringify(data).length + ':' + (data.chars?.length || 0) : '';
  setInterval(async () => {
    try {
      const fresh = await (await fetch('town.json', { cache: 'no-store' })).json();
      const sig = JSON.stringify(fresh).length + ':' + (fresh.chars?.length || 0);
      if (current && sig !== current) location.reload();
      current = sig;
    } catch { /* offline: try again later */ }
  }, 90000);
} else if (!loadGame(game)) game.newTown();
game.bus.ensureStop(); // older towns get a bus stop too
const ui = new UI(game);
// background music: browsers only allow sound after a click, so a saved "music on" starts at the first click
const music = game.music = new Music();
music.setVolume(game.savedMusic?.vol ?? .5);
ui.setupMusic(music);
if (game.savedMusic?.on) {
  const go = () => { if (!music.on) { music.start(); ui.renderMusic(); } removeEventListener('pointerdown', go); removeEventListener('keydown', go); };
  addEventListener('pointerdown', go);
  addEventListener('keydown', go);
}
ui.refreshAll();

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
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

setInterval(() => { if (!game.noSave) saveGame(game); }, 4000);
addEventListener('beforeunload', () => { if (!game.noSave) saveGame(game); });
