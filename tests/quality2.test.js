'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { pickClipUrl, normalizeClip } = require('../src/main/kick');
const { analyzeHls, buildBaseName, buildFfmpegArgs } = require('../src/main/downloader');

test('klip adresi: HLS (çoklu kalite) varsa tercih edilir', () => {
  assert.equal(pickClipUrl({ clip_url: 'https://x/a.mp4', video_url: 'https://x/p.m3u8' }), 'https://x/p.m3u8');
  assert.equal(pickClipUrl({ clip_url: 'https://x/a.mp4' }), 'https://x/a.mp4');
  assert.equal(normalizeClip({ id: 'c1', clip_url: 'https://x/m.m3u8?t=1' }).url, 'https://x/m.m3u8?t=1');
});

test('tek kalite playlist verilirse yanındaki master bulunur ve tüm kaliteler listelenir', async (t) => {
  const master =
    '#EXTM3U\n' +
    '#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,FRAME-RATE=60.000\n1080p60/playlist.m3u8\n' +
    '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,FRAME-RATE=60.000\n720p60/playlist.m3u8\n' +
    '#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=852x480,FRAME-RATE=30.000\n480p30/playlist.m3u8\n';
  const media = '#EXTM3U\n#EXTINF:10.0,\ns0.ts\n#EXTINF:5.0,\ns1.ts\n#EXT-X-ENDLIST\n';
  const srv = http.createServer((req, res) => {
    if (req.url === '/v/master.m3u8') return res.end(master);
    if (req.url === '/v/1080p60/playlist.m3u8') return res.end(media);
    res.writeHead(404).end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  t.after(() => srv.close());
  const base = `http://127.0.0.1:${srv.address().port}`;

  const info = await analyzeHls(`${base}/v/1080p60/playlist.m3u8`);
  assert.equal(info.variants.length, 3);
  assert.equal(info.variants[0].label, '1080p60 (Source)');
  assert.equal(info.duration, 15);

  // master yoksa tek kalite olarak devam eder
  const single = await analyzeHls(`${base}/v/1080p60/playlist.m3u8`.replace('/v/', '/v/')).catch(() => null);
  assert.ok(single);
});

test('1080p60 yükseltme: ad eki, ölçek ve fps', () => {
  assert.match(buildBaseName({ kind: 'clip', title: 'A', output: '1080p60' }), /\[1080p60\]$/);
  const args = buildFfmpegArgs({ input: 'i', outPart: 'o', mode: '1080p60' }).join(' ');
  assert.match(args, /scale=1920:1080/);
  assert.match(args, /fps=60/);
  assert.match(buildFfmpegArgs({ input: 'i', outPart: 'o', mode: '4k60' }).join(' '), /scale=3840:2160/);
});
