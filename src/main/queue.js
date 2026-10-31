'use strict';
const { EventEmitter } = require('events');
const crypto = require('crypto');

const PRIORITY = { high: 2, normal: 1, low: 0 };

/**
 * İndirme kuyruğu. `runner(item, ctx)` bir Promise döndürür ve
 * ctx.progress({percent, speed, eta}) ile ilerleme bildirir,
 * ctx.setCancel(fn) ile iptal fonksiyonunu kaydeder.
 */
class DownloadQueue extends EventEmitter {
  constructor({ runner, concurrency = 2, initial = [], save = () => {} }) {
    super();
    this.runner = runner;
    this.concurrency = Math.min(8, Math.max(1, concurrency));
    this.save = save;
    this.items = initial.map((it) => ({
      ...it,
      // Uygulama kapanırken yarım kalanlar baştan kuyruğa döner
      status: it.status === 'running' ? 'queued' : it.status,
      speed: 0,
      eta: 0,
    }));
    this._cancels = new Map();
    this._persistTimer = null;
  }

  list() {
    return this.items.map((i) => ({ ...i }));
  }

  _find(id) {
    return this.items.find((i) => i.id === id);
  }

  _changed(persist = true) {
    this.emit('update', this.list());
    if (persist) {
      clearTimeout(this._persistTimer);
      this._persistTimer = setTimeout(() => this.save(this.items), 300);
    }
  }

  flush() {
    clearTimeout(this._persistTimer);
    this.save(this.items);
  }

  add(entries, priority = 'normal') {
    const added = [];
    for (const e of entries) {
      const dup = this.items.find(
        (i) => i.sourceKey && i.sourceKey === e.sourceKey && ['queued', 'running', 'paused'].includes(i.status)
      );
      if (dup) continue;
      const item = {
        id: crypto.randomUUID(),
        kind: e.kind,
        sourceKey: e.sourceKey || '',
        sourceId: e.id || '',
        title: e.title,
        fileName: e.fileName || '',
        output: ['4k60', '1440p60', '1080p60', 'vblur', 'vcrop', 'vblur720', 'vcrop720'].includes(e.output) ? e.output : 'original',
        channel: e.channel || '',
        createdAt: e.createdAt || '',
        thumbnail: e.thumbnail || '',
        url: e.url,
        quality: e.quality || 'source',
        duration: Number(e.duration) || 0,
        trimStart: Number(e.trimStart) > 0 ? Number(e.trimStart) : 0,
        trimEnd: Number(e.trimEnd) > 0 ? Number(e.trimEnd) : 0,
        priority: PRIORITY[priority] ?? 1,
        status: 'queued',
        percent: 0,
        speed: 0,
        eta: 0,
        bytesDone: 0,
        bytesTotal: 0,
        totalEstimated: false,
        filePath: '',
        error: '',
        addedAt: Date.now(),
      };
      this.items.push(item);
      added.push(item);
    }
    this._changed();
    this._pump();
    return added.length;
  }

  setConcurrency(n) {
    this.concurrency = Math.min(8, Math.max(1, parseInt(n, 10) || 1));
    this._pump();
  }

  pause(id) {
    const it = this._find(id);
    if (it && it.status === 'queued') {
      it.status = 'paused';
      this._changed();
    }
  }

  resume(id) {
    const it = this._find(id);
    if (it && it.status === 'paused') {
      it.status = 'queued';
      this._changed();
      this._pump();
    }
  }

  /** Dosya adını değiştirir (yalnızca henüz başlamamış indirmelerde). */
  rename(id, name) {
    const it = this._find(id);
    if (!it || !['queued', 'paused'].includes(it.status)) return false;
    it.fileName = String(name || '').trim();
    this._changed();
    return true;
  }

  cancel(id) {
    const it = this._find(id);
    if (!it) return;
    if (it.status === 'running') {
      it.status = 'canceled';
      const c = this._cancels.get(id);
      if (c) c();
    } else if (['queued', 'paused'].includes(it.status)) {
      it.status = 'canceled';
    }
    it.speed = 0;
    it.eta = 0;
    this._changed();
  }

  retry(id) {
    const it = this._find(id);
    if (it && ['error', 'canceled'].includes(it.status)) {
      it.status = 'queued';
      it.percent = 0;
      it.bytesDone = 0;
      it.bytesTotal = 0;
      it.error = '';
      this._changed();
      this._pump();
    }
  }

  remove(id) {
    const it = this._find(id);
    if (!it) return;
    if (it.status === 'running') this.cancel(id);
    this.items = this.items.filter((i) => i.id !== id);
    this._changed();
  }

  clearFinished() {
    this.items = this.items.filter((i) => !['done', 'canceled', 'error'].includes(i.status));
    this._changed();
  }

  _nextQueued() {
    const queued = this.items.filter((i) => i.status === 'queued');
    queued.sort((a, b) => b.priority - a.priority || a.addedAt - b.addedAt);
    return queued[0];
  }

  _running() {
    return this.items.filter((i) => i.status === 'running').length;
  }

  /** Uygulama kapanırken: çalışanları durdur, baştan başlamak üzere kuyruğa geri al. */
  shutdown() {
    this._closing = true;
    for (const it of this.items) {
      if (it.status === 'running') {
        const c = this._cancels.get(it.id);
        it.status = 'queued';
        it.percent = 0;
        if (c) c();
      }
    }
    this.flush();
  }

  _pump() {
    if (this._closing) return;
    while (this._running() < this.concurrency) {
      const next = this._nextQueued();
      if (!next) break;
      this._start(next);
    }
  }

  _start(item) {
    item.status = 'running';
    item.error = '';
    this._changed(false);

    let lastEmit = 0;
    const ctx = {
      setCancel: (fn) => this._cancels.set(item.id, fn),
      setFilePath: (p) => {
        item.filePath = p;
      },
      progress: ({ percent, speed, eta, bytes, total, estimated }) => {
        if (item.status !== 'running') return;
        if (typeof percent === 'number') item.percent = Math.max(0, Math.min(100, percent));
        if (typeof bytes === 'number') item.bytesDone = bytes;
        if (typeof total === 'number') {
          item.bytesTotal = total;
          item.totalEstimated = !!estimated;
        }
        item.speed = speed || 0;
        item.eta = eta || 0;
        const now = Date.now();
        if (now - lastEmit > 250) {
          lastEmit = now;
          this._changed(false);
        }
      },
    };

    Promise.resolve()
      .then(() => this.runner(item, ctx))
      .then((filePath) => {
        if (item.status === 'canceled' || this._closing) return;
        item.status = 'done';
        item.percent = 100;
        if (filePath) item.filePath = filePath;
        this.emit('finished', { ...item });
      })
      .catch((err) => {
        if (item.status === 'canceled' || this._closing) return;
        item.status = 'error';
        item.error = (err && err.message) || String(err);
        this.emit('finished', { ...item });
      })
      .finally(() => {
        this._cancels.delete(item.id);
        item.speed = 0;
        item.eta = 0;
        if (this._closing) return;
        this._changed();
        this._pump();
      });
  }
}

module.exports = { DownloadQueue, PRIORITY };
