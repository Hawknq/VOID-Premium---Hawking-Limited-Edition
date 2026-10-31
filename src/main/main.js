'use strict';
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, nativeImage, Notification, clipboard, protocol, net } = require('electron');
const fs = require('fs');
const path = require('path');
const { Store } = require('./store');
const { DownloadQueue } = require('./queue');
const { downloadItem, analyzeHls, autoName } = require('./downloader');
const { parseInput, createClient } = require('./kick');
const { grabFrame } = require('./frames');
const { UA, sleep, sanitizeName, uniquePath } = require('./util');
const { probeEntry, mapLimit } = require('./probe');
const { getMediaInfo } = require('./mediainfo');
const { fetchText } = require('./downloader');
const media = require('./mediaproxy');
media.registerScheme(protocol);
const hlsLib = require('./hls');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let tray = null;
let store = null;
let queue = null;
let kickWin = null;
let kickReady = null;
app.isQuitting = false;
app.setAppUserModelId('space.hawkingunion.voidclipper');
// Ayarlar/geçmiş klasörü ad değişse de aynı kalsın (eski kurulumdan veri taşınmasın diye sabit)
app.setPath('userData', path.join(app.getPath('appData'), 'VOID Clipper'));

const DEFAULT_SETTINGS = {
  background: true, // pencere kapanınca tepside çalışmaya devam et
  autoStart: false, // Windows ile başlat
  startHidden: true, // Windows ile başlayınca tepside başlat
  notify: true, // indirme bitince bildirim göster
  clipboardWatch: true, // panoya kopyalanan Kick linkini algıla
  defaultQuality: 'source',
  defaultOutput: 'original',
  priority: 'normal',
  uiScale: 1, // arayüz/yazı boyutu çarpanı
  speedLimit: 0, // MB/sn, 0 = sınırsız (toplam; eşzamanlı indirmelere bölünür)
};
const QUALITIES = ['source', '1080', '720', '480', '360', 'up1080', 'up1440', 'up2160'];
const KICK_PARTITION = 'persist:kick';

function setting(key) {
  const v = store && store.settings[key];
  return v === undefined ? DEFAULT_SETTINGS[key] : v;
}

/* ------------------------------------------------------------------ */
/* Bağlantı durumu                                                     */
/* ------------------------------------------------------------------ */
let status = { state: 'checking', label: 'Kontrol ediliyor…', detail: '', latency: 0, checkedAt: 0 };

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function setStatus(state, detail = '', latency = 0) {
  const labels = {
    checking: 'Kontrol ediliyor…',
    ok: 'Kick bağlı',
    blocked: 'Kick erişimi engelledi',
    offline: 'Bağlantı yok',
    error: 'Kick yanıt vermiyor',
  };
  status = { state, label: labels[state] || state, detail, latency, checkedAt: Date.now() };
  send('status:update', status);
}

async function checkStatus() {
  setStatus('checking');
  let last = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await ensureKickWindow();
      if (!kickWin || kickWin.isDestroyed()) {
        last = { state: 'error', detail: 'Kick penceresi açılamadı' };
        kickReady = null;
        continue;
      }
      if (!/^https:\/\/(www\.)?kick\.com/.test(kickWin.webContents.getURL())) {
        await kickWin.loadURL('https://kick.com/');
      }
      const r = await kickWin.webContents.executeJavaScript(
        `(async () => {
           // Ana sayfa yerine küçük, statik bir dosya. İlk istek bağlantıyı (TLS/Cloudflare) ısıtır,
           // yanıt süresi olarak ısınmış bağlantıdaki en düşük değer alınır.
           try {
             let best = Infinity;
             let okStatus = 0;
             for (let i = 0; i < 3; i += 1) {
               const t = performance.now();
               const lite = await fetch('/robots.txt', { cache: 'no-store' });
               const ms = Math.round(performance.now() - t);
               if (!(lite.status >= 200 && lite.status < 300)) break;
               okStatus = lite.status;
               if (i > 0) best = Math.min(best, ms);
               else if (best === Infinity) best = ms;
             }
             if (okStatus) return { status: okStatus, ms: best };
           } catch (e) { /* ana sayfaya düş */ }
           try {
             const t = performance.now();
             const res = await fetch('/', { cache: 'no-store' });
             return { status: res.status, ms: Math.round(performance.now() - t) };
           } catch (e) { return { error: String(e) }; }
         })()`,
        true
      );
      if (r.error) {
        last = { state: 'offline', detail: `İnternet bağlantını kontrol et. (${r.error})` };
      } else if (r.status >= 200 && r.status < 300) {
        return setStatus('ok', 'Kick erişimi var', r.ms);
      } else if ([403, 429, 503].includes(r.status)) {
        last = { state: 'blocked', detail: `HTTP ${r.status}. Birkaç dakika sonra tekrar dene.` };
      } else {
        last = { state: 'error', detail: `HTTP ${r.status}` };
      }
    } catch (err) {
      last = { state: 'offline', detail: `${err.message}` };
      kickReady = null; // gizli pencereyi bir sonraki denemede yeniden kur
    }
    await sleep(800);
  }
  return setStatus(last.state, last.detail);
}

/* ------------------------------------------------------------------ */
/* ffmpeg                                                              */
/* ------------------------------------------------------------------ */
function ffmpegPath() {
  let p = require('ffmpeg-static');
  if (app.isPackaged) p = p.replace('app.asar', 'app.asar.unpacked');
  return p;
}

/* ------------------------------------------------------------------ */
/* Kick API: gerçek Chromium üzerinden (Cloudflare'i geçmek için)       */
/* ------------------------------------------------------------------ */
function ensureKickWindow() {
  if (kickReady && kickWin && !kickWin.isDestroyed()) return kickReady;
  kickWin = new BrowserWindow({
    show: false,
    width: 900,
    height: 700,
    webPreferences: { partition: KICK_PARTITION, contextIsolation: true, sandbox: true },
  });
  kickWin.webContents.setUserAgent(UA);
  kickReady = kickWin.loadURL('https://kick.com/').catch(() => {});
  return kickReady;
}

async function kickGetJson(url) {
  const delays = [0, 2500, 6000];
  let lastErr = null;
  for (const d of delays) {
    if (d) await sleep(d);
    await ensureKickWindow();
    if (!kickWin || kickWin.isDestroyed()) continue;
    let res;
    try {
      if (!/^https:\/\/(www\.)?kick\.com/.test(kickWin.webContents.getURL())) {
        await kickWin.loadURL('https://kick.com/');
      }
      res = await kickWin.webContents.executeJavaScript(
        `fetch(${JSON.stringify(url)}, { headers: { Accept: 'application/json' }, credentials: 'include' })
           .then(async (r) => ({ status: r.status, body: await r.text() }))`,
        true
      );
    } catch (err) {
      lastErr = new Error(`Kick'e bağlanılamadı: ${err.message}`);
      continue;
    }
    if (res.status === 404) throw new Error('Bulunamadı. Kanal adı, klip veya yayın silinmiş olabilir.');
    const looksHtml = /^\s*</.test(res.body);
    if (res.status === 200 && !looksHtml) {
      try {
        if (status.state !== 'ok') setStatus('ok', 'Kick API yanıt veriyor');
        return JSON.parse(res.body);
      } catch {
        lastErr = new Error('Kick yanıtı okunamadı.');
        continue;
      }
    }
    lastErr = new Error(
      res.status === 403 || looksHtml
        ? 'Kick erişimi engelledi (Cloudflare). Birkaç saniye sonra tekrar dene.'
        : `Kick hata verdi (HTTP ${res.status}).`
    );
  }
  if (lastErr && /engelledi/.test(lastErr.message)) setStatus('blocked', 'Kick API isteklerini engelliyor');
  throw lastErr || new Error('Kick yanıt vermedi.');
}

const kick = createClient(kickGetJson);

/* ------------------------------------------------------------------ */
/* İndirme öncesi boyut / çözünürlük bilgisi                           */
/* ------------------------------------------------------------------ */
async function headSize(url) {
  const opts = { headers: { 'User-Agent': UA } };
  try {
    const r = await fetch(url, { ...opts, method: 'HEAD' });
    const n = parseInt(r.headers.get('content-length') || '0', 10);
    if (r.ok && n) return n;
  } catch {
    /* HEAD desteklenmiyor olabilir */
  }
  try {
    const r = await fetch(url, { headers: { ...opts.headers, Range: 'bytes=0-0' } });
    const m = /\/(\d+)$/.exec(r.headers.get('content-range') || '');
    if (m) return parseInt(m[1], 10);
    return parseInt(r.headers.get('content-length') || '0', 10) || 0;
  } catch {
    return 0;
  }
}

async function freeSpace(dir) {
  if (!dir) return null;
  let p = dir;
  for (let i = 0; i < 6 && !fs.existsSync(p); i += 1) p = path.dirname(p);
  try {
    const st = await fs.promises.statfs(p);
    return Number(st.bavail) * Number(st.bsize);
  } catch {
    return null;
  }
}

const probeDeps = {
  getFull: (entry) => (entry.kind === 'clip' ? kick.getClip(entry.id) : kick.getVod(entry.id)),
  analyze: analyzeHls,
  mediaInfo: (url) => getMediaInfo(ffmpegPath(), url),
  mediaDuration: async (url) => hlsLib.parseMedia(await fetchText(url)).duration,
  headSize,
};

/* ------------------------------------------------------------------ */
/* Pencere ve tepsi                                                    */
/* ------------------------------------------------------------------ */
const iconPath = path.join(__dirname, '..', '..', 'build', 'icon.png');

function createWindow(opts = {}) {
  win = new BrowserWindow({
    show: opts.show !== false,
    width: 1240,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#080b10',
    title: 'VOID Premium',
    frame: false, // özel başlık çubuğu (tasarımdaki pencere kontrolleri)
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.on('close', (e) => {
    if (app.isQuitting) return;
    if (setting('background')) {
      e.preventDefault();
      win.hide();
      return;
    }
    // Arka planda çalışma kapalı: pencere kapanınca uygulama da kapanır
    const active = queue ? queue.list().filter((i) => ['running', 'queued'].includes(i.status)).length : 0;
    if (active) {
      const choice = dialog.showMessageBoxSync(win, {
        type: 'question',
        title: 'VOID Premium',
        message: `${active} aktif indirme var.`,
        detail: 'Uygulama kapanırsa indirmeler durur. Tekrar açtığında baştan devam eder.',
        buttons: ['Kapat ve çık', 'Vazgeç'],
        defaultId: 1,
        cancelId: 1,
      });
      if (choice === 1) {
        e.preventDefault();
        return;
      }
    }
    app.isQuitting = true;
    app.quit();
  });
  // Sürüklenen dosya/bağlantı pencerenin içeriğini değiştirmesin
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function ensureTray(enabled) {
  if (!enabled) {
    if (tray) {
      tray.destroy();
      tray = null;
    }
    return;
  }
  if (tray) return;
  createTray();
}

function createTray() {
  let img = nativeImage.createFromPath(iconPath);
  if (!img.isEmpty()) img = img.resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('VOID Premium');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Göster', click: showWindow },
      { type: 'separator' },
      {
        label: 'Çıkış',
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on('click', showWindow);
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */
function handle(name, fn) {
  ipcMain.handle(name, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err) };
    }
  });
}

async function ensureDir() {
  let dir = store.settings.dir;
  if (dir) return dir;
  const r = await dialog.showOpenDialog(win, {
    title: 'Videoların kaydedileceği klasörü seç',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) throw new Error('Klasör seçilmedi.');
  dir = r.filePaths[0];
  store.setSettings({ dir });
  return dir;
}

// Panodaki Kick klip/VOD linkini algıla (yalnızca pencere odaktayken)
const previewUrls = new Set();
let lastClip = '';
function clipboardLink() {
  let t = '';
  try { t = clipboard.readText().trim(); } catch { return null; }
  if (!t || t.length > 300 || !/kick\.com/i.test(t)) return null;
  const p = parseInput(t);
  return p && (p.type === 'clip' || p.type === 'vod') ? t : null;
}
function checkClipboard() {
  if (!win || win.isDestroyed() || !win.isVisible() || !win.isFocused() || !setting('clipboardWatch')) return;
  const link = clipboardLink();
  if (!link) {
    lastClip = ''; // pano değişti: aynı link tekrar kopyalanırsa yine öner
    return;
  }
  if (link === lastClip) return;
  lastClip = link;
  win.webContents.send('clipboard:link', link);
}
function startClipboardWatch() {
  setInterval(checkClipboard, 1500);
}

const thumbCache = new Map();
let thumbBusy = 0;
const thumbWaiters = [];
function thumbSlot() {
  if (thumbBusy < 2) {
    thumbBusy += 1;
    return Promise.resolve();
  }
  return new Promise((r) => thumbWaiters.push(r));
}
function thumbRelease() {
  const next = thumbWaiters.shift();
  if (next) next();
  else thumbBusy -= 1;
}

function registerIpc() {
  handle('analyze', async (input) => {
    const parsed = parseInput(input);
    if (!parsed) throw new Error('Geçerli bir Kick klip/VOD linki, klip ID gir.');

    if (parsed.type === 'channel') return { type: 'channel', slug: parsed.slug };

    if (parsed.type === 'clip') {
      const item = await kick.getClip(parsed.id);
      if (!item.id) item.id = parsed.id;
      if (!item.channel && parsed.slug) item.channel = parsed.slug;
      item.suggestedName = autoName(item);
      return { type: 'clip', item, variants: [] };
    }

    if (parsed.type === 'vod') {
      const item = await kick.getVod(parsed.uuid);
      if (!item.channel && parsed.slug) item.channel = parsed.slug;
      if (!item.url) throw new Error('Bu yayının kaydı bulunamadı (silinmiş veya abonelere özel olabilir).');
      const info = await analyzeHls(item.url);
      item.suggestedName = autoName(item);
      return { type: 'vod', item, variants: info.variants.map(({ url, ...v }) => v) };
    }

    throw new Error('Bu bağlantı desteklenmiyor. Kick klip veya VOD bağlantısı gir.');
  });

  handle('channel:open', (slug) => kick.getChannel(String(slug).trim().toLowerCase()));
  handle('channel:clips', (slug, opts) => kick.listClips(String(slug).trim().toLowerCase(), opts));
  handle('channel:vods', (slug) => kick.listVods(String(slug).trim().toLowerCase()));

  handle('queue:add', async (entries) => {
    if (!Array.isArray(entries) || !entries.length) return 0;
    await ensureDir();
    const prepared = [];
    for (const e of entries) {
      const entry = { ...e };
      // Listeden gelen VOD/klip için adres eksikse tamamla
      if (!entry.url) {
        try {
          const full = entry.kind === 'clip' ? await kick.getClip(entry.id) : await kick.getVod(entry.id);
          entry.url = full.url;
        } catch {
          /* adres yoksa indirme hata verip nedenini gösterir */
        }
      }
      entry.output = ['4k60', '1440p60', '1080p60', 'vblur', 'vcrop', 'vblur720', 'vcrop720'].includes(entry.output) ? entry.output : 'original';
      entry.fileName = typeof entry.fileName === 'string' ? entry.fileName.trim().slice(0, 150) : '';
      const ts = Number(entry.trimStart) > 0 ? Math.round(Number(entry.trimStart)) : 0;
      const te = Number(entry.trimEnd) > ts ? Math.round(Number(entry.trimEnd)) : 0;
      entry.trimStart = ts;
      entry.trimEnd = te;
      entry.sourceKey = `${entry.kind}:${entry.id}:${entry.quality || 'source'}:${entry.output}${ts || te ? `:${ts}-${te}` : ''}`;
      prepared.push(entry);
    }
    return queue.add(prepared, setting('priority'));
  });
  handle('queue:list', () => queue.list());
  handle('queue:rename', (id, name) => queue.rename(id, name));

  handle('history:list', () =>
    store.history.map((h) => ({ ...h, exists: !!h.filePath && fs.existsSync(h.filePath) }))
  );
  handle('history:remove', (id) => {
    store.removeHistory(id);
    send('history:update', true);
  });
  handle('history:clear', () => {
    store.clearHistory();
    send('history:update', true);
  });
  handle('history:requeue', async (id) => {
    const h = store.history.find((x) => x.id === id);
    if (!h) throw new Error('Kayıt bulunamadı.');
    await ensureDir();
    const n = queue.add(
      [
        {
          kind: h.kind,
          id: h.sourceId,
          title: h.title,
          fileName: '',
          output: h.output,
          channel: h.channel,
          createdAt: h.createdAt,
          thumbnail: h.thumbnail,
          url: h.url,
          quality: h.quality,
          sourceKey: `${h.kind}:${h.sourceId}:${h.quality || 'source'}:${h.output}:again:${Date.now()}`,
        },
      ],
      setting('priority')
    );
    return n;
  });

  handle('status:get', () => status);
  handle('status:check', () => checkStatus().then(() => status));
  handle('queue:pause', (id) => queue.pause(id));
  handle('queue:resume', (id) => queue.resume(id));
  handle('queue:cancel', (id) => queue.cancel(id));
  handle('queue:retry', (id) => queue.retry(id));
  handle('queue:remove', (id) => queue.remove(id));
  handle('queue:clear', () => queue.clearFinished());

  handle('settings:get', () => ({
    dir: store.settings.dir || '',
    concurrency: queue.concurrency,
    priority: setting('priority'),
    background: setting('background'),
    autoStart: setting('autoStart'),
    startHidden: setting('startHidden'),
    notify: setting('notify'),
    clipboardWatch: setting('clipboardWatch'),
    defaultQuality: setting('defaultQuality'),
    speedLimit: setting('speedLimit'),
    uiScale: setting('uiScale'),
    defaultOutput: setting('defaultOutput'),
    version: app.getVersion(),
    packaged: app.isPackaged,
  }));
  handle('settings:set', (patch) => {
    const next = {};
    if (['high', 'normal', 'low'].includes(patch.priority)) next.priority = patch.priority;
    for (const k of ['background', 'autoStart', 'startHidden', 'notify', 'clipboardWatch']) {
      if (typeof patch[k] === 'boolean') next[k] = patch[k];
    }
    if (QUALITIES.includes(patch.defaultQuality)) next.defaultQuality = patch.defaultQuality;
    if (['original', '4k60'].includes(patch.defaultOutput)) next.defaultOutput = patch.defaultOutput;
    if (patch.uiScale !== undefined) {
      const v = Number(patch.uiScale);
      if (Number.isFinite(v) && v >= 0.8 && v <= 1.6) next.uiScale = Math.round(v * 100) / 100;
    }
    if (patch.speedLimit !== undefined) {
      const v = Number(patch.speedLimit);
      if (Number.isFinite(v) && v >= 0 && v <= 1000) next.speedLimit = Math.round(v * 10) / 10;
    }
    if (patch.concurrency !== undefined) {
      queue.setConcurrency(patch.concurrency);
      next.concurrency = queue.concurrency;
    }
    store.setSettings(next);
    if ('background' in next) ensureTray(next.background);
    if ('autoStart' in next && app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: next.autoStart, args: ['--hidden'] });
    }
    return true;
  });

  // Bağlantı tanılama: sorunun nerede olduğunu adım adım gösterir
  handle('diag:run', async (slug) => {
    const out = [];
    const step = async (name, fn) => {
      const t = Date.now();
      try {
        const detail = await fn();
        out.push({ name, ok: true, detail: `${detail || 'tamam'} (${Date.now() - t} ms)` });
      } catch (err) {
        out.push({ name, ok: false, detail: (err && err.message) || String(err) });
      }
    };
    const channel = String(slug || '').replace(/[^A-Za-z0-9_-]/g, '') || 'kick';
    await step('Kick ana sayfa', async () => {
      const s = await checkStatus();
      if (s.state !== 'ok') throw new Error(`${s.label}: ${s.detail}`);
      return s.detail;
    });
    await step(`Kanal API (${channel})`, async () => {
      const c = await kick.getChannel(channel);
      return `${c.username} bulundu`;
    });
    await step('Klip listesi', async () => {
      const r = await kick.listClips(channel, { filter: 'all' });
      if (!r.items.length) return 'bağlantı çalışıyor, bu kanalda klip yok';
      const c = r.items[0];
      return `${r.items.length} klip; ilk klip adresi: ${c.url ? (/\.m3u8/.test(c.url) ? 'HLS (çoklu kalite)' : 'doğrudan dosya') : 'YOK'}`;
    });
    await step('Klip kalite bilgisi', async () => {
      const r = await kick.listClips(channel, { filter: 'all' });
      const c = r.items.find((x) => x.url);
      if (!c) return 'denenecek klip yok';
      const p = await probeEntry(c, probeDeps);
      if (p.error) throw new Error(p.error);
      return p.qualities.map((q) => q.label.replace(' (Source)', '*')).join(', ') || 'kalite listesi boş';
    });
    await step('ffmpeg', async () => {
      const { spawnSync } = require('child_process');
      const r = spawnSync(ffmpegPath(), ['-version'], { windowsHide: true });
      if (r.status !== 0) throw new Error('ffmpeg çalıştırılamadı');
      return String(r.stdout).split('\n')[0].slice(0, 40);
    });
    return out;
  });

  handle('win:minimize', () => win && win.minimize());
  handle('win:toggleMax', () => {
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  handle('win:close', () => win && win.close());


  // Uygulama içi izleme: adres çözülür, voidmedia:// üzerinden oynatılır
  handle('play:resolve', async (entry) => {
    const e = entry || {};
    if (!['clip', 'vod'].includes(e.kind) || !e.id) throw new Error('Geçersiz öğe.');
    let url = typeof e.url === 'string' && /^https:\/\//i.test(e.url) ? e.url : '';
    let title = e.title || '';
    let duration = Number(e.duration) || 0;
    if (!url) {
      const full = await probeDeps.getFull(e);
      url = full.url || '';
      title = title || full.title || '';
      duration = duration || Number(full.duration) || 0;
    }
    if (!/^https:\/\//i.test(url)) throw new Error('Oynatma adresi bulunamadı (silinmiş veya abonelere özel olabilir).');
    return { url: media.toProxyUrl(url), isHls: /\.m3u8(\?|$)/i.test(url), title, duration };
  });

  // Görseli olmayan VOD'lar için ffmpeg ile küçük resim üretir (önbellekli, aynı anda en fazla 2 iş)
  handle('thumb:frame', async (entry) => {
    const e = entry || {};
    if (!e.id || !['clip', 'vod'].includes(e.kind)) throw new Error('Geçersiz öğe.');
    const key = `${e.kind}:${e.id}`;
    if (thumbCache.has(key)) return thumbCache.get(key);
    await thumbSlot();
    try {
      let url = typeof e.url === 'string' && /^https:\/\//i.test(e.url) ? e.url : '';
      let duration = Number(e.duration) || 0;
      if (!url) {
        const full = await probeDeps.getFull(e);
        url = full.url || '';
        duration = duration || Number(full.duration) || 0;
      }
      if (!/^https:\/\//i.test(url)) throw new Error('Adres yok');
      let input = url;
      if (/\.m3u8(\?|$)/i.test(url)) {
        const info = await analyzeHls(url);
        input = info.variants[info.variants.length - 1].url; // en düşük kalite: en hızlısı
        duration = duration || info.duration || 0;
      }
      const t = duration > 120 ? Math.min(Math.round(duration * 0.15), 900) : duration > 8 ? 4 : 1;
      const buf = await grabFrame(ffmpegPath(), { input, t, out: 'pipe:1', full: false }, 30000);
      const data = 'data:image/jpeg;base64,' + buf.toString('base64');
      thumbCache.set(key, data);
      if (thumbCache.size > 200) thumbCache.delete(thumbCache.keys().next().value);
      return data;
    } finally {
      thumbRelease();
    }
  });

  handle('frame:preview', async (url, t) => {
    if (!previewUrls.has(url)) throw new Error('Önizleme için önce seçenekler yüklenmeli.');
    const buf = await grabFrame(ffmpegPath(), { input: url, t, out: 'pipe:1', full: false });
    return 'data:image/jpeg;base64,' + buf.toString('base64');
  });
  handle('frame:save', async (url, t, title) => {
    if (!previewUrls.has(url)) throw new Error('Önizleme için önce seçenekler yüklenmeli.');
    const dir = store.settings.dir;
    if (!dir) throw new Error('Önce bir indirme klasörü seç.');
    const sec = Math.max(0, Math.floor(Number(t) || 0));
    const stamp = `${Math.floor(sec / 60)}m${String(sec % 60).padStart(2, '0')}s`;
    const file = uniquePath(dir, `${sanitizeName(title, 'kare')} [${stamp}]`, '.png');
    await grabFrame(ffmpegPath(), { input: url, t, out: file, full: true }, 60000);
    return file;
  });
  handle('options:probe', async (entries) => {
    const list = Array.isArray(entries) ? entries.slice(0, 300) : [];
    const items = await mapLimit(list, 4, (e) => probeEntry(e, probeDeps));
    // Önizleme yalnızca az önce ölçülen adresler için yapılabilir
    previewUrls.clear();
    for (const p of items) if (p && p.url && /^https?:\/\//i.test(p.url)) previewUrls.add(p.url);
    return { items, free: await freeSpace(store.settings.dir), dir: store.settings.dir || '' };
  });
  handle('dir:choose', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'İndirme klasörünü seç',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return store.settings.dir || '';
    store.setSettings({ dir: r.filePaths[0] });
    return r.filePaths[0];
  });
  handle('dir:open', () => {
    if (store.settings.dir) return shell.openPath(store.settings.dir);
    return '';
  });
  handle('file:show', (p) => {
    if (p) shell.showItemInFolder(p);
  });
}

/* ------------------------------------------------------------------ */
/* Başlangıç                                                           */
/* ------------------------------------------------------------------ */
app.on('second-instance', showWindow);

app.whenReady().then(() => {
  media.handleMedia(protocol, net);
  store = new Store(app.getPath('userData'));
  queue = new DownloadQueue({
    concurrency: store.settings.concurrency || 2,
    initial: store.queue,
    save: (items) => store.saveQueue(items),
    runner: (item, ctx) =>
      downloadItem(item, ctx, {
        dir: store.settings.dir,
        ffmpegPath: ffmpegPath(),
        // Ayarlardaki toplam sınır, eşzamanlı indirmelere eşit bölünür
        speedLimit: ((Number(setting('speedLimit')) || 0) * 1048576) / Math.max(1, queue.concurrency),
      }),
  });
  queue.on('update', (items) => send('queue:update', items));
  queue.on('finished', (it) => {
    let size = 0;
    try {
      if (it.status === 'done' && it.filePath) size = fs.statSync(it.filePath).size;
    } catch {
      /* dosya taşınmış olabilir */
    }
    store.addHistory({
      id: it.id,
      sourceId: it.sourceId || '',
      kind: it.kind,
      title: it.title,
      channel: it.channel,
      createdAt: it.createdAt,
      thumbnail: it.thumbnail,
      url: it.url,
      quality: it.quality,
      output: it.output,
      status: it.status,
      error: it.error || '',
      filePath: it.filePath || '',
      size,
      finishedAt: Date.now(),
    });
    send('history:update', true);
    if (it.status === 'done' && setting('notify') && Notification.isSupported()) {
      const n = new Notification({ title: 'İndirme tamamlandı', body: it.fileName || it.title, icon: iconPath });
      n.on('click', showWindow);
      n.show();
    }
  });

  registerIpc();
  const startHidden = process.argv.includes('--hidden') && setting('startHidden') && setting('background');
  createWindow({ show: !startHidden });
  startClipboardWatch();
  ensureTray(setting('background'));
  win.webContents.once('did-finish-load', () => {
    checkStatus();
  });
  setInterval(checkStatus, 60000);
  // Kalıcı kuyruktan yarım kalanları sürdür
  queue._pump();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (queue) queue.shutdown();
});

// Arka planda çalışma açıksa pencere kapanınca tepside devam eder
app.on('window-all-closed', () => {
  if (!setting('background')) app.quit();
});
