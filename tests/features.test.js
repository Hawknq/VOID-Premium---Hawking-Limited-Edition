'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildBaseName, autoName, buildFfmpegArgs, chooseMode } = require('../src/main/downloader');
const { Store, HISTORY_LIMIT } = require('../src/main/store');
const { DownloadQueue } = require('../src/main/queue');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('dosya adı: kullanıcı adı aynen, otomatik adda 4K eki, tehlikeli karakterler temizlenir', () => {
  const base = { kind: 'clip', title: 'Harika an', channel: 'hawking', createdAt: '2026-10-31T10:00:00Z' };
  assert.match(autoName(base), /^hawking - Harika an \[2026-10-\d\d\]$/);
  assert.equal(buildBaseName(base), autoName(base));
  assert.equal(buildBaseName({ ...base, output: '4k60' }), `${autoName(base)} [4K60]`);
  assert.equal(buildBaseName({ ...base, fileName: 'Benim:adım?.mp4' }), 'Benim adım');
  // kullanıcı adı yazdıysa 4K eki otomatik eklenmez (kullanıcının seçimi)
  assert.equal(buildBaseName({ ...base, fileName: 'Özel', output: '4k60' }), 'Özel');
  assert.equal(buildBaseName({ ...base, fileName: '   ' }), autoName(base));
});

test('4K60: argümanlar 3840x2160, 60 fps, libx264 içerir; kopya modunda yeniden kodlama yok', () => {
  const a = buildFfmpegArgs({ input: 'in', outPart: 'o.part', mode: '4k60' }).join(' ');
  assert.match(a, /scale=3840:2160/);
  assert.match(a, /fps=60/);
  assert.match(a, /-c:v libx264/);
  assert.match(a, /-f mp4/);
  const c = buildFfmpegArgs({ input: 'in', outPart: 'o.part', mode: 'copy' }).join(' ');
  assert.match(c, /-c copy/);
  assert.doesNotMatch(c, /libx264|scale=/);
});

test('4K60: kaynak zaten 4K 60 fps ise kopyalanır, değilse yükseltilir', () => {
  assert.equal(chooseMode('4k60', { height: 1080, fps: 60 }), '4k60');
  assert.equal(chooseMode('4k60', { height: 2160, fps: 30 }), '4k60');
  assert.equal(chooseMode('4k60', { height: 2160, fps: 60 }), 'copy');
  assert.equal(chooseMode('original', { height: 720, fps: 30 }), 'copy');
  assert.equal(chooseMode('1080p60', { height: 1080, fps: 30 }), '1080p60');
  assert.equal(chooseMode('1080p60', { height: 1080, fps: 60 }), 'copy');
});

test('geçmiş: ekle, kalıcı, sınır, sil, temizle', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-store-'));
  let s = new Store(dir);
  s.addHistory({ id: 'a', title: 'A' });
  s.addHistory({ id: 'b', title: 'B' });
  s.addHistory({ id: 'a', title: 'A2' }); // aynı id: tekrar eklenmez, başa taşınır
  assert.deepEqual(s.history.map((h) => h.title), ['A2', 'B']);

  s = new Store(dir); // yeniden aç: diskten okunur
  assert.equal(s.history.length, 2);
  s.removeHistory('b');
  assert.deepEqual(s.history.map((h) => h.id), ['a']);

  for (let i = 0; i < HISTORY_LIMIT + 20; i += 1) s.addHistory({ id: `x${i}` });
  assert.equal(s.history.length, HISTORY_LIMIT);
  assert.equal(s.history[0].id, `x${HISTORY_LIMIT + 19}`); // en yeni başta

  s.clearHistory();
  assert.equal(new Store(dir).history.length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('kuyruk: bayt/toplam bilgisi, 4K çıktı ve ad kaydı, yeniden adlandırma, biten olayı', async () => {
  const gates = new Map();
  const q = new DownloadQueue({
    concurrency: 1,
    runner: (item, ctx) =>
      new Promise((resolve) => {
        gates.set(item.title, { resolve, ctx });
      }),
  });
  const finished = [];
  q.on('finished', (it) => finished.push(it));

  q.add([
    { kind: 'clip', id: 'c1', title: 'Bir', url: 'u1', sourceKey: 'k1', output: '4k60', fileName: 'Ozel Ad' },
    { kind: 'clip', id: 'c2', title: 'Iki', url: 'u2', sourceKey: 'k2' },
  ]);
  await wait(10);
  const [a, b] = q.list();
  assert.equal(a.output, '4k60');
  assert.equal(a.fileName, 'Ozel Ad');
  assert.equal(a.sourceId, 'c1');
  assert.equal(b.output, 'original');

  gates.get('Bir').ctx.progress({ percent: 40, speed: 1000, eta: 5, bytes: 412 * 1048576, total: 1000 * 1048576, estimated: true });
  const running = q.list()[0];
  assert.equal(running.bytesDone, 412 * 1048576);
  assert.equal(running.bytesTotal, 1000 * 1048576);
  assert.equal(running.totalEstimated, true);

  // çalışan öğe yeniden adlandırılamaz, sıradaki adlandırılır
  assert.equal(q.rename(a.id, 'Yeni'), false);
  assert.equal(q.rename(b.id, '  Yeni Ad  '), true);
  assert.equal(q.list()[1].fileName, 'Yeni Ad');

  gates.get('Bir').resolve('/out/a.mp4');
  await wait(10);
  assert.equal(finished.length, 1);
  assert.equal(finished[0].status, 'done');
  assert.equal(finished[0].filePath, '/out/a.mp4');
});

test('dikey 9:16: kırp ve bulanık arka plan argümanları', () => {
  const { buildFfmpegArgs, chooseMode } = require('../src/main/downloader');
  const crop = buildFfmpegArgs({ input: 'in.mp4', outPart: 'o.part', mode: 'vcrop' }).join(' ');
  assert.match(crop, /crop=1080:1920/);
  const blur = buildFfmpegArgs({ input: 'in.mp4', outPart: 'o.part', mode: 'vblur' }).join(' ');
  assert.match(blur, /boxblur/);
  assert.match(blur, /-map \[v\]/);
  assert.equal(chooseMode('vblur', { height: 1920, fps: 60 }), 'vblur');
});

test('filtre: en çok izlenen N', () => {
  const F = require('../src/shared/itemfilter');
  const items = [{ id: 'a', views: 5 }, { id: 'b', views: 50 }, { id: 'c', views: 20 }];
  assert.deepEqual(F.filterItems(items, { top: 2 }).map((i) => i.id), ['b', 'c']);
  assert.equal(F.isActive({ top: 10 }), true);
  assert.equal(F.filterItems(items, {}).length, 3);
});

test('dikey 9:16: 720x1280 seçenekleri ve medya aktarıcı adres kuralları', () => {
  const { buildFfmpegArgs, UPSCALE } = require('../src/main/downloader');
  assert.equal(UPSCALE.vblur720.h, 1280);
  const a = buildFfmpegArgs({ input: 'in.mp4', outPart: 'o.part', mode: 'vcrop720' }).join(' ');
  assert.match(a, /crop=720:1280/);
  const b = buildFfmpegArgs({ input: 'in.mp4', outPart: 'o.part', mode: 'vblur720' }).join(' ');
  assert.match(b, /scale=720:1280/);
  const m = require('../src/main/mediaproxy');
  assert.equal(m.mapRemote('voidmedia://clips.kick.com/a/b.m3u8?x=1'), 'https://clips.kick.com/a/b.m3u8?x=1');
  assert.equal(m.mapRemote('voidmedia://127.0.0.1/x'), null); // yerel adres kapalı
  assert.equal(m.mapRemote('voidmedia://localhost/x'), null);
  assert.equal(m.mapRemote('https://kick.com/x'), null);
  assert.equal(m.toProxyUrl('https://a.b/c.m3u8'), 'voidmedia://a.b/c.m3u8');
});
