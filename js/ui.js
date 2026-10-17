// The control panel on the right (hidden with H while recording).
import { t, getLang, setLang } from './i18n.js';
import { ANIMALS, ANIMAL_ORDER } from './animals.js';
import { JOBS, JOB_ORDER } from './jobs.js';
import { TYPES, BUILD_MENU, SHOP_EMOJI, makeSpec } from './buildings.js';
import { runCommand } from './commands.js';
import { saveGame, clearSave, clearAll } from './save.js';
import { ProfileCard, BuildingCard, staffOf, fmtDur, PLATFORMS, accountUrl, cleanHandle, belongings, followLink, parseFollowers } from './profile.js';
import { exportTown, importTown } from './save.js';
import { EVENT_ORDER } from './events.js';
import { RIVER_W } from './water.js';
import { loadDesigns, saveDesigns, designToSpec, designFromPhoto, getApiKey, setApiKey, ROLES, ROOFS, WINDOWS } from './designs.js';

const ACTION_LIST = [['car', '🚗'], ['swim', '🏊'], ['boat', '🚣'], ['drive', '🚕'], ['dance', '💃'], ['wave', '👋'], ['jump', '🤸'], ['cheer', '🎉'], ['sit', '🪑'], ['sleep', '😴'],
  ['eat', '🍔'], ['buy', '🛍️'], ['chat', '💬'], ['home', '🏠'], ['hurt', '🤕'], ['heal', '💚'], ['quit', '🚪']];
const TOOL_LIST = [['road', '🛣️'], ['path', '🟫'], ['parkzone', '🌲'], ['curve', '〰️'], ['bridge', '🌉'], ['river', '🏞️'], ['lake', '🌊'], ['lamp', '💡'], ['gardenlamp', '🏮'], ['traffic', '🚦'], ['tree', '🌳'], ['bench', '🪑'], ['flowers', '🌷'], ['busstop', '🚏'], ['erase', '🧽']];
const CAM_LIST = [['free', '🖱️'], ['follow', '🎥'], ['cinema', '🎬'], ['plane', '✈️'], ['overview', '🗺️']];

const $ = id => document.getElementById(id);
const TAB_ORDER = ['play', 'sel', 'build', 'people', 'film', 'town'], TAB_KEY = 'animal-town-tab';
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const tile = (emoji, label, onclick, cls = '') => {
  const b = el('button', 'tile ' + cls);
  b.append(el('span', 'ic', emoji), el('span', 'lb', label));
  b.onclick = onclick;
  return b;
};

export class UI {
  constructor(game) {
    this.game = game;
    this.animal = 'random';
    this.selKey = null;
    this.pending = false;
    this.bType = 'house';
    this.bStyle = null;
    this.bFloors = null;
    this.bVariant = 'food';
    this.bDesign = null;
    this.designs = loadDesigns();

    $('btn-add').onclick = () => this.addFollower();
    $('in-name').addEventListener('keydown', e => { if (e.key === 'Enter') this.addFollower(); });
    $('btn-cmd').onclick = () => this.runCmd();
    $('in-cmd').addEventListener('keydown', e => { if (e.key === 'Enter') this.runCmd(); });
    $('in-search').addEventListener('input', () => this.renderList());
    $('chk-follow').onchange = e => { game.followNew = e.target.checked; };
    $('chk-sleep').onchange = e => { game.nightSleep = e.target.checked; };
    $('chk-askplace').onchange = e => { game.choosePlace = e.target.checked; };
    $('btn-lang').onclick = () => this.toggleLang();
    $('btn-hide').onclick = () => this.togglePanel();
    $('show-panel').onclick = () => this.togglePanel();
    $('btn-fire').onclick = () => game.startFire();
    $('btn-expand').onclick = () => { game.expandLand(3); this.renderTown(); };
    // fresh start: clear the town (day counter keeps going) or everything (day 1 again)
    const rd = $('reset-dlg');
    $('btn-reset').onclick = () => { $('reset-sure').checked = false; $('reset-town').disabled = $('reset-all').disabled = true; rd.showModal(); };
    $('reset-sure').onchange = e => { $('reset-town').disabled = $('reset-all').disabled = !e.target.checked; };
    $('reset-backup').onclick = () => exportTown(game);
    $('reset-cancel').onclick = () => rd.close();
    const wipe = all => { if (all) clearAll(); else clearSave(); game.noSave = true; location.reload(); };
    $('reset-town').onclick = () => wipe(false);
    $('reset-all').onclick = () => wipe(true);
    this.setupTabs();
    $('b-place').onclick = () => this.placeBuilding();
    $('btn-bulk').onclick = () => this.openBulk();
    document.querySelectorAll('#screen-btns button').forEach(b => { b.onclick = () => this.setScreen(b.dataset.mode); });
    $('btn-full').onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else $('stage').requestFullscreen?.();
    };
    $('btn-export').onclick = () => exportTown(game);
    $('in-site').value = game.siteUrl || '';
    $('in-site').oninput = e => { game.siteUrl = e.target.value.trim(); };
    $('in-import').onchange = async e => {
      const f = e.target.files[0];
      if (!f || !confirm(t('importConfirm'))) return;
      try { await importTown(f); game.noSave = true; location.reload(); } catch (err) { this.addLog('⚠️ ' + err.message); }
    };
    // visitor search (viewer mode): find a resident by name or account
    $('vb-search').oninput = () => {
      const q = $('vb-search').value.trim().replace(/^@/, '').toLowerCase(), box = $('vb-results');
      box.textContent = '';
      if (!q) return;
      const hits = game.chars.filter(c => c.name.toLowerCase().includes(q) || (c.account?.handle || '').toLowerCase().includes(q)).slice(0, 8);
      if (!hits.length) box.appendChild(el('small', null, t('notFoundRes')));
      for (const c of hits) {
        const b = el('button', null, `${c.def.emoji} ${c.name}`);
        b.dir = 'auto';
        b.onclick = () => { game.select(c, true); box.textContent = ''; $('vb-search').value = ''; };
        box.appendChild(b);
      }
    };
    $('vb-lang').onclick = () => this.toggleLang();
    $('ev-try-btn').onclick = () => { game.events.tryNow($('ev-try').value, 10); };
    $('ev-stop').onclick = () => { game.events.tryNow(null); };
    $('b-floors').oninput = e => { this.bFloors = +e.target.value; $('b-floors-n').textContent = this.bFloors; };
    $('d-new').onclick = () => this.openDesigner({});
    $('d-photo').onclick = () => this.openDesigner({}, true);
    $('tool-done').onclick = () => game.editor.setTool(null);
    $('btn-undo').onclick = () => game.history.undo();
    $('btn-redo').onclick = () => game.history.redo();
    game.on('history', () => this.renderHistory());
    // warnings from the build tools show right under the tools (not only in the log)
    game.on('toolmsg', m => { $('tool-msg').textContent = '⚠️ ' + m; clearTimeout(this.toolMsgT); this.toolMsgT = setTimeout(() => { $('tool-msg').textContent = ''; }, 6000); });
    this.renderHistory();
    $('time-range').oninput = e => game.setHour(+e.target.value);
    $('btn-pause').onclick = () => { game.daynight.setPaused(!game.daynight.paused); this.renderTime(); };
    $('sel-cycle').onchange = e => { if (e.target.value === 'real') game.daynight.setReal(); else game.daynight.setCycle(+e.target.value); };
    $('sel-build').onchange = e => { game.buildDuration = +e.target.value; };
    $('btn-day').onclick = () => game.setHour(9);
    $('btn-night').onclick = () => game.setHour(22);
    $('floor-up').onclick = () => game.director.setFloor(game.director.floor + 1);
    $('floor-down').onclick = () => game.director.setFloor(game.director.floor - 1);
    $('floor-exit').onclick = () => game.director.setMode('free');

    addEventListener('keydown', e => this.key(e));
    game.on('change', () => this.queueRender());
    this.card = new ProfileCard(game);
    this.bcard = new BuildingCard(game);
    game.on('select', c => {
      this.renderSelected(true); this.renderList();
      if (c) this.card.show(c); else this.card.hide();
      if (!c && game.selectedBuilding) this.bcard.show(game.selectedBuilding); else this.bcard.hide();
    });
    game.on('change', () => {
      this.card.update();
      const gi = this.goalInput, s = game.selected;
      if (gi && s && document.activeElement !== gi && gi.value !== s.goal) gi.value = s.goal || '';
    });
    game.on('log', m => this.addLog(m));
    game.on('tool', t2 => {
      this.renderTools();
      // cards step aside while choosing where to build, so they don't cover the map
      document.getElementById('frame').classList.toggle('building-mode', !!t2);
    });
    game.on('camera', () => this.renderCamera());
    setInterval(() => { this.renderList(); this.renderTime(); }, 1000);
  }

  key(e) {
    const g = this.game;
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
    if (e.key === 'Escape') {
      document.activeElement?.blur();
      if (!g.editor.tool && g.director.mode !== 'free') g.director.setMode('free');
      else if (!g.editor.tool) g.select(null);
      return;
    }
    // Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo
    if ((e.ctrlKey || e.metaKey) && !typing && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); g.history.undo(); return; }
      if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); g.history.redo(); return; }
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey || $('designer').open) return;
    const k = e.key.toLowerCase();
    if (k === 'h') this.togglePanel();
    else if (k === 'n') { e.preventDefault(); this.showPanel(); this.setTab('play'); $('in-name').focus(); }
    else if (k === '/') { e.preventDefault(); this.showPanel(); this.setTab('play'); $('in-cmd').focus(); }
    else if (/^[1-6]$/.test(k)) { this.showPanel(); this.setTab(TAB_ORDER[+k - 1]); }
    else if (k === 'f' && g.selected) g.director.setMode('follow', { char: g.selected });
    else if (k === 'c' && g.selected) g.cinematic(g.selected);
    else if (k === 'p') g.director.setMode('plane');
    else if (k === 'o') g.director.overview();
    else if (k === 'e') this.toggleEnter();
    else if (k === ']') g.director.setFloor(g.director.floor + 1);
    else if (k === '[') g.director.setFloor(g.director.floor - 1);
  }
  toggleEnter() {
    const g = this.game;
    if (g.director.mode === 'interior') { g.director.setMode('free'); return; }
    const b = g.selectedBuilding || g.selected?.bld;
    if (b?.complete && !TYPES[b.type]?.open) g.director.setMode('interior', { building: b, floor: Math.floor((g.selected?.root.position.y || 0) / 4.2) });
  }

  // ---------- general ----------
  // ---------- profile editor (goal + social account) ----------
  renderProfileEditor(c, card) {
    const g = this.game;
    card.appendChild(el('h3', null, '👤 ' + t('profile')));
    const box = el('div', 'prof-edit');

    // goals (from the follower's comments)
    box.appendChild(el('small', 'hint', '🎯 ' + t('goalsTitle')));
    const list = el('ul', 'goal-list');
    const drawGoals = () => {
      list.textContent = '';
      c.goals.forEach((x, i) => {
        const li = el('li', x.done ? 'done' : '');
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = x.done;
        cb.onchange = () => {
          x.done = cb.checked;
          if (x.done) { c.say('✅', 2.5); g.effects.emit('sparkle', { x: c.root.position.x, y: c.root.position.y + 2.6, z: c.root.position.z }, 6); }
          drawGoals(); this.card.update();
        };
        const tx = el('span', null, x.text); tx.dir = 'auto';
        const del = el('button', 'icon danger', '✕');
        del.onclick = () => { c.goals.splice(i, 1); drawGoals(); this.card.update(); };
        li.append(cb, tx, del);
        list.appendChild(li);
      });
    };
    this.drawGoals = drawGoals;
    drawGoals();
    const addRow = el('div', 'row-in');
    const gin = el('input'); gin.placeholder = t('goalPh'); gin.maxLength = 140; gin.dir = 'auto';
    const gadd = el('button', 'primary', t('addGoal'));
    const doAdd = () => { if (c.addGoal(gin.value)) { gin.value = ''; drawGoals(); this.card.update(); } };
    gadd.onclick = doAdd;
    gin.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
    addRow.append(gin, gadd);
    box.append(list, addRow);

    // social account + a link that opens the game on this resident
    const row = el('div', 'row-in');
    const plat = el('select');
    for (const [k, pl] of Object.entries(PLATFORMS)) { const o = el('option', null, pl.label); o.value = k; plat.appendChild(o); }
    plat.value = c.account?.platform || 'tiktok';
    const handle = el('input');
    handle.placeholder = t('handlePh');
    handle.dir = 'ltr';
    handle.value = c.account?.handle || '';
    const link = el('a', null, '↗');
    link.target = '_blank';
    link.rel = 'noopener';
    link.title = t('openAccount');
    const sync = () => {
      c.account = { platform: plat.value, handle: cleanHandle(handle.value) };
      link.href = accountUrl(c.account) || '#';
      this.card.update();
    };
    plat.onchange = sync;
    handle.oninput = sync;
    sync();
    row.append(plat, handle, link);
    const share = el('button', null, '🔗 ' + t('copyLink'));
    share.onclick = async () => {
      const url = followLink(c);
      try { await navigator.clipboard.writeText(url); this.addLog(t('linkCopied')); } catch { prompt(t('copyLink'), url); }
    };
    const show = el('label', 'check');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = g.showCard;
    cb.onchange = () => { g.showCard = cb.checked; if (cb.checked) this.card.show(c); else this.card.hide(); };
    show.append(cb, el('span', null, t('showCard')));

    // everything they own
    const bel = el('ul', 'bel-list');
    const items = belongings(c);
    if (!items.length) bel.appendChild(el('li', null, t('noBelongings')));
    for (const [e, txt] of items) { const li = el('li', null, `${e} ${txt}`); li.dir = 'auto'; bel.appendChild(li); }
    box.append(row, share, show, el('small', 'hint', '🎒 ' + t('belongingsAll')), bel);
    card.appendChild(box);
  }

  // ---------- on-screen counters ----------
  renderHud() {
    const g = this.game;
    $('hud-count').textContent = `🐾 ${g.chars.length.toLocaleString()}`;
    $('hud-day').textContent = t('dayN', { n: g.day });
    const ev = g.events.active, he = $('hud-event');
    he.classList.toggle('hidden', !ev);
    if (ev) he.textContent = `${t('evE_' + ev)} ${t('ev_' + ev)}`;
  }

  // ---------- weekly calendar ----------
  renderCalendar() {
    const g = this.game, grid = $('cal-grid');
    grid.textContent = '';
    const fmt = new Intl.DateTimeFormat(getLang() === 'ar' ? 'ar' : 'en-GB', { weekday: 'long' });
    const today = new Date().getDay();
    for (const d of [6, 0, 1, 2, 3, 4, 5]) {
      const row = el('div', 'cal-row' + (d === today ? ' today' : ''));
      const date = new Date(2024, 0, 6 + d); // 2024-01-06 is a Saturday -> weekday d
      row.appendChild(el('b', null, fmt.format(date)));
      const sel = el('select');
      const none = el('option', null, t('noEvent')); none.value = ''; sel.appendChild(none);
      for (const k of EVENT_ORDER) { const o = el('option', null, `${t('evE_' + k)} ${t('ev_' + k)}`); o.value = k; sel.appendChild(o); }
      sel.value = g.events.calendar[d] || '';
      sel.onchange = () => { if (sel.value) g.events.calendar[d] = sel.value; else delete g.events.calendar[d]; g.events.timer = 0; };
      row.appendChild(sel);
      grid.appendChild(row);
    }
    const tr = $('ev-try');
    tr.textContent = '';
    for (const k of EVENT_ORDER) { const o = el('option', null, `${t('evE_' + k)} ${t('ev_' + k)}`); o.value = k; tr.appendChild(o); }
  }

  // ---------- screen shape ----------
  setScreen(mode) {
    this.game.screenMode = mode;
    document.querySelectorAll('#screen-btns button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    this.onScreen?.();
  }

  // ---------- add many followers at once ----------
  openBulk() {
    const dlg = $('bulk');
    $('bulk-text').value = '';
    $('bulk-status').textContent = '';
    $('bulk-file').value = '';
    this.bulkTimes = {};
    $('bulk-file').onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      const found = parseFollowers(await f.text());
      $('bulk-text').value = found.map(x => x.name).join('\n');
      this.bulkTimes = Object.fromEntries(found.filter(x => x.at).map(x => [x.name.toLowerCase(), x.at]));
      if (found.some(x => x.ig)) $('bulk-platform').value = 'instagram';
      $('bulk-status').textContent = t('bulkFound', { n: found.length });
    };
    $('bulk-go').onclick = () => {
      const names = parseFollowers($('bulk-text').value).map(x => x.name);
      const platform = $('bulk-platform').value;
      const g = this.game;
      let added = 0, skipped = 0;
      for (const name of names.slice(0, 500)) {
        const animal = ANIMAL_ORDER[Math.floor(Math.random() * ANIMAL_ORDER.length)];
        const at = this.bulkTimes[name.toLowerCase()];
        const r = g.addCharacter({ name, animal, account: { platform, handle: name }, joinedAt: at }, false);
        if (r.error) skipped++; else added++;
      }
      g.giveHomes();
      if (added) g.announce(t('bulkAdded', { n: added }));
      $('bulk-status').textContent = t('bulkResult', { n: added, s: skipped });
      g.emit('change');
      if (added) setTimeout(() => dlg.close(), 900);
    };
    $('bulk-cancel').onclick = () => dlg.close();
    dlg.showModal();
  }

  // ---------- recording ----------
  setupRecorder(rec) {
    this.rec = rec;
    const fill = (id, list, val) => {
      const s = $(id);
      s.textContent = '';
      for (const [v, label] of list) { const o = el('option', null, label); o.value = v; s.appendChild(o); }
      s.value = String(val);
    };
    this.fillRec = () => {
      fill('rec-clip', [15, 30, 60, 90].map(n => [n, t('secN', { n })]), rec.opts.clipSec);
      fill('rec-quality', [['1080', t('recQ1080')], ['720', t('recQ720')], ['tab', t('recQTab')]], rec.opts.quality);
      fill('rec-seg', [[0, t('recSegNone')], ...[5, 10, 30, 60].map(n => [n, t('minN', { n })])], rec.opts.segMin);
    };
    this.fillRec();
    $('rec-arm').onclick = async () => {
      if (rec.armed) { rec.disarm(); return; }
      try { await rec.arm(); } catch (e) { console.warn(e); this.addLog(t('recDenied') + ' (' + (e?.message || e) + ')'); }
    };
    $('rec-btn').onclick = async () => {
      if (rec.recording) { rec.stop(); return; }
      try { if (!rec.armed) await rec.arm(); rec.start('manual'); } catch (e) { this.addLog(t('recDenied')); }
    };
    $('rec-join').onchange = e => rec.setOpt('onJoin', e.target.checked);
    $('rec-event').onchange = e => rec.setOpt('onEvent', e.target.checked);
    $('rec-clip').onchange = e => rec.setOpt('clipSec', +e.target.value);
    $('rec-seg').onchange = e => rec.setOpt('segMin', +e.target.value);
    $('rec-quality').onchange = e => { if (rec.recording) rec.stop(); if (rec.raw) rec.disarm(); rec.setOpt('quality', e.target.value); };
    // the folder needs its permission again after a restart: one click on its button gives it back
    $('rec-folder').onclick = async () => {
      try {
        if (rec.dir && !(await rec.folderReady())) await rec.dir.requestPermission({ mode: 'readwrite' });
        else await rec.pickFolder();
      } catch (e) { /* cancelled */ }
      rec.dirOk = await rec.folderReady();
      this.renderRecorder();
    };
    setInterval(async () => { const ok = await rec.folderReady(); if (ok !== rec.dirOk) { rec.dirOk = ok; this.renderRecorder(); } }, 3000);
    this.game.on('recorder', () => this.renderRecorder());
    setInterval(() => { if (rec.recording || rec.raw) this.renderRecorder(); }, 1000);
    this.renderRecorder();
  }
  renderRecorder() {
    const rec = this.rec;
    if (!rec) return;
    const on = rec.recording, s = Math.floor(rec.elapsed / 1000);
    const st = $('rec-state');
    st.textContent = on ? '● ' + t('recOn', { t: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }) + (rec.direct && rec.out ? ` · ${rec.out.width}×${rec.out.height}` : '') : rec.armed ? t('recReady') : '';
    st.classList.toggle('on', on);
    st.style.display = st.textContent ? '' : 'none';
    $('rec-arm').style.display = rec.direct ? 'none' : '';
    $('rec-arm').textContent = rec.armed ? '✅ ' + t('recDisarm') : '🎥 ' + t('recArm');
    $('rec-arm').classList.toggle('primary', !rec.armed);
    $('rec-btn').textContent = on ? '⏹️ ' + t('recStop') : '⏺️ ' + t('recStart');
    $('rec-btn').classList.toggle('danger', on);
    $('rec-folder').textContent = '📁 ' + (!rec.dir ? t('recFolderNone') : rec.dirOk === false ? t('recFolderAllow', { d: rec.dir.name }) : t('recFolder', { d: rec.dir.name }));
    $('rec-folder').style.display = rec.canPickFolder ? '' : 'none';
    $('rec-join').checked = rec.opts.onJoin;
    $('rec-event').checked = rec.opts.onEvent;
    // live preview of exactly what goes into the video
    const pv = $('rec-preview');
    if (rec.out && rec.out.parentNode !== pv) { pv.textContent = ''; pv.appendChild(rec.out); }
    pv.style.display = rec.out && (rec.recording || !rec.direct) ? '' : 'none';
    const info = [];
    if (!rec.picture) info.push('⚠️ ' + t('recNoPicture'));
    if (rec.canvasOnly && rec.armed) info.push(t('recCanvasOnly'));
    if (rec.saved) info.push(t('recFiles', { n: rec.saved, f: rec.lastFile }));
    $('rec-info').textContent = info.join(' · ');
    document.title = (on ? '🔴 ' : '') + t('title');
  }

  // ---------- music ----------
  setupMusic(music) {
    this.music = music;
    $('music-toggle').onclick = () => { music.toggle(); this.renderMusic(); };
    $('music-vol').oninput = e => music.setVolume(+e.target.value);
    $('music-file').onchange = e => { const f = e.target.files[0]; if (f) { music.useFile(f); this.renderMusic(); } };
    $('music-builtin').onclick = () => { music.useBuiltIn(); music.start(); this.renderMusic(); };
    $('music-builtin').title = t('musicBuiltIn');
    this.renderMusic();
  }
  renderMusic() {
    const m = this.music;
    if (!m) return;
    $('music-toggle').textContent = m.on ? '⏸️ ' + t('musicStop') : '▶️ ' + t('musicPlay');
    $('music-vol').value = m.volume;
    $('music-src').textContent = m.fileName ? t('musicUsing', { f: m.fileName }) : '🎹 ' + t('musicBuiltIn');
  }

  refreshAll() {
    $('sel-cycle').value = this.game.daynight.real ? 'real' : String(this.game.daynight.cycleMs);
    $('sel-build').value = String(this.game.buildDuration);
    $('chk-follow').checked = this.game.followNew;
    $('chk-sleep').checked = this.game.nightSleep;
    $('chk-askplace').checked = this.game.choosePlace;
    this.applyLang();
    this.renderAll();
  }
  queueRender() {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => { this.pending = false; this.renderAll(); });
  }
  renderAll() {
    this.renderList();
    this.renderTown();
    this.renderSelected();
    this.renderTime();
    this.renderHud();
  }
  applyLang() {
    const lang = getLang();
    document.documentElement.lang = lang;
    $('panel').dir = lang === 'ar' ? 'rtl' : 'ltr';
    $('frame').dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach(e => { e.textContent = t(e.dataset.i18n); });
    document.querySelectorAll('[data-i18n-ph]').forEach(e => { e.placeholder = t(e.dataset.i18nPh); });
    document.querySelectorAll('[data-i18n-title]').forEach(e => { e.title = t(e.dataset.i18nTitle); });
    $('btn-lang').textContent = lang === 'ar' ? 'English' : 'العربية';
    document.title = t('title');
    if (this.fillRec) { this.fillRec(); this.renderRecorder(); }
    this.buildAnimalGrid();
    this.renderBuildMenu();
    this.renderTools();
    this.renderCamera();
    this.renderMusic();
    this.renderCalendar();
    this.card?.update();
  }
  toggleLang() {
    setLang(getLang() === 'ar' ? 'en' : 'ar');
    this.applyLang();
    this.game.refreshText();
    this.selKey = null;
    this.renderAll();
    saveGame(this.game);
  }
  togglePanel() { document.body.classList.toggle('panel-hidden'); }

  // ---------- sidebar tabs ----------
  setupTabs() {
    this.tabBtns = [...document.querySelectorAll('#tabs button')];
    this.tabBtns.forEach(b => { b.onclick = () => this.setTab(b.dataset.tab); });
    let saved = 'play';
    try { saved = localStorage.getItem(TAB_KEY) || 'play'; } catch (e) { /* default */ }
    this.setTab(saved);
    // clicking a citizen or building in the game opens its details
    this.game.on('picked', () => this.setTab('sel'));
    this.game.on('select', () => this.renderTabs());
    this.game.on('recorder', () => this.renderTabs());
    this.game.on('tool', () => this.renderTabs());
  }
  setTab(name) {
    if (!TAB_ORDER.includes(name)) name = 'play';
    this.tab = name;
    this.tabBtns.forEach(b => { b.classList.toggle('on', b.dataset.tab === name); b.setAttribute('aria-selected', b.dataset.tab === name); });
    document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.dataset.pane === name));
    $('tab-body').scrollTop = 0;
    try { localStorage.setItem(TAB_KEY, name); } catch (e) { /* not saved */ }
    this.renderTabs();
  }
  // little signs on the tabs: who is selected, recording, a build tool in use
  renderTabs() {
    if (!this.tabBtns) return;
    const g = this.game, s = g.selected, b = g.selectedBuilding;
    const sel = this.tabBtns.find(x => x.dataset.tab === 'sel');
    sel.querySelector('.ti').textContent = s ? s.def.emoji : b ? b.emoji : '👤';
    sel.querySelector('.tl').textContent = s ? s.name.replace(/^@/, '') : b ? b.displayName() : t('tab_sel');
    sel.querySelector('.badge').classList.toggle('on', !!(s || b) && this.tab !== 'sel');
    this.tabBtns.find(x => x.dataset.tab === 'film').querySelector('.badge').classList.toggle('rec', !!g.recorder?.recording);
    this.tabBtns.find(x => x.dataset.tab === 'build').querySelector('.badge').classList.toggle('on', !!g.editor.tool && this.tab !== 'build');
  }
  showPanel() { document.body.classList.remove('panel-hidden'); }
  addLog(msg) {
    if (!msg) return;
    const li = el('li', null, msg);
    li.dir = 'auto';
    $('log').prepend(li);
    while ($('log').children.length > 30) $('log').lastChild.remove();
    $('cmd-result').textContent = msg;
  }

  // ---------- new follower ----------
  buildAnimalGrid() {
    const g = $('animal-grid');
    g.textContent = '';
    const make = (key, emoji, title) => {
      const b = el('button', 'animal' + (this.animal === key ? ' on' : ''), emoji);
      b.title = title;
      b.onclick = () => { this.animal = key; g.querySelectorAll('.animal').forEach(x => x.classList.toggle('on', x === b)); };
      g.appendChild(b);
    };
    make('random', '🎲', t('random'));
    for (const a of ANIMAL_ORDER) make(a, ANIMALS[a].emoji, t('an_' + a));
  }
  addFollower() {
    const input = $('in-name');
    const animal = this.animal === 'random' ? ANIMAL_ORDER[Math.floor(Math.random() * ANIMAL_ORDER.length)] : this.animal;
    const r = this.game.addCharacter({ name: input.value, animal });
    if (r.error) {
      this.addLog(r.error);
      input.classList.add('shake');
      setTimeout(() => input.classList.remove('shake'), 400);
      return;
    }
    input.value = '';
    input.focus();
  }
  runCmd() {
    const input = $('in-cmd');
    const r = runCommand(this.game, input.value);
    if (r) $('cmd-result').textContent = r;
    input.value = '';
  }

  // ---------- build menu ----------
  renderBuildMenu() {
    const types = $('b-types');
    types.textContent = '';
    for (const ty of BUILD_MENU) {
      types.appendChild(tile(TYPES[ty].emoji, t('b_' + ty), () => { this.bType = ty; this.bDesign = null; this.bStyle = null; this.bFloors = null; this.renderBuildMenu(); },
        !this.bDesign && this.bType === ty ? 'on' : ''));
    }
    const def = TYPES[this.bType];
    const styles = $('b-styles');
    styles.textContent = '';
    const styleKeys = Object.keys(def.styles);
    $('b-style-row').style.display = this.bDesign || styleKeys.length < 2 ? 'none' : '';
    this.bStyle ||= styleKeys[0];
    for (const s of styleKeys) {
      const b = el('button', 'chip-btn' + (this.bStyle === s ? ' on' : ''), t('st_' + s));
      b.onclick = () => { this.bStyle = s; this.renderBuildMenu(); };
      styles.appendChild(b);
    }
    const vrow = $('b-variant-row');
    vrow.style.display = this.bType === 'shop' && !this.bDesign ? '' : 'none';
    const vs = $('b-variants');
    vs.textContent = '';
    for (const v of def.variants || []) {
      const b = el('button', 'chip-btn' + (this.bVariant === v ? ' on' : ''), `${SHOP_EMOJI[v]} ${t('b_shop_' + v)}`);
      b.onclick = () => { this.bVariant = v; this.renderBuildMenu(); };
      vs.appendChild(b);
    }
    const [fmin, fmax, fdef] = this.bDesign ? [1, 20, this.bDesign.floors] : def.floors;
    const r = $('b-floors');
    r.min = fmin; r.max = fmax;
    this.bFloors = Math.min(fmax, Math.max(fmin, this.bFloors ?? fdef));
    r.value = this.bFloors;
    $('b-floors-n').textContent = this.bFloors;
    $('b-floor-row').style.display = fmin === fmax ? 'none' : '';
    const s = this.game.selected;
    $('b-builder').textContent = s ? t('builder', { name: s.name }) : t('builderAuto');

    const list = $('designs');
    list.textContent = '';
    for (const d of this.designs) {
      const row = el('div', 'design' + (this.bDesign === d ? ' on' : ''));
      const name = el('span', 'nm', `${d.emoji || '🏗️'} ${d.name || t('b_custom')} · ${t('floorsN', { n: d.floors })}`);
      name.dir = 'auto';
      name.onclick = () => { this.bDesign = d; this.bFloors = d.floors; this.renderBuildMenu(); };
      const ed = el('button', 'icon', '✏️');
      ed.onclick = () => this.openDesigner(d);
      const del = el('button', 'icon danger', '🗑️');
      del.onclick = () => { this.designs = this.designs.filter(x => x !== d); if (this.bDesign === d) this.bDesign = null; saveDesigns(this.designs); this.renderBuildMenu(); };
      row.append(name, ed, del);
      list.appendChild(row);
    }
  }
  currentSpec() {
    if (this.bDesign) return designToSpec({ ...this.bDesign, floors: this.bFloors });
    return makeSpec(this.bType, { style: this.bStyle, floors: this.bFloors, variant: this.bVariant });
  }
  placeBuilding() {
    $('cmd-result').textContent = t('placeHint');
    this.game.orderBuild(this.game.selected || null, this.currentSpec(), null, true);
  }

  // ---------- designer (by hand or from a photo) ----------
  openDesigner(d, photo = false) {
    const dlg = $('designer'), form = $('d-form');
    const data = { name: '', emoji: '🏢', role: 'office', floors: 3, width: 1, depth: 1, roof: 'flat', window: 'square', wall: '#e8e2d6', roofColor: '#4a4f5a', trim: '#ffffff', band: null, awning: null, balcony: false, columns: false, chimney: false, clock: false, ...d };
    form.textContent = '';
    const field = (label, input) => { const l = el('label', 'fld'); l.append(el('span', null, label), input); form.appendChild(l); return input; };
    const select = (opts, val, prefix) => { const s = el('select'); for (const o of opts) { const op = el('option', null, t(prefix + o)); op.value = o; s.appendChild(op); } s.value = val; return s; };
    const num = (v, min, max) => { const i = el('input'); i.type = 'number'; i.min = min; i.max = max; i.value = v; return i; };
    const color = v => { const i = el('input'); i.type = 'color'; i.value = v || '#ffffff'; return i; };
    const check = v => { const i = el('input'); i.type = 'checkbox'; i.checked = !!v; return i; };
    const f = {};
    f.name = field(t('dName'), el('input')); f.name.value = data.name; f.name.dir = 'auto'; f.name.maxLength = 24;
    f.emoji = field('Emoji', el('input')); f.emoji.value = data.emoji; f.emoji.maxLength = 4;
    f.role = field(t('dRole'), select(ROLES, data.role, 'role_'));
    f.floors = field(t('floors'), num(data.floors, 1, 20));
    f.width = field(t('dWidth'), num(data.width, 1, 3));
    f.depth = field(t('dDepth'), num(data.depth, 1, 3));
    f.roof = field(t('dRoof'), select(ROOFS, data.roof, 'roof_'));
    f.window = field(t('dWindow'), select(WINDOWS, data.window, 'win_'));
    f.wall = field(t('dWall'), color(data.wall));
    f.roofColor = field(t('dRoofColor'), color(data.roofColor));
    f.trim = field(t('dTrim'), color(data.trim));
    f.bandOn = field(t('dBand'), check(data.band)); f.band = color(data.band || '#ff9f43'); f.bandOn.after(f.band);
    f.awningOn = field(t('dAwning'), check(data.awning)); f.awning = color(data.awning || '#c0392b'); f.awningOn.after(f.awning);
    for (const k of ['balcony', 'columns', 'chimney', 'clock']) f[k] = field(t('d' + k[0].toUpperCase() + k.slice(1)), check(data[k]));

    const photoBox = $('d-photo-box');
    photoBox.style.display = photo ? '' : 'none';
    $('d-key').value = getApiKey();
    $('d-status').textContent = '';
    $('d-analyze').onclick = async () => {
      const file = $('d-file').files[0];
      setApiKey($('d-key').value.trim());
      if (!getApiKey()) { $('d-status').textContent = t('errNoKey'); return; }
      if (!file) return;
      $('d-status').textContent = t('analyzing');
      try {
        const res = await designFromPhoto(file, getLang());
        this.openDesigner({ ...res, id: data.id }, true);
        $('d-status').textContent = '✅';
      } catch (err) {
        $('d-status').textContent = t('errPhoto', { e: err.message === 'NO_KEY' ? t('errNoKey') : err.message });
      }
    };
    $('d-save').onclick = () => {
      const out = {
        id: data.id || Date.now(), name: f.name.value.trim(), emoji: f.emoji.value.trim() || '🏗️', role: f.role.value,
        floors: +f.floors.value || 1, width: +f.width.value || 1, depth: +f.depth.value || 1, roof: f.roof.value, window: f.window.value,
        wall: f.wall.value, roofColor: f.roofColor.value, trim: f.trim.value,
        band: f.bandOn.checked ? f.band.value : null, awning: f.awningOn.checked ? f.awning.value : null,
        balcony: f.balcony.checked, columns: f.columns.checked, chimney: f.chimney.checked, clock: f.clock.checked,
      };
      const i = this.designs.findIndex(x => x.id === out.id);
      if (i >= 0) this.designs[i] = out; else this.designs.push(out);
      saveDesigns(this.designs);
      this.bDesign = out;
      this.bFloors = out.floors;
      this.renderBuildMenu();
      this.addLog(t('saved', { name: out.name || t('b_custom') }));
      dlg.close();
    };
    $('d-cancel').onclick = () => dlg.close();
    if (!dlg.open) dlg.showModal();
  }

  // ---------- tools ----------
  renderTools() {
    const g = this.game.editor, grid = $('tool-grid');
    grid.textContent = '';
    for (const [k, e] of TOOL_LIST) {
      grid.appendChild(tile(e, t('tool_' + k), () => this.game.editor.setTool(g.tool === k ? null : k), g.tool === k ? 'on' : ''));
    }
    const tool = g.tool;
    $('tool-hint').textContent = !tool ? '' : (tool === 'place' ? t('placeHint') : t('hint_' + (['lamp', 'gardenlamp', 'traffic', 'tree', 'bench', 'flowers', 'busstop'].includes(tool) ? 'prop' : tool))) + ' ' + t('rcCancel');
    $('tool-done').style.display = tool ? '' : 'none';
    // river width
    const ex = $('tool-extra');
    ex.textContent = '';
    if (tool === 'river') {
      ex.appendChild(el('h3', null, t('riverWidth')));
      const row = el('div', 'chips');
      for (const [k, w] of Object.entries(RIVER_W)) {
        const b = el('button', 'chip-btn' + (g.riverWidth === w ? ' on' : ''), t('rw_' + k));
        b.onclick = () => { g.riverWidth = w; g.updateCurve(); this.renderTools(); };
        row.appendChild(b);
      }
      ex.appendChild(row);
    }
  }
  // ---------- undo / redo ----------
  renderHistory() {
    const h = this.game.history;
    $('btn-undo').disabled = !h.done.length;
    $('btn-redo').disabled = !h.undone.length;
    $('btn-undo').title = h.nextUndo ? t('undo') + ': ' + h.nextUndo : '';
    $('btn-redo').title = h.nextRedo ? t('redo') + ': ' + h.nextRedo : '';
    $('undo-what').textContent = h.nextUndo ? '↩️ ' + h.nextUndo : t('nothingUndo');
  }

  // ---------- camera ----------
  renderCamera() {
    const d = this.game.director, grid = $('cam-grid');
    grid.textContent = '';
    for (const [k, e] of CAM_LIST) {
      grid.appendChild(tile(e, t('cam_' + k), () => {
        const g = this.game;
        if (k === 'overview') g.director.overview();
        else if (k === 'follow' || k === 'cinema') { const c = g.selected; if (c) (k === 'cinema' ? g.cinematic(c) : d.setMode('follow', { char: c })); else this.addLog(t('notFound')); }
        else d.setMode(k);
      }, d.mode === k ? 'on' : ''));
    }
    grid.appendChild(tile('🚪', t(d.mode === 'interior' ? 'cam_exit' : 'cam_enter'), () => this.toggleEnter(), d.mode === 'interior' ? 'on' : ''));
    $('floor-row').style.display = d.mode === 'interior' ? '' : 'none';
    if (d.mode === 'interior') $('floor-n').textContent = t('floor', { n: d.floor + 1 });
  }

  // ---------- time ----------
  renderTime() {
    const dn = this.game.daynight;
    const icon = dn.night > .5 ? '🌙' : '☀️';
    $('hud-clock').textContent = `${icon} ${dn.clockText}`;
    $('clock-big').textContent = `${icon} ${dn.clockText}`;
    if (document.activeElement !== $('time-range')) $('time-range').value = dn.hour.toFixed(2);
    $('btn-pause').textContent = dn.paused ? '▶️ ' + t('resume') : '⏸️ ' + t('pause');
  }

  // ---------- citizens list ----------
  renderList() {
    const g = this.game, q = $('in-search').value.trim().toLowerCase();
    const box = $('cit-list');
    $('cit-count').textContent = g.chars.length;
    this.renderHud();
    box.textContent = '';
    if (!g.chars.length) { box.appendChild(el('p', 'hint', t('empty'))); return; }
    const qq = q.replace(/^@/, '');
    const list = g.chars.filter(c => !qq || c.name.toLowerCase().includes(qq) || (c.account?.handle || '').toLowerCase().includes(qq)).slice().reverse().slice(0, 200);
    for (const c of list) {
      const row = el('div', 'cit' + (g.selected === c ? ' on' : ''));
      row.appendChild(el('span', 'em', c.def.emoji));
      const nm = el('b', null, c.name);
      nm.dir = 'auto';
      row.appendChild(nm);
      row.appendChild(el('small', null, c.job === 'none' ? '' : `${JOBS[c.job].emoji} ${t('job_' + c.job)}`));
      row.appendChild(el('span', 'st', (c.hurt ? '🤕' : '') + c.status()));
      row.onclick = () => { g.select(c, true); this.setTab('sel'); };
      box.appendChild(row);
    }
  }

  // ---------- selected citizen or building ----------
  renderSelected(force) {
    const g = this.game, c = g.selected, b = g.selectedBuilding, card = $('sel-card');
    const key = c ? 'c' + c.id : b ? `b${b.id}.${b.complete}.${b.ownerId}.${staffOf(g, b).map(x => x.id + x.job).join()}` : '';
    if (!force && key === this.selKey) { this.refreshSelected(); return; }
    this.selKey = key;
    card.textContent = '';
    this.jobBtns = null;
    this.renderBuildMenu();
    if (b) return this.renderBuildingCard(b, card);
    if (!c) {
      const em = el('div', 'sel-empty');
      em.append(el('span', 'big', '👆'), el('p', null, t('pickHint')));
      card.appendChild(em);
      return;
    }

    const head = el('div', 'sel-head');
    head.appendChild(el('span', 'sel-emoji', c.def.emoji));
    const info = el('div', 'sel-info');
    this.selName = el('b', null, c.name);
    this.selName.dir = 'auto';
    this.selJob = el('small');
    info.append(this.selName, this.selJob);
    head.appendChild(info);
    const fol = el('button', 'icon', '🎥'); fol.title = t('follow'); fol.onclick = () => g.select(c, true);
    const cin = el('button', 'icon', '🎬'); cin.title = t('cinema'); cin.onclick = () => g.cinematic(c);
    const rem = el('button', 'icon danger', '🗑️'); rem.title = t('remove');
    rem.onclick = () => { if (confirm(t('removeConfirm', { name: c.name }))) g.removeCharacter(c); };
    head.append(fol, cin, rem);
    card.appendChild(head);
    this.renderProfileEditor(c, card);

    card.appendChild(el('h3', null, '💼 ' + t('job')));
    const jobs = el('div', 'grid');
    this.jobBtns = {};
    for (const j of JOB_ORDER) {
      const btn = tile(JOBS[j].emoji, t('job_' + j), () => g.assignJob(c, c.job === j ? 'none' : j));
      btn.appendChild(el('span', 'lock', '🔒'));
      jobs.appendChild(btn);
      this.jobBtns[j] = btn;
    }
    card.appendChild(jobs);

    card.appendChild(el('h3', null, '🏗️ ' + t('build')));
    const builds = el('div', 'grid');
    for (const ty of BUILD_MENU) builds.appendChild(tile(TYPES[ty].emoji, t('b_' + ty), () => { $('cmd-result').textContent = t('placeHint'); g.orderBuild(c, makeSpec(ty, { variant: this.bVariant }), null, true); }));
    card.appendChild(builds);

    card.appendChild(el('h3', null, '🎬 ' + t('actions')));
    const acts = el('div', 'grid');
    this.actBtns = {};
    for (const [a, e] of ACTION_LIST) { const btn = tile(e, t('a_' + a), () => g.doAction(c, a)); acts.appendChild(btn); this.actBtns[a] = btn; }
    card.appendChild(acts);

    card.appendChild(el('h3', null, '💬 ' + t('say')));
    const row = el('div', 'row-in');
    const inp = el('input');
    inp.placeholder = t('sayPh');
    inp.maxLength = 80;
    inp.dir = 'auto';
    const send = el('button', 'primary', t('send'));
    const doSay = () => { if (inp.value.trim()) { g.sayText(c, inp.value.trim()); inp.value = ''; } };
    send.onclick = doSay;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') doSay(); });
    row.append(inp, send);
    card.appendChild(row);
    this.refreshSelected();
  }
  refreshSelected() {
    const g = this.game, c = g.selected;
    if (!c || !this.jobBtns) return;
    this.selJob.textContent = `${t('an_' + c.animal)} · ${JOBS[c.job].emoji} ${t('job_' + c.job)}`;
    for (const j of JOB_ORDER) {
      const btn = this.jobBtns[j], place = JOBS[j].place;
      const locked = !!place && !g.town.has(place) && !(j === 'fisher' && g.water.list.length);
      btn.classList.toggle('on', c.job === j);
      btn.classList.toggle('locked', locked);
      btn.title = locked ? t('needs', { b: t('b_' + place) }) : '';
    }
    this.actBtns.hurt.style.display = c.hurt ? 'none' : '';
    this.actBtns.heal.style.display = c.hurt ? '' : 'none';
    this.actBtns.quit.style.display = c.job === 'none' ? 'none' : '';
  }
  renderBuildingCard(b, card) {
    const g = this.game;
    const head = el('div', 'sel-head');
    head.appendChild(el('span', 'sel-emoji', b.emoji));
    const info = el('div', 'sel-info');
    const nm = el('b', null, b.displayName());
    nm.dir = 'auto';
    const owner = g.getChar(b.ownerId);
    const lines = [t('floorsN', { n: b.spec.floors })];
    if (b.residents.length) lines.push(t('residents', { n: b.residents.length }));
    const w = g.workerCount(b);
    if (w) lines.push(t('workers', { n: w }));
    if (owner) lines.push(t('owner', { name: owner.name }));
    info.append(nm, el('small', null, lines.join(' · ')));
    head.appendChild(info);
    card.appendChild(head);
    if (!b.complete) {
      // real-time construction: how long is left, or finish it right away
      const prow = el('div', 'row-in');
      const eta = el('span', 'hint', `🔨 ${Math.floor(b.progress * 100)}% · ${t('finishIn', { t: fmtDur(b.remaining) })}`);
      const fin = el('button', null, '⚡ ' + t('finishNow'));
      fin.onclick = () => { b.finishNow(); b.tickConstruction(); this.renderSelected(true); };
      prow.append(eta, fin);
      card.appendChild(prow);
    }
    if (!['hospital', 'school', 'police', 'firestation', 'park', 'dock'].includes(b.kind)) {
      const orow = el('label', 'fld wide');
      const sel = el('select');
      const none = el('option', null, t('nobody')); none.value = ''; sel.appendChild(none);
      for (const ch of [...g.chars].sort((a, z) => a.name.localeCompare(z.name))) { const o = el('option', null, ch.name); o.value = ch.id; sel.appendChild(o); }
      sel.value = b.ownerId ?? '';
      sel.onchange = () => g.setOwner(b, sel.value ? g.getChar(+sel.value) : null);
      orow.append(el('span', null, '🔑 ' + t('ownerL')), sel);
      card.appendChild(orow);
    }
    // staff: who works here, hire someone, let someone go
    if (g.jobAt(b)) {
      card.appendChild(el('h3', null, '👷 ' + t('employees')));
      const ul = el('ul', 'staff-list');
      const staff = staffOf(g, b);
      if (!staff.length) ul.appendChild(el('li', 'empty', t('noEmployees')));
      for (const c of staff) {
        const li = el('li');
        const nm = el('span', null, `${c.pendingJob?.buildingId === b.id ? '⏳' : JOBS[c.job].emoji} ${c.name}`);
        nm.dir = 'auto';
        const x = el('button', 'icon danger', '✕');
        x.title = t('letGo');
        x.onclick = () => { if (c.pendingJob?.buildingId === b.id) c.pendingJob = null; else g.assignJob(c, 'none'); this.renderSelected(true); };
        li.append(nm, x);
        ul.appendChild(li);
      }
      card.appendChild(ul);
      const hrow = el('label', 'fld wide');
      const hs = el('select');
      const first = el('option', null, '➕ ' + t('hire')); first.value = ''; hs.appendChild(first);
      // each name shows what they do now; people without a job come first
      const jobOf = ch => {
        if (ch.job === 'none') return t('job_none');
        const wp = g.town.get(ch.workplaceId);
        return `${JOBS[ch.job].emoji} ${t('job_' + ch.job)}${wp ? ' · ' + wp.displayName() : ''}`;
      };
      const free = [...g.chars].filter(x => !staff.includes(x)).sort((a, z) => (a.job !== 'none') - (z.job !== 'none') || a.name.localeCompare(z.name));
      for (const [label, list] of [[t('hireFree'), free.filter(x => x.job === 'none')], [t('hireBusy'), free.filter(x => x.job !== 'none')]]) {
        if (!list.length) continue;
        const grp = document.createElement('optgroup');
        grp.label = label;
        for (const ch of list) { const o = el('option', null, `${ch.name} — ${jobOf(ch)}`); o.value = ch.id; grp.appendChild(o); }
        hs.appendChild(grp);
      }
      hs.onchange = () => { const ch = g.getChar(+hs.value); if (ch) { g.hire(ch, b); this.renderSelected(true); } };
      hrow.append(el('span', null, '🤝 ' + t('hire')), hs);
      card.appendChild(hrow);
    }
    const grid = el('div', 'grid');
    if (!TYPES[b.type]?.open && b.complete) grid.appendChild(tile('🚪', t('cam_enter'), () => g.director.setMode('interior', { building: b, floor: 0 })));
    if (b.complete) grid.appendChild(tile('🔥', t('fire'), () => g.startFire(b)));
    grid.appendChild(tile('🧨', t('demolish'), () => { if (confirm(t('demolishConfirm'))) g.demolish(b); }, 'danger'));
    card.appendChild(grid);
  }

  // ---------- town ----------
  renderTown() {
    const g = this.game, box = $('town-stats');
    box.textContent = '';
    let any = false;
    const counts = {};
    for (const b of g.town.all) if (b.complete) counts[b.kind] = (counts[b.kind] || 0) + 1;
    for (const [k, n] of Object.entries(counts)) {
      any = true;
      const chip = el('span', 'chip', `${(TYPES[k] || TYPES.custom).emoji} ${n}`);
      chip.title = t('b_' + k);
      box.appendChild(chip);
    }
    const sites = g.town.sites().length;
    if (sites) box.appendChild(el('span', 'chip warn', t('building', { n: sites })));
    if (!any && !sites) box.appendChild(el('p', 'hint', t('noBuildings')));
    const n = g.world.landR * 2 + 1;
    $('land-size').textContent = t('landSize', { n });
  }
}
