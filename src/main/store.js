'use strict';
const fs = require('fs');
const path = require('path');

const HISTORY_LIMIT = 500;

/** Basit, kalıcı JSON deposu (ayarlar + kuyruk + geçmiş). Yazma atomik yapılır. */
class Store {
  constructor(dir) {
    this.file = path.join(dir, 'void-clipper.json');
    this.data = { settings: {}, queue: [], history: [] };
    this._load();
  }

  _load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = {
        settings: raw.settings || {},
        queue: Array.isArray(raw.queue) ? raw.queue : [],
        history: Array.isArray(raw.history) ? raw.history : [],
      };
    } catch {
      /* ilk açılış veya bozuk dosya: varsayılanlarla devam */
    }
  }

  _write() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('Kayıt yazılamadı:', err.message);
    }
  }

  get settings() {
    return this.data.settings;
  }

  setSettings(patch) {
    this.data.settings = { ...this.data.settings, ...patch };
    this._write();
    return this.data.settings;
  }

  get queue() {
    return this.data.queue;
  }

  saveQueue(items) {
    // Geçici alanlar kaydedilmez
    this.data.queue = items.map(({ speed, eta, ...rest }) => rest);
    this._write();
  }

  /** Geçmiş: en yeni başta. */
  get history() {
    return this.data.history;
  }

  addHistory(entry) {
    this.data.history = [entry, ...this.data.history.filter((h) => h.id !== entry.id)].slice(0, HISTORY_LIMIT);
    this._write();
  }

  removeHistory(id) {
    this.data.history = this.data.history.filter((h) => h.id !== id);
    this._write();
  }

  clearHistory() {
    this.data.history = [];
    this._write();
  }
}

module.exports = { Store, HISTORY_LIMIT };
