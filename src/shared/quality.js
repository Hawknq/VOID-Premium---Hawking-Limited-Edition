'use strict';
/**
 * Hem ana süreç hem arayüz tarafından kullanılan ortak kalite/boyut mantığı.
 * (Node'da require ile, arayüzde <script> ile window.VoidQuality olarak yüklenir.)
 */
(function (root) {
  // 4K 60 fps yükseltmede (x264, crf 17) kaba bit hızı varsayımı: ~45 Mbit/sn
  const EST_4K60_BYTES_PER_SEC = (45 * 1e6) / 8;

  /** Kalite listesinden seçime uygun olanı seçer ("source" = en yüksek). */
  function pickQuality(qualities, selection) {
    if (!qualities || !qualities.length) return null;
    if (!selection || selection === 'source') return qualities[0];
    const target = parseInt(selection, 10);
    if (!target) return qualities[0];
    const below = qualities.filter((q) => q.height && q.height <= target);
    return below.length ? below[0] : qualities[qualities.length - 1];
  }

  /** HLS: bit hızı x süre ile tahmini boyut (bayt). */
  function estimateBytes(bandwidth, duration) {
    return Math.round(((Number(bandwidth) || 0) * (Number(duration) || 0)) / 8);
  }

  function est4k60Bytes(duration) {
    return Math.round((Number(duration) || 0) * EST_4K60_BYTES_PER_SEC);
  }

  // Yükseltme (x264 crf 17) için kaba bit hızı varsayımları (Mbit/sn)
  const UP_MBPS = { '1080p60': 16, '1440p60': 28, '4k60': 45, vblur: 9, vcrop: 9, vblur720: 5, vcrop720: 5 };
  function estUpscaleBytes(duration, output) {
    const mbps = UP_MBPS[output] || UP_MBPS['4k60'];
    return Math.round((Number(duration) || 0) * ((mbps * 1e6) / 8));
  }

  /** Doğrudan dosyada daha düşük kaliteye indirme (yeniden kodlama) için kaba boyut tahmini. */
  function estScaleBytes(sourceBytes, sourceHeight, targetHeight) {
    if (!sourceBytes || !sourceHeight) return 0;
    const r = targetHeight / sourceHeight;
    return Math.round(sourceBytes * r * r * 0.8);
  }

  /** HLS kalite listesinden (yüksekten düşüğe) seçenek listesi üretir. */
  function buildQualities(variants, duration) {
    return variants.map((v, i) => ({
      value: i === 0 ? 'source' : String(v.height || ''),
      height: v.height || 0,
      fps: v.fps || 0,
      label: v.label,
      bytes: estimateBytes(v.bandwidth, duration),
      exact: false,
    }));
  }

  /** Seçilebilecek benzersiz kalite adımları (tüm öğelerin birleşimi), yüksekten düşüğe. */
  function unionSelections(itemsQualities) {
    const heights = new Map();
    for (const qs of itemsQualities) {
      for (const q of qs || []) {
        if (q.height && !heights.has(q.height)) heights.set(q.height, q);
      }
    }
    return Array.from(heights.keys()).sort((a, b) => b - a);
  }

  const api = { pickQuality, estimateBytes, est4k60Bytes, estUpscaleBytes, estScaleBytes, buildQualities, unionSelections, EST_4K60_BYTES_PER_SEC };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VoidQuality = api;
})(typeof window !== 'undefined' ? window : globalThis);
