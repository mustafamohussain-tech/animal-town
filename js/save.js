// Auto-save the town in the browser (IndexedDB: big enough for 10,000 residents), export/import it as a file,
// and load a published town.json (viewer mode for followers).
import { getLang, setLang } from './i18n.js';

const KEY = 'animal-town-save-v2';

// ---------- the browser's database (localStorage only holds ~5 MB; a big town is more) ----------
let dbp = null;
function db() {
  dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('animal-town-save', 1);   // (the recorder keeps its own 'animal-town' database)
    r.onupgradeneeded = () => r.result.createObjectStore('town');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function dbDo(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction('town', mode), req = fn(tx.objectStore('town'));
    tx.oncomplete = () => res(req?.result);
    tx.onerror = tx.onabort = () => rej(tx.error);
  });
}
const dbGet = k => dbDo('readonly', s => s.get(k));
const dbSet = (k, v) => dbDo('readwrite', s => s.put(v, k));
const dbDel = k => dbDo('readwrite', s => s.delete(k));
const FOUNDED = 'animal-town-founded'; // first day of the town - never reset

// the day the town started (kept even when the town is reset)
export function foundedAt() {
  try {
    let v = +localStorage.getItem(FOUNDED);
    if (!v) { v = Date.now(); localStorage.setItem(FOUNDED, String(v)); }
    return v;
  } catch { return Date.now(); }
}

export function serialize(game) {
  return {
    v: 2,
    founded: game.founded,
    lang: getLang(),
    followNew: game.followNew,
    nightSleep: game.nightSleep,
    choosePlace: game.choosePlace,
    showCard: game.showCard,
    screenMode: game.screenMode,
    siteUrl: game.siteUrl || '',
    musicOn: !!game.music?.on,
    musicVol: game.music?.volume ?? .5,
    landR: game.world.landR,
    hour: +game.daynight.hour.toFixed(3),
    clockOffset: game.daynight.offset,
    cycleMs: game.daynight.cycleMs,
    realClock: game.daynight.real,
    buildDuration: game.buildDuration,
    paused: game.daynight.paused,
    roads: game.tiles.roadList(),
    curves: game.curves.toJSON(),
    water: game.water.toJSON(),
    dirt: game.tiles.dirtList(),
    paths: game.paths.toJSON(),
    parks: game.parks.toJSON(),
    props: game.props.toJSON(),
    buildings: game.town.all.map(b => b.toJSON()),
    chars: game.chars.map(c => c.toJSON()),
    vehicles: game.vehicles.toJSON(),
    events: game.events.toJSON(),
  };
}

export let lastSaveSize = 0;
let saving = false;
export async function saveGame(game) {
  if (game.viewer || game.noSave || saving) return; // visitors never overwrite anything
  saving = true;
  try {
    const s = JSON.stringify(serialize(game));
    lastSaveSize = s.length;
    await dbSet(KEY, s);
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }   // the old place (moved to the database)
  } catch (e) {
    try { localStorage.setItem(KEY, JSON.stringify(serialize(game))); } catch { /* storage full or blocked */ }
  } finally { saving = false; }
}

export function loadData(game, data, { keepLang = false } = {}) {
  if (!data || data.v !== 2) return false;
  game.loading = game.tiles.loading = true;   // no effects, no clearing of trees, no rebuilding of neighbours
  try { return loadInto(game, data, keepLang); } finally {
    game.loading = game.tiles.loading = false;
    game.tiles.finishLoad();
    game.landMap.mark();
  }
}
function loadInto(game, data, keepLang) {
  if (!keepLang) setLang(data.lang || 'en');
  if (data.founded) game.founded = data.founded;
  for (const k of ['followNew', 'nightSleep', 'choosePlace', 'showCard']) if (typeof data[k] === 'boolean') game[k] = data[k];
  if (data.screenMode) game.screenMode = data.screenMode;
  if (typeof data.siteUrl === 'string') game.siteUrl = data.siteUrl;
  game.savedMusic = { on: !!data.musicOn, vol: typeof data.musicVol === 'number' ? data.musicVol : .5 };
  game.world.setLand(data.landR || 5);
  if (typeof data.buildDuration === 'number') game.buildDuration = data.buildDuration;
  const dn = game.daynight;
  if (typeof data.cycleMs === 'number') dn.cycleMs = data.cycleMs;
  // older towns move to the real 24-hour clock once; after that the choice is kept
  dn.real = data.realClock ?? true;
  if (dn.real) dn.cycleMs = 24 * 3600000;
  dn.paused = !!data.paused;
  if (dn.paused && typeof data.hour === 'number') dn.hour = data.hour;
  else if (dn.real) dn.hour = dn.clockHour();
  else if (typeof data.clockOffset === 'number') { dn.offset = data.clockOffset; dn.hour = dn.clockHour(); }
  else if (typeof data.hour === 'number') dn.setHour(data.hour);
  const safe = (what, fn) => { try { fn(); } catch (e) { console.warn('skip', what, e); } };
  for (const [i, j] of data.roads || []) safe('road', () => game.tiles.setRoad(i, j, true));
  for (const c of data.curves || []) safe('curve', () => game.curves.add(c.pts, c.bridge, { id: c.id, links: c.links }));
  for (const [i, j] of data.dirt || []) safe('dirt', () => game.tiles.setDirt(i, j, true));
  for (const p of data.paths || []) safe('path', () => game.paths.add(p.pts, { id: p.id }));
  for (const p of data.parks || []) safe('park', () => game.parks.add(p.pts, { id: p.id, made: p.made }));
  for (const w of data.water || []) safe('water', () => game.water.add(w, { id: w.id }));
  for (const b of data.buildings || []) {
    safe('building', () => game.town.create(b.spec, b.i, b.j, b.rot, { id: b.id, progress: b.progress, startedAt: b.startedAt, duration: b.duration, ownerId: b.ownerId, builtBy: b.builtBy, residents: b.residents, crops: b.crops }));
  }
  for (const p of data.props || []) safe('prop', () => game.props.add(p.type, p.x, p.z, p.rot, { id: p.id, natural: p.natural, scale: p.scale }));
  for (const c of data.chars || []) safe('citizen', () => game.addCharacter(c, false));
  // the residents exist now: house signs can show their owners' names
  for (const b of game.town.awake) safe('sign', () => b.refreshText());
  for (const v of data.vehicles || []) safe('vehicle', () => game.vehicles.add(v.ownerId, v));
  if (data.events?.calendar) game.events.calendar = data.events.calendar;
  game.daynight.apply();
  return true;
}

export async function loadGame(game) {
  let data = null;
  try { const s = await dbGet(KEY); if (s) data = JSON.parse(s); } catch (e) { data = null; }
  if (!data) { try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { data = null; } }
  return loadData(game, data);
}

// everything, including day 1 of the town (the day counter starts again)
export async function clearAll() {
  await clearSave();
  try { localStorage.removeItem(FOUNDED); } catch (e) { /* ignore */ }
}
export async function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  try { await dbDel(KEY); } catch (e) { /* ignore */ }
}

// download the whole town as a file (backup, or to publish it for followers)
export function exportTown(game) {
  const blob = new Blob([JSON.stringify(serialize(game))], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'town.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// replace the saved town with a file, then reload
export async function importTown(file) {
  const text = await file.text(), data = JSON.parse(text);
  if (!data || data.v !== 2) throw new Error('not a town file');
  await dbSet(KEY, text);
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  if (data.founded) localStorage.setItem(FOUNDED, String(data.founded));
}
