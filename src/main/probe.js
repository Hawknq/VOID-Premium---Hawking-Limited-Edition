'use strict';
const { buildQualities, estScaleBytes } = require('../shared/quality');

/**
 * Bir indirme adayı için seçilebilir kaliteleri ve tahmini boyutları çıkarır.
 * Dış bağımlılıklar enjekte edilir (testlenebilir):
 *  deps.getFull(entry)       -> { url, duration } (adres eksikse Kick'ten tamamlar)
 *  deps.analyze(url)         -> { variants, duration } (HLS)
 *  deps.mediaDuration(url)   -> saniye (HLS süresi bilinmiyorsa)
 *  deps.headSize(url)        -> bayt (doğrudan mp4)
 *  deps.mediaInfo(url)       -> { width, height, fps, duration } | null (doğrudan mp4'ün gerçek çözünürlüğü)
 */
/** Kaynağın altındaki standart kaliteleri (yeniden kodlama ile) listeye ekler. */
function addLower(qualities, info, bytes) {
  const srcH = (info && info.height) || 1080;
  const fps = (info && info.fps) || 0;
  for (const h of [1080, 720, 480, 360]) {
    if (h >= srcH || qualities.some((q) => q.height === h)) continue;
    qualities.push({
      value: String(h), height: h, fps, label: `${h}p${fps || ''}`,
      bytes: estScaleBytes(bytes, srcH, h), exact: false, transcode: true, assumed: !(info && info.height),
    });
  }
}

async function probeEntry(entry, deps) {
  const base = { id: entry.id, title: entry.title, duration: Number(entry.duration) || 0, url: entry.url || '', qualities: [], error: '' };
  try {
    if (!base.url) {
      const full = await deps.getFull(entry);
      base.url = full.url || '';
      if (!base.duration) base.duration = Number(full.duration) || 0;
    }
    if (!base.url) throw new Error('İndirme adresi bulunamadı (silinmiş veya abonelere özel olabilir).');

    if (/\.m3u8(\?|$)/i.test(base.url)) {
      const info = await deps.analyze(base.url);
      let duration = base.duration || info.duration || 0;
      if (!duration) {
        try {
          duration = await deps.mediaDuration(info.variants[0].url);
        } catch {
          duration = 0;
        }
      }
      base.duration = duration;
      base.qualities = buildQualities(info.variants, duration);
      // Tek kalite sunan akışta (çözünürlük bilinmiyor) gerçek çözünürlüğü okuyup düşük kaliteleri ekle
      if (base.qualities.length === 1) {
        const mi = deps.mediaInfo ? await deps.mediaInfo(info.variants[0].url).catch(() => null) : null;
        const q0 = base.qualities[0];
        const total = q0.bytes;
        if (mi && mi.height) {
          q0.height = mi.height;
          q0.fps = mi.fps;
          q0.label = `${mi.height}p${mi.fps || ''} (Source)`;
        }
        addLower(base.qualities, mi, total);
      }
    } else {
      const [bytes, info] = await Promise.all([
        deps.headSize(base.url),
        deps.mediaInfo ? deps.mediaInfo(base.url).catch(() => null) : Promise.resolve(null),
      ]);
      if (info && info.duration && !base.duration) base.duration = info.duration;
      if (info && info.height) {
        base.qualities = [{ value: 'source', height: info.height, fps: info.fps, label: `${info.height}p${info.fps || ''} (Source)`, bytes: bytes || 0, exact: !!bytes }];
      } else {
        base.qualities = [{ value: 'source', height: 0, fps: 0, label: 'Orijinal', bytes: bytes || 0, exact: !!bytes }];
      }
      // Tek dosyada daha düşük kaliteler yeniden kodlanarak üretilir (çözünürlük okunamadıysa 1080p varsayılır)
      addLower(base.qualities, info, bytes);
    }
  } catch (err) {
    base.error = (err && err.message) || String(err);
  }
  return base;
}

/** Sınırlı eşzamanlılıkla sırayla çalıştırır, sonuç sırası girişle aynı kalır. */
async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= list.length) return;
      out[i] = await fn(list[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

module.exports = { probeEntry, mapLimit };
