// Auto-save the town in the browser (localStorage), export/import it as a file,
// and load a published town.json (viewer mode for followers).
import { getLang, setLang } from './i18n.js';

const KEY = 'animal-town-save-v2';
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

export function saveGame(game) {
  if (game.viewer) return; // visitors never overwrite anything
  try { localStorage.setItem(KEY, JSON.stringify(serialize(game))); } catch (e) { /* storage full or blocked */ }
}

export function loadData(game, data, { keepLang = false } = {}) {
  if (!data || data.v !== 2) return false;
  if (!keepLang) setLang(data.lang || 'ar');
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
  for (const v of data.vehicles || []) safe('vehicle', () => game.vehicles.add(v.ownerId, v));
  if (data.events?.calendar) game.events.calendar = data.events.calendar;
  game.daynight.apply();
  return true;
}

export function loadGame(game) {
  let data;
  try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { data = null; }
  return loadData(game, data);
}

// everything, including day 1 of the town (the day counter starts again)
export function clearAll() {
  clearSave();
  try { localStorage.removeItem(FOUNDED); } catch (e) { /* ignore */ }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
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
  const data = JSON.parse(await file.text());
  if (!data || data.v !== 2) throw new Error('not a town file');
  localStorage.setItem(KEY, JSON.stringify(data));
  if (data.founded) localStorage.setItem(FOUNDED, String(data.founded));
}
