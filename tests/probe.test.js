'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const q = require('../src/shared/quality');
const { probeEntry, mapLimit } = require('../src/main/probe');

const variants = [
  { url: 'u1080', height: 1080, fps: 60, bandwidth: 8000000, label: '1080p60 (Source)' },
  { url: 'u720', height: 720, fps: 30, bandwidth: 3000000, label: '720p' },
  { url: 'u360', height: 360, fps: 30, bandwidth: 800000, label: '360p' },
];

test('tahmini boyut: bit hızı x süre / 8; kalite listesi ilk eleman "source"', () => {
  assert.equal(q.estimateBytes(8000000, 100), 100000000);
  const list = q.buildQualities(variants, 100);
  assert.equal(list[0].value, 'source');
  assert.equal(list[0].bytes, 100000000);
  assert.equal(list[1].value, '720');
  assert.equal(list[2].bytes, 10000000);
  assert.equal(q.est4k60Bytes(60), Math.round(60 * q.EST_4K60_BYTES_PER_SEC));
});

test('pickQuality: source en yüksek, sayı en yakın alt kalite, yoksa en düşük', () => {
  const list = q.buildQualities(variants, 10);
  assert.equal(q.pickQuality(list, 'source').height, 1080);
  assert.equal(q.pickQuality(list, '').height, 1080);
  assert.equal(q.pickQuality(list, '720').height, 720);
  assert.equal(q.pickQuality(list, '480').height, 360);
  assert.equal(q.pickQuality(list, '144').height, 360);
  assert.equal(q.pickQuality([], 'source'), null);
});

test('unionSelections: birden çok öğenin çözünürlükleri birleşir, yüksekten düşüğe', () => {
  const a = q.buildQualities(variants, 10);
  const b = q.buildQualities([{ url: 'x', height: 1080, fps: 60, bandwidth: 1, label: 'a' }, { url: 'y', height: 480, fps: 30, bandwidth: 1, label: 'b' }], 10);
  assert.deepEqual(q.unionSelections([a, b]), [1080, 720, 480, 360]);
});

test('probeEntry: HLS kaliteleri ve süre (adres eksikse Kick\'ten tamamlanır)', async () => {
  let fullCalls = 0;
  const r = await probeEntry(
    { id: 'c1', title: 'Klip', url: '' },
    {
      getFull: async () => {
        fullCalls += 1;
        return { url: 'https://cdn/x/master.m3u8', duration: 120 };
      },
      analyze: async () => ({ variants, duration: 0 }),
      mediaDuration: async () => 999,
      headSize: async () => 0,
    }
  );
  assert.equal(fullCalls, 1);
  assert.equal(r.error, '');
  assert.equal(r.url, 'https://cdn/x/master.m3u8');
  assert.equal(r.duration, 120);
  assert.equal(r.qualities.length, 3);
  assert.equal(r.qualities[0].bytes, 120000000);
});

test('probeEntry: süre bilinmiyorsa medya playlistinden alınır; mp4 için kesin boyut', async () => {
  const hlsRes = await probeEntry(
    { id: 'v', title: 'V', url: 'https://cdn/m.m3u8' },
    { getFull: async () => ({}), analyze: async () => ({ variants, duration: 0 }), mediaDuration: async () => 50, headSize: async () => 0 }
  );
  assert.equal(hlsRes.duration, 50);
  assert.equal(hlsRes.qualities[0].bytes, 50000000);

  const mp4 = await probeEntry(
    { id: 'c', title: 'C', url: 'https://cdn/c.mp4' },
    { getFull: async () => ({}), analyze: async () => ({}), mediaDuration: async () => 0, headSize: async () => 5242880 }
  );
  assert.equal(mp4.qualities[0].bytes, 5242880);
  assert.equal(mp4.qualities[0].exact, true);
  assert.equal(mp4.qualities[0].label, 'Orijinal');
});

test('probeEntry: hata yutulmaz, mesaj olarak döner', async () => {
  const r = await probeEntry(
    { id: 'x', title: 'X', url: '' },
    { getFull: async () => ({ url: '' }), analyze: async () => ({}), mediaDuration: async () => 0, headSize: async () => 0 }
  );
  assert.match(r.error, /adresi bulunamadı/);
  const r2 = await probeEntry(
    { id: 'y', title: 'Y', url: 'https://cdn/y.m3u8' },
    { getFull: async () => ({}), analyze: async () => { throw new Error('HTTP 403'); }, mediaDuration: async () => 0, headSize: async () => 0 }
  );
  assert.equal(r2.error, 'HTTP 403');
});

test('mapLimit: sınırı aşmaz ve sırayı korur', async () => {
  let running = 0;
  let peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 10));
    running -= 1;
    return n * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14]);
  assert.ok(peak <= 3);
});

test('çözünürlük okunamazsa bile düşük kaliteler listelenir (720p, 480p, 360p)', async () => {
  const { probeEntry } = require('../src/main/probe');
  const p = await probeEntry({ id: 'c', title: 'T', url: 'https://x/a.mp4', duration: 30 }, { headSize: async () => 30e6, mediaInfo: async () => null });
  assert.deepEqual(p.qualities.map((q) => q.label), ['Orijinal', '720p', '480p', '360p']);
  const h = await probeEntry({ id: 'v', title: 'V', url: 'https://x/m.m3u8', duration: 30 }, {
    analyze: async () => ({ variants: [{ url: 'https://x/m.m3u8', bandwidth: 0, height: 0, fps: 0, label: 'Source' }], duration: 30 }),
    mediaInfo: async () => ({ height: 1080, fps: 60, width: 1920, duration: 30 }),
  });
  assert.deepEqual(h.qualities.map((q) => q.label), ['1080p60 (Source)', '720p60', '480p60', '360p60']);
});
