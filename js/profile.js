// Resident profile: what they're doing, their goal, time in town, belongings, their social account,
// and a little portrait photo. Shown as a card on screen (in the recording) and edited in the panel.
import * as THREE from 'three';
import { t, getLang } from './i18n.js';
import { JOBS } from './jobs.js';

export const PLATFORMS = {
  tiktok: { label: 'TikTok', url: h => `https://www.tiktok.com/@${h}` },
  instagram: { label: 'Instagram', url: h => `https://www.instagram.com/${h}/` },
  youtube: { label: 'YouTube', url: h => `https://www.youtube.com/@${h}` },
};
const cleanHandle = h => String(h || '').trim().replace(/^@+/, '').replace(/[^\w.\-]/g, '').slice(0, 40);
export function accountUrl(acc) {
  const h = cleanHandle(acc?.handle);
  const p = PLATFORMS[acc?.platform] || PLATFORMS.tiktok;
  return h ? p.url(encodeURIComponent(h)) : '';
}
export { cleanHandle };

// what the citizen is doing right now, in words
export function statusText(c) {
  const g = c.game, n = c.activity?.name;
  if (c.hurt) return t('stat_patient');
  if (c.swimming) return t('stat_swim');
  if (c.inBoat) return t('stat_boat');
  if (n === 'build') return t('stat_build');
  if (n === 'fire') return t('stat_fire');
  if (n === 'sleep' || c.pose === 'sleep') return t('stat_sleep');
  if (n === 'work') { const b = g.town.get(c.workplaceId); return t('stat_work', { b: b ? b.displayName() : t('job_' + c.job) }); }
  if (c.pose === 'dance') return t('stat_dance');
  if (c.pose === 'talk' || c.chatWith) return t('stat_chat');
  if (c.pose === 'eat' || c.pose === 'eatStand') return t('stat_eat');
  if (c.pose === 'sit' || c.pose === 'sitGround') return t('stat_sit');
  if (c.moving) return t('stat_walk');
  return t('stat_idle');
}

// how long they've been in town (real time since they joined)
export function timeInTown(c) {
  const ms = Date.now() - (c.joinedAt || Date.now());
  const days = Math.floor(ms / 86400000), hours = Math.floor(ms / 3600000), mins = Math.floor(ms / 60000);
  if (days >= 1) return t('days', { n: days });
  if (hours >= 1) return t('hours', { n: hours });
  if (mins >= 1) return t('mins', { n: mins });
  return t('justArrived');
}
export function arrivedText(c) {
  return new Date(c.joinedAt || Date.now()).toLocaleDateString(getLang() === 'ar' ? 'ar' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

// everything this citizen owns, lives in, built or carries
export function belongings(c) {
  const g = c.game, out = [], seen = new Set();
  const home = g.town.get(c.homeId);
  if (home) { out.push([home.emoji, t(home.ownerId === c.id ? 'ownHome' : 'livesIn', { b: home.displayName() })]); seen.add(home.id); }
  for (const b of g.town.all) {
    if (b.ownerId === c.id && b.id !== c.homeId) out.push([b.emoji, t('ownsB', { b: b.displayName() + (b.complete ? '' : ` (${Math.floor(b.progress * 100)}%)`) })]);
    else if (b.builtBy === c.id && b.ownerId !== c.id) out.push(b.complete ? ['🏗️', t('builtB', { b: b.displayName() })] : ['🔨', t('buildingB', { b: `${b.displayName()} (${Math.floor(b.progress * 100)}%)` })]);
  }
  for (const v of g.vehicles.ofOwner(c.id)) out.push(['🚗', t('car_' + v.type)]);
  const wp = g.town.get(c.workplaceId), boss = wp && g.getChar(wp.ownerId);
  if (wp && c.job !== 'none') out.push([JOBS[c.job].emoji, boss && boss !== c ? t('worksFor', { o: boss.name, b: wp.displayName() }) : t('worksAt', { b: wp.displayName() })]);
  const next = c.pendingJob && g.town.get(c.pendingJob.buildingId);
  if (next) out.push(['⏳', t('startsAt', { b: next.displayName() })]);
  if (c.carry) out.push(['🛍️', t('bag')]);
  return out;
}

// a small photo of the citizen's face, rendered from the 3D world
const pcam = new THREE.PerspectiveCamera(32, 1, .1, 60);
const v = new THREE.Vector3(), v2 = new THREE.Vector2();
export function portrait(game, c, S = 160) {
  try {
    const r = game.world.renderer, scene = game.world.scene;
    c.head.getWorldPosition(v);
    const a = c.root.rotation.y + .45;
    pcam.position.set(v.x + Math.sin(a) * 2.4, v.y + .35, v.z + Math.cos(a) * 2.4);
    pcam.lookAt(v.x, v.y - .25, v.z);
    // photo of this citizen only: hide everyone else for a moment
    const hidden = game.chars.filter(o => o !== c && o.root.visible);
    hidden.forEach(o => { o.root.visible = false; });
    const wasVisible = c.root.visible;
    c.root.visible = true;
    r.getSize(v2);
    const pr = r.getPixelRatio();
    r.setScissorTest(true);
    r.setViewport(0, 0, S / pr, S / pr);
    r.setScissor(0, 0, S / pr, S / pr);
    r.render(scene, pcam);
    const out = document.createElement('canvas');
    out.width = out.height = S;
    const cv = r.domElement;
    out.getContext('2d').drawImage(cv, 0, cv.height - S, S, S, 0, 0, S, S);
    r.setScissorTest(false);
    r.setViewport(0, 0, v2.x, v2.y);
    c.root.visible = wasVisible;
    hidden.forEach(o => { o.root.visible = true; });
    game.world.render();
    return out.toDataURL('image/jpeg', .85);
  } catch (e) { return ''; }
}

// the card shown inside the game frame (so it appears in the video)
export class ProfileCard {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('profile-card');
    this.c = null;
    document.getElementById('pc-close').onclick = () => { this.hide(); game.select(null); };
    setInterval(() => this.update(), 1000);
  }
  show(c) {
    this.c = c;
    if (!c || !this.game.showCard) { this.el.classList.add('hidden'); return; }
    document.getElementById('pc-portrait').src = portrait(this.game, c) || '';
    this.el.classList.remove('hidden');
    this.update();
  }
  hide() { this.c = null; this.el.classList.add('hidden'); }
  refresh() { if (this.c) this.show(this.c); }
  update() {
    const c = this.c;
    if (!c || this.el.classList.contains('hidden')) return;
    if (!this.game.chars.includes(c)) { this.hide(); return; }
    const $ = id => document.getElementById(id);
    $('pc-emoji').textContent = c.def.emoji;
    $('pc-name').textContent = c.name;
    const url = accountUrl(c.account), h = cleanHandle(c.account?.handle);
    const a = $('pc-handle');
    a.textContent = h ? `${(PLATFORMS[c.account.platform] || PLATFORMS.tiktok).label} · @${h} ↗` : '';
    a.href = url || '#';
    a.style.display = h ? '' : 'none';
    $('pc-status').textContent = statusText(c);
    const gl = $('pc-goals');
    gl.textContent = '';
    const goals = [...c.goals.filter(x => !x.done), ...c.goals.filter(x => x.done)].slice(0, 3);
    if (!goals.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = t('noGoal'); gl.appendChild(li); }
    for (const x of goals) { const li = document.createElement('li'); li.className = x.done ? 'done' : ''; li.textContent = (x.done ? '✅ ' : '🎯 ') + x.text; li.dir = 'auto'; gl.appendChild(li); }
    if (c.goals.length > 3) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = '+' + (c.goals.length - 3); gl.appendChild(li); }
    const rows = $('pc-rows');
    rows.textContent = '';
    for (const [k, val] of [
      [t('animalL'), t('an_' + c.animal)],
      [t('job'), c.job === 'none' ? t('job_none') : `${JOBS[c.job].emoji} ${t('job_' + c.job)}`],
      [t('timeInTown'), timeInTown(c)],
      [t('arrived'), arrivedText(c)],
    ]) {
      const row = document.createElement('div');
      const s1 = document.createElement('span'); s1.textContent = k;
      const s2 = document.createElement('b'); s2.textContent = val;
      row.append(s1, s2);
      rows.appendChild(row);
    }
    const list = belongings(c), ul = $('pc-bel');
    $('pc-bel-n').textContent = list.length;
    ul.textContent = '';
    if (!list.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = t('noBelongings'); ul.appendChild(li); }
    if (list.length > 5) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = '+' + (list.length - 5); ul.appendChild(li); }
    for (const [e, txt] of list.slice(0, 5)) { const li = document.createElement('li'); li.textContent = `${e} ${txt}`; li.dir = 'auto'; ul.appendChild(li); }
  }
}

// "3 d 4 h" / "5 h 20 min" / "12 min"
export function fmtDur(ms) {
  const m = Math.max(1, Math.ceil(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d) return t('dur_d', { d, h });
  if (h) return t('dur_h', { h, m: mm });
  return t('dur_m', { m: mm });
}
export function fmtDate(ms) {
  return new Date(ms).toLocaleDateString(getLang() === 'ar' ? 'ar' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}
// people who work (or will work) in a building
export function staffOf(game, b) {
  return game.chars.filter(c => (c.workplaceId === b.id && c.job !== 'none') || c.pendingJob?.buildingId === b.id);
}

// the building card shown inside the game frame: what it is, who owns it, construction time, staff
export class BuildingCard {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('bld-card');
    this.b = null;
    document.getElementById('bc-close').onclick = () => { this.hide(); game.selectBuilding(null); };
    setInterval(() => this.update(), 1000);
  }
  show(b) {
    this.b = b;
    if (!b || !this.game.showCard) { this.el.classList.add('hidden'); return; }
    this.el.classList.remove('hidden');
    this.update();
  }
  hide() { this.b = null; this.el.classList.add('hidden'); }
  update() {
    const b = this.b, g = this.game;
    if (!b || this.el.classList.contains('hidden')) return;
    if (!g.town.all.includes(b)) { this.hide(); return; }
    const $ = id => document.getElementById(id);
    $('bc-emoji').textContent = b.emoji;
    $('bc-name').textContent = b.displayName();
    $('bc-kind').textContent = t('b_' + b.kind);
    const pct = Math.floor(b.progress * 100);
    $('bc-dot').className = b.complete ? '' : 'build';
    $('bc-status').textContent = b.complete ? `${t('openSince')} ${fmtDate(b.startedAt + b.duration)}`
      : `🔨 ${t('underConstruction')} · ${pct}% · ${t('finishIn', { t: fmtDur(b.remaining) })}`;
    $('bc-prog').classList.toggle('hidden', b.complete);
    $('bc-prog').firstElementChild.style.width = pct + '%';

    const rows = $('bc-rows');
    rows.textContent = '';
    const row = (k, val) => {
      const r = document.createElement('div');
      const s1 = document.createElement('span'); s1.textContent = k;
      const s2 = typeof val === 'string' ? document.createElement('b') : val;
      if (typeof val === 'string') s2.textContent = val;
      s2.dir = 'auto';
      r.append(s1, s2);
      rows.appendChild(r);
    };
    const owner = g.getChar(b.ownerId);
    if (owner) {
      const url = accountUrl(owner.account);
      const a = document.createElement(url ? 'a' : 'b');
      a.textContent = owner.name + (url ? ' ↗' : '');
      if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener'; }
      row('🔑 ' + t('ownerL'), a);
    } else row('🔑 ' + t('ownerL'), t('publicB'));
    const builder = g.getChar(b.builtBy);
    if (builder) row('🏗️ ' + t('builtByL'), builder.name);
    row('🏢 ' + t('floorsL'), String(b.spec.floors));
    row('📅 ' + t('startedL'), fmtDate(b.startedAt));
    if (b.residents.length) row('🛏️ ' + t('residentsL'), String(b.residents.length));

    const staff = staffOf(g, b), ul = $('bc-emp');
    $('bc-staff').style.display = g.jobAt(b) || staff.length ? '' : 'none';
    $('bc-emp-n').textContent = staff.length;
    ul.textContent = '';
    const li = (txt, cls) => { const x = document.createElement('li'); x.textContent = txt; x.dir = 'auto'; if (cls) x.className = cls; ul.appendChild(x); };
    if (!staff.length) li(t('noEmployees'), 'empty');
    for (const c of staff.slice(0, 5)) li(c.pendingJob?.buildingId === b.id ? `⏳ ${c.name}` : `${JOBS[c.job].emoji} ${c.name}`);
    if (staff.length > 5) li('+' + (staff.length - 5), 'empty');
  }
}

// link that opens the game focused on this resident (?follow=handle)
export function followLink(c) {
  const id = cleanHandle(c.account?.handle) || c.name.replace(/^@+/, '');
  // use the public website address when it is set (so followers can open it), else this page
  const site = (c.game.siteUrl || '').trim().replace(/[?#].*$/, '');
  const base = /^https?:\/\//.test(site) ? (site.endsWith('/') ? site : site + '/') : `${location.origin}${location.pathname}`;
  return `${base}?follow=${encodeURIComponent(id)}`;
}

// find usernames in: an Instagram data export (followers_1.json), a TikTok data export,
// or plain text (one name per line, commas, @names or profile links)
export function parseFollowers(text) {
  const out = new Map();
  const add = (name, at, ig) => {
    name = cleanHandle(name);
    if (name && !out.has(name.toLowerCase())) out.set(name.toLowerCase(), { name, at: at || null, ig: !!ig });
  };
  const fromUrl = u => (String(u).match(/(?:instagram\.com|tiktok\.com)\/@?([\w.\-]+)/i) || [])[1];
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  if (json) {
    const walk = o => {
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o.string_list_data)) {
        for (const d of o.string_list_data) add(d.value || fromUrl(d.href) || o.title, d.timestamp ? d.timestamp * 1000 : null, true);
        return;
      }
      const u = o.UserName || o.username || o.userName;
      if (typeof u === 'string') { add(u, o.Date ? Date.parse(o.Date.replace(' ', 'T')) || null : null, false); return; }
      Object.values(o).forEach(walk);
    };
    walk(json);
  } else {
    for (const part of text.split(/[\s,;]+/)) {
      if (!part) continue;
      const u = fromUrl(part);
      add(u || part, null, /instagram/i.test(part));
    }
  }
  return [...out.values()];
}
