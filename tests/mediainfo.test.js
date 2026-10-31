'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseInfo, getMediaInfo } = require('../src/main/mediainfo');
const { probeEntry } = require('../src/main/probe');
const { downloadItem, buildFfmpegArgs } = require('../src/main/downloader');

const SAMPLE = `Input #0, mov,mp4, from 'x.mp4':
  Duration: 00:00:42.50, start: 0.000000, bitrate: 5000 kb/s
  Stream #0:0(und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 4900 kb/s, 59.94 fps, 60 tbr, 90k tbn
  Stream #0:1(und): Audio: aac (LC), 48000 Hz, stereo, fltp, 128 kb/s`;

test('ffmpeg çıktısından çözünürlük, fps ve süre okunur', () => {
  assert.deepEqual(parseInfo(SAMPLE), { width: 1920, height: 1080, fps: 60, duration: 42.5 });
  assert.equal(parseInfo('garbage').height, 0);
});

test('probe: tek mp4 klibin gerçek çözünürlüğü ve daha düşük kaliteler listelenir', async () => {
  const p = await probeEntry(
    { id: 'c', title: 'T', url: 'https://x/a.mp4', duration: 40 },
    { headSize: async () => 40e6, mediaInfo: async () => ({ width: 1920, height: 1080, fps: 60, duration: 42 }) }
  );
  assert.deepEqual(p.qualities.map((q) => q.label), ['1080p60 (Source)', '720p60', '480p60', '360p60']);
  assert.equal(p.qualities[0].exact, true);
  assert.ok(p.qualities[1].bytes > 0 && p.qualities[1].bytes < 40e6);
  // çözünürlük okunamazsa yine de standart düşük kaliteler sunulur (1080p varsayılır)
  const q = await probeEntry({ id: 'c', title: 'T', url: 'https://x/a.mp4' }, { headSize: async () => 5, mediaInfo: async () => null });
  assert.deepEqual(q.qualities.map((x) => x.label), ['Orijinal', '720p', '480p', '360p']);
});

test('720p istenince doğrudan mp4 yeniden kodlanıp küçültülür', async (t) => {
  const ff = ['ffmpeg'].find((c) => spawnSync(c, ['-version']).status === 0);
  if (!ff) return t.skip('ffmpeg yok');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-sc-'));
  const src = path.join(root, 'src.mp4');
  assert.equal(
    spawnSync(ff, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=1', '-pix_fmt', 'yuv420p', src]).status,
    0
  );
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Length': fs.statSync(src).size });
    fs.createReadStream(src).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}/src.mp4`;
  const info = await getMediaInfo(ff, url);
  assert.equal(info.height, 360);
  const ctx = { setCancel() {}, setFilePath() {}, progress() {} };
  const out = await downloadItem({ kind: 'clip', title: 'S', url, quality: '180', duration: 1 }, ctx, { dir: path.join(root, 'o'), ffmpegPath: ff });
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=height', '-of', 'csv=p=0', out]);
  if (r.status === 0) assert.equal(String(r.stdout).trim(), '180');
  // kaynaktan büyük kalite istenirse kopyalanır (yeniden kodlanmaz)
  const same = await downloadItem({ kind: 'clip', title: 'S2', url, quality: '720', duration: 1 }, ctx, { dir: path.join(root, 'o'), ffmpegPath: ff });
  assert.equal(fs.statSync(same).size, fs.statSync(src).size);
});

test('2K 60: 2560x1440 ölçek argümanı', () => {
  assert.match(buildFfmpegArgs({ input: 'i', outPart: 'o', mode: '1440p60' }).join(' '), /scale=2560:1440.*fps=60/);
});
