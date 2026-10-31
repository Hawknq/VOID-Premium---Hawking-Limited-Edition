'use strict';

/** Göreli URL'yi playlist adresine göre mutlak yapar. */
function resolveUrl(ref, base) {
  try {
    return new URL(ref, base).toString();
  } catch {
    return ref;
  }
}

function parseAttrs(line) {
  const out = {};
  const re = /([A-Z0-9-]+)=("([^"]*)"|[^,]*)/g;
  let m;
  while ((m = re.exec(line))) out[m[1]] = m[3] !== undefined ? m[3] : m[2];
  return out;
}

/** Master playlist mi? */
function isMaster(text) {
  return /#EXT-X-STREAM-INF/.test(text);
}

/**
 * Master playlist -> kalite listesi (yüksekten düşüğe).
 * Her kalite: { url, bandwidth, width, height, fps, label }
 */
function parseMaster(text, baseUrl) {
  const lines = String(text).split(/\r?\n/);
  const variants = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
    const attrs = parseAttrs(line.slice('#EXT-X-STREAM-INF:'.length));
    let j = i + 1;
    while (j < lines.length && (!lines[j].trim() || lines[j].startsWith('#'))) j += 1;
    if (j >= lines.length) break;
    const url = resolveUrl(lines[j].trim(), baseUrl);
    let width = 0;
    let height = 0;
    if (attrs.RESOLUTION) {
      const [w, h] = attrs.RESOLUTION.split('x').map(Number);
      width = w || 0;
      height = h || 0;
    }
    const fps = attrs['FRAME-RATE'] ? Math.round(parseFloat(attrs['FRAME-RATE'])) : 0;
    const bandwidth = parseInt(attrs.BANDWIDTH || attrs['AVERAGE-BANDWIDTH'] || '0', 10) || 0;
    variants.push({
      url,
      bandwidth,
      width,
      height,
      fps,
      label: height ? `${height}p${fps > 30 ? fps : ''}` : `${Math.round(bandwidth / 1000)} kbps`,
    });
  }
  variants.sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth);
  if (variants.length) variants[0].label += ' (Source)';
  return variants;
}

/** Media playlist -> toplam süre (sn), segment sayısı, canlı mı. */
function parseMedia(text) {
  let duration = 0;
  let segments = 0;
  const re = /#EXTINF:([0-9.]+)/g;
  let m;
  while ((m = re.exec(text))) {
    duration += parseFloat(m[1]) || 0;
    segments += 1;
  }
  return { duration, segments, live: !/#EXT-X-ENDLIST/.test(text) };
}

/** Kalite seçimi: "source" -> en yüksek, sayı -> o yüksekliğe en yakın (üstüne çıkmadan). */
function pickVariant(variants, quality) {
  if (!variants.length) return null;
  if (!quality || quality === 'source') return variants[0];
  const target = parseInt(quality, 10);
  if (!target) return variants[0];
  const below = variants.filter((v) => v.height && v.height <= target);
  return below.length ? below[0] : variants[variants.length - 1];
}

module.exports = { resolveUrl, isMaster, parseMaster, parseMedia, pickVariant };
