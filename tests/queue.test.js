'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DownloadQueue } = require('../src/main/queue');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const entry = (n, extra = {}) => ({ kind: 'clip', title: `K${n}`, url: `u${n}`, sourceKey: `clip:${n}:source`, ...extra });

function controllable() {
  const gates = new Map();
  const started = [];
  const runner = (item, ctx) =>
    new Promise((resolve, reject) => {
      started.push(item.title);
      ctx.setCancel(() => reject(new Error('iptal')));
      gates.set(item.title, { resolve: () => resolve(`/out/${item.title}.mp4`), reject, ctx });
    });
  return { gates, started, runner };
}

test('eşzamanlı limit uygulanır ve biten sonrakini başlatır', async () => {
  const c = controllable();
  const q = new DownloadQueue({ runner: c.runner, concurrency: 2 });
  q.add([entry(1), entry(2), entry(3)]);
  await wait(10);
  assert.deepEqual(c.started, ['K1', 'K2']);
  c.gates.get('K1').resolve();
  await wait(10);
  assert.deepEqual(c.started, ['K1', 'K2', 'K3']);
  const done = q.list().find((i) => i.title === 'K1');
  assert.equal(done.status, 'done');
  assert.equal(done.filePath, '/out/K1.mp4');
  assert.equal(done.percent, 100);
});

test('öncelik: yüksek olan önce başlar', async () => {
  const c = controllable();
  const q = new DownloadQueue({ runner: c.runner, concurrency: 1 });
  q.add([entry(1)], 'normal'); // hemen başlar
  q.add([entry(2)], 'low');
  q.add([entry(3)], 'high');
  await wait(10);
  c.gates.get('K1').resolve();
  await wait(10);
  assert.deepEqual(c.started, ['K1', 'K3']);
});

test('duraklat/devam: yalnızca sıradakiler duraklatılır', async () => {
  const c = controllable();
  const q = new DownloadQueue({ runner: c.runner, concurrency: 1 });
  q.add([entry(1), entry(2)]);
  await wait(10);
  const [a, b] = q.list();
  q.pause(a.id); // çalışan: etkisiz
  q.pause(b.id);
  assert.equal(q.list()[0].status, 'running');
  assert.equal(q.list()[1].status, 'paused');
  c.gates.get('K1').resolve();
  await wait(10);
  assert.deepEqual(c.started, ['K1']); // duraklatılan başlamadı
  q.resume(b.id);
  await wait(10);
  assert.deepEqual(c.started, ['K1', 'K2']);
});

test('iptal: çalışanı keser, hata olarak işaretlemez; tekrar dene çalışır', async () => {
  const c = controllable();
  const q = new DownloadQueue({ runner: c.runner, concurrency: 1 });
  q.add([entry(1)]);
  await wait(10);
  const id = q.list()[0].id;
  q.cancel(id);
  await wait(10);
  assert.equal(q.list()[0].status, 'canceled');
  q.retry(id);
  await wait(10);
  assert.equal(q.list()[0].status, 'running');
  assert.equal(c.started.length, 2);
});

test('hata durumu mesajı saklar', async () => {
  const q = new DownloadQueue({
    runner: async () => {
      throw new Error('HTTP 404');
    },
    concurrency: 1,
  });
  q.add([entry(1)]);
  await wait(20);
  const it = q.list()[0];
  assert.equal(it.status, 'error');
  assert.equal(it.error, 'HTTP 404');
});

test('aynı kaynak kuyruktayken tekrar eklenmez', async () => {
  const c = controllable();
  const q = new DownloadQueue({ runner: c.runner, concurrency: 1 });
  assert.equal(q.add([entry(1)]), 1);
  assert.equal(q.add([entry(1)]), 0);
  assert.equal(q.list().length, 1);
});

test('kalıcılık: kapanışta çalışanlar baştan kuyruğa döner, bitenler korunur', async () => {
  const c = controllable();
  let saved = null;
  const q = new DownloadQueue({ runner: c.runner, concurrency: 1, save: (items) => (saved = JSON.parse(JSON.stringify(items))) });
  q.add([entry(1), entry(2)]);
  await wait(10);
  c.gates.get('K1').resolve();
  await wait(10); // K1 bitti, K2 çalışıyor
  q.shutdown();
  await wait(10);
  const byTitle = Object.fromEntries(saved.map((i) => [i.title, i.status]));
  assert.deepEqual(byTitle, { K1: 'done', K2: 'queued' });

  const c2 = controllable();
  const q2 = new DownloadQueue({ runner: c2.runner, concurrency: 1, initial: saved });
  q2._pump();
  await wait(10);
  assert.deepEqual(c2.started, ['K2']); // yarım kalan baştan başladı, biten tekrar çalışmadı
});

test('temizle: biten/iptal/hatalı silinir, aktifler kalır', async () => {
  const c = controllable();
  const q = new DownloadQueue({ runner: c.runner, concurrency: 1 });
  q.add([entry(1), entry(2)]);
  await wait(10);
  c.gates.get('K1').resolve();
  await wait(10);
  q.clearFinished();
  assert.deepEqual(q.list().map((i) => i.title), ['K2']);
});

test('eşzamanlı sınırı 1–8 aralığına sıkıştırılır', () => {
  const q = new DownloadQueue({ runner: async () => {}, concurrency: 99 });
  assert.equal(q.concurrency, 8);
  q.setConcurrency(0);
  assert.equal(q.concurrency, 1);
});
