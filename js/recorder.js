// Recording the game frame to video files on this computer.
// The browser asks once to share "this tab"; after that clips start and stop by themselves
// (a new follower arrives, a town event starts) and long recordings are saved in parts.
// Files go to a folder you choose (Chrome / Edge) or to Downloads.
import { t } from './i18n.js';

const MIMES = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4',
  'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
const OPTS_KEY = 'animal-town-rec';

// the chosen folder is remembered between visits (IndexedDB can keep folder handles)
function idb(mode, fn) {
  return new Promise((res, rej) => {
    const r = indexedDB.open('animal-town', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => {
      const tx = r.result.transaction('kv', mode), q = fn(tx.objectStore('kv'));
      tx.oncomplete = () => res(q?.result);
      tx.onerror = () => rej(tx.error);
    };
    r.onerror = () => rej(r.error);
  });
}
const kvGet = k => idb('readonly', s => s.get(k)).catch(() => null);
const kvSet = (k, v) => idb('readwrite', s => s.put(v, k)).catch(() => {});
const pad = n => String(n).padStart(2, '0');

export class Recorder {
  constructor(game, music) {
    this.game = game;
    this.music = music;
    this.stream = null;     // the captured game frame (+ music)
    this.rec = null;        // the running MediaRecorder
    this.info = null;       // what is being recorded: { kind, name, startedAt, until, mime }
    this.dir = null;        // folder handle
    this.canvasOnly = false;
    this.saved = 0;
    this.lastFile = '';
    this.opts = { onJoin: true, onEvent: false, clipSec: 30, segMin: 10 };
    try { Object.assign(this.opts, JSON.parse(localStorage.getItem(OPTS_KEY)) || {}); } catch (e) { /* defaults */ }
    kvGet('recDir').then(d => { if (d) { this.dir = d; this.emit(); } });
    game.on('joined', c => this.onJoin(c));
    game.on('event', key => this.onEvent(key));
    setInterval(() => this.tick(), 500);
  }
  get canTab() { return !!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== 'undefined'; }
  get canPickFolder() { return 'showDirectoryPicker' in window; }
  get armed() { return !!this.stream && this.stream.getVideoTracks().some(tr => tr.readyState === 'live'); }
  get recording() { return !!this.rec && this.rec.state === 'recording'; }
  get elapsed() { return this.info ? Date.now() - this.info.startedAt : 0; }
  emit() { this.game.emit('recorder'); }
  setOpt(k, v) {
    this.opts[k] = v;
    try { localStorage.setItem(OPTS_KEY, JSON.stringify(this.opts)); } catch (e) { /* not saved */ }
    this.emit();
  }

  async pickFolder() {
    const d = await showDirectoryPicker({ id: 'animal-town-videos', mode: 'readwrite', startIn: 'videos' });
    this.dir = d;
    await kvSet('recDir', d);
    this.emit();
  }
  async folderReady() {
    try { return !!this.dir && (await this.dir.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch (e) { return false; }
  }

  // ask once (needs a click): record this tab, cut down to the game frame
  async arm() {
    if (this.armed) return true;
    // the music goes straight into the video, so keep its sound engine running
    this.music.setup();
    this.music.ctx.resume();
    this.music.keepAlive = true;
    const audio = this.music.recordStream().getAudioTracks();
    let video;
    if (this.canTab) {
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 }, audio: false,
        preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', monitorTypeSurfaces: 'exclude',
      });
      [video] = s.getVideoTracks();
      const frame = document.getElementById('frame');
      // only the game frame, never the panel: Element Capture (newer Chrome), else Region Capture
      try {
        if (window.RestrictionTarget && video.restrictTo) await video.restrictTo(await RestrictionTarget.fromElement(frame));
        else if (window.CropTarget && video.cropTo) await video.cropTo(await CropTarget.fromElement(frame));
      } catch (e) {
        try { if (window.CropTarget && video.cropTo) await video.cropTo(await CropTarget.fromElement(frame)); } catch (e2) { console.warn('crop failed', e2); }
      }
      this.canvasOnly = false;
    } else {
      // older browsers: just the 3D picture (no names or cards)
      [video] = this.game.world.renderer.domElement.captureStream(30).getVideoTracks();
      this.canvasOnly = true;
    }
    video.addEventListener('ended', () => { this.stop(); this.stream = null; this.emit(); });
    this.stream = new MediaStream([video, ...audio]);
    // the save folder may need its permission again after a restart (also needs this click)
    if (this.dir && !(await this.folderReady())) { try { await this.dir.requestPermission({ mode: 'readwrite' }); } catch (e) { /* falls back to Downloads */ } }
    this.emit();
    return true;
  }
  disarm() {
    this.stop();
    this.stream?.getTracks().forEach(tr => { if (tr.kind === 'video') tr.stop(); });
    this.stream = null;
    this.music.keepAlive = false;
    this.emit();
  }

  // kind: manual | join | event. sec = stop by itself after this many seconds
  start(kind = 'manual', name = '', sec = 0) {
    if (!this.armed || this.recording) return false;
    const mime = MIMES.find(m => MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(this.stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 10e6, audioBitsPerSecond: 160e3 });
    const chunks = [];
    const info = { kind, name, startedAt: Date.now(), until: sec ? Date.now() + sec * 1000 : 0, mime: rec.mimeType || mime || 'video/webm' };
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => this.save(new Blob(chunks, { type: info.mime.split(';')[0] }), info);
    rec.start(1000);
    this.rec = rec;
    this.info = info;
    this.emit();
    return true;
  }
  stop() {
    if (this.recording) this.rec.stop();
    this.rec = null;
    this.info = null;
    this.emit();
  }

  tick() {
    if (!this.recording) return;
    const i = this.info, now = Date.now();
    if (i.until && now >= i.until) { this.stop(); return; }
    // long recordings are saved in parts so nothing is lost and files stay small
    if (i.kind === 'manual' && this.opts.segMin && now - i.startedAt >= this.opts.segMin * 60000) { this.stop(); this.start('manual'); }
  }

  // a new follower: follow them from the bus, then cinematic shots
  onJoin(c) {
    if (!this.opts.onJoin || !this.armed) return;
    if (this.recording) {
      // another arrival during a clip: just make the clip a bit longer
      if (this.info.kind === 'join') this.info.until = Math.max(this.info.until, Date.now() + this.opts.clipSec * 600);
      return;
    }
    const g = this.game;
    g.select(c, true);
    setTimeout(() => { if (g.chars.includes(c) && !c.inBus) g.cinematic(c); }, 9000);
    this.start('join', c.name, this.opts.clipSec);
  }
  onEvent(key) {
    if (!this.opts.onEvent || !this.armed || this.recording) return;
    const g = this.game;
    g.director.setMode('plane');
    setTimeout(() => { if (g.chars.length) g.cinematic(g.chars[Math.floor(Math.random() * g.chars.length)]); }, this.opts.clipSec * 400);
    this.start('event', t('ev_' + key), this.opts.clipSec);
  }

  async save(blob, info) {
    if (!blob.size) return;
    const ext = info.mime.includes('mp4') ? 'mp4' : 'webm';
    const d = new Date(info.startedAt);
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    const who = String(info.name || '').replace(/[^\w؀-ۿ.-]+/g, '').slice(0, 40);
    const file = `animal-town_${stamp}${info.kind !== 'manual' ? '_' + info.kind : ''}${who ? '_' + who : ''}.${ext}`;
    let where = 'download';
    if (await this.folderReady()) {
      try {
        const fh = await this.dir.getFileHandle(file, { create: true });
        const w = await fh.createWritable();
        await w.write(blob);
        await w.close();
        where = 'folder';
      } catch (e) { console.warn('save to folder failed', e); }
    }
    if (where === 'download') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    }
    this.saved++;
    this.lastFile = file;
    this.game.log(t(where === 'folder' ? 'recSavedDir' : 'recSavedDl', { f: file, d: this.dir?.name || '' }));
    this.emit();
  }
}
