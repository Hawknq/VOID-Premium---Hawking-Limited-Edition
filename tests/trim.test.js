'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { downloadItem, buildFfmpegArgs, buildBaseName } = require('../src/main/downloader');

const ff = ['ffmpeg'].find((c) => spawnSync(c, ['-version']).status === 0);

test('kırpma ve hız sınırı ffmpeg argümanlarına yansır', () => {
  const a = buildFfmpegArgs({ input: 'in', outPart: 'o', mode: 'copy', trim: { start: 10, end: 25 }, readrate: 0.5 });
  const j = a.join(' ');
  assert.match(j, /-readrate 0\.5/);
  assert.match(j, /-ss 10 -i in -t 15/);
  assert.ok(!buildFfmpegArgs({ input: 'in', outPart: 'o', mode: 'copy' }).join(' ').includes('-ss'));
  assert.match(buildBaseName({ kind: 'clip', title: 'A', trimStart: 5 }), /\[kırpık\]$/);
});

async function serve(file) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Length': fs.statSync(file).size });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return server;
}

test('doğrudan mp4: 2-4. saniye kırpılır; hız sınırı indirmeyi yavaşlatır', { skip: !ff && 'ffmpeg yok' }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-trim-'));
  const src = path.join(root, 's.mp4');
  assert.equal(
    spawnSync(ff, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25:duration=6', '-f', 'lavfi', '-i', 'sine=duration=6',
      '-c:v', 'libx264', '-g', '25', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', src]).status, 0);
  const server = await serve(src);
  t.after(() => { server.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}/s.mp4`;
  const ctx = { setCancel() {}, setFilePath() {}, progress() {} };
  const out = path.join(root, 'o');

  const p = await downloadItem({ kind: 'clip', title: 'K', url, duration: 6, trimStart: 2, trimEnd: 4 }, ctx, { dir: out, ffmpegPath: ff });
  assert.match(path.basename(p), /\[kırpık\]\.mp4$/);
  const pr = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]);
  if (pr.status === 0) assert.ok(Math.abs(parseFloat(String(pr.stdout)) - 2) < 0.6, String(pr.stdout));

  // hız sınırı: dosya boyutunun ~2 katı sn sürmeli (sınır = boyut/1.5 bayt/sn -> ~1.5 sn)
  const size = fs.statSync(src).size;
  const t0 = Date.now();
  await downloadItem({ kind: 'clip', title: 'H', url }, ctx, { dir: out, ffmpegPath: ff, speedLimit: size / 1.5 });
  assert.ok(Date.now() - t0 >= 1000, `çok hızlı bitti: ${Date.now() - t0} ms`);
});
