// Undo / redo (Ctrl+Z / Ctrl+Y) for what the player builds: roads, curved roads, bridges, water,
// street objects and buildings. Every step stores how to take it back and how to do it again.
import { t } from './i18n.js';

export class History {
  constructor(game) {
    this.game = game;
    this.done = [];
    this.undone = [];
    this.busy = false;   // true while undoing/redoing, so those changes are not recorded again
  }
  push(label, undo, redo) {
    if (this.busy) return;
    this.done.push({ label, undo, redo });
    if (this.done.length > 80) this.done.shift();
    this.undone = [];
    this.game.emit('history');
  }
  run(from, to, fn, msg) {
    const a = from.pop();
    if (!a) return false;
    this.busy = true;
    try { a[fn](); } catch (e) { console.warn('history', e); } finally { this.busy = false; }
    to.push(a);
    this.game.log(t(msg, { what: a.label }));
    this.game.emit('change');
    this.game.emit('history');
    return true;
  }
  undo() { return this.run(this.done, this.undone, 'undo', 'undone'); }
  redo() { return this.run(this.undone, this.done, 'redo', 'redone'); }
  get nextUndo() { return this.done.at(-1)?.label || ''; }
  get nextRedo() { return this.undone.at(-1)?.label || ''; }
}
