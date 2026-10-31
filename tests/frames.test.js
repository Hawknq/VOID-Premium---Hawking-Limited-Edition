'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildFrameArgs, grabFrame } = require('../src/main/frames');

function findFfmpeg() {
  const c = [];
  try { c.push(require('ffmpeg-static')); } catch {}
  c.push('ffmpeg');
  return c.find((p) => p && spawnSync(p, ['-version']).status === 0);
}
const ffmpeg = findFfmpeg();

test('kare argümanları: ön izleme küçültür, tam kare küçültmez', () => {
  assert.ok(buildFrameArgs({ input: 'u', t: 5, out: 'pipe:1' }).includes('scale=640:-2'));
  assert.ok(!buildFrameArgs({ input: 'u', t: 5, out: 'x.png', full: true }).includes('scale=640:-2'));
  assert.equal(buildFrameArgs({ input: 'u', t: -3, out: 'x.png' })[buildFrameArgs({ input: 'u', t: -3, out: 'x.png' }).indexOf('-ss') + 1], '0');
});

test('http kaynaktan JPEG önizleme ve PNG kare', { skip: !ffmpeg && 'ffmpeg yok' }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-frames-'));
  const src = path.join(dir, 's.mp4');
  const r = spawnSync(ffmpeg, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25', '-t', '4', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', src]);
  assert.equal(r.status, 0);
  const server = http.createServer((req, res) => {
    const data = fs.readFileSync(src);
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    if (m) {
      const s = Number(m[1]);
      const e = m[2] ? Number(m[2]) : data.length - 1;
      res.writeHead(206, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${s}-${e}/${data.length}`, 'Content-Length': e - s + 1 });
      return res.end(data.subarray(s, e + 1));
    }
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': data.length });
    res.end(data);
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}/s.mp4`;

  const jpg = await grabFrame(ffmpeg, { input: url, t: 2, out: 'pipe:1', full: false });
  assert.equal(jpg[0], 0xff);
  assert.equal(jpg[1], 0xd8);

  const png = path.join(dir, 'f.png');
  await grabFrame(ffmpeg, { input: url, t: 1, out: png, full: true });
  assert.ok(fs.statSync(png).size > 1000);

  await assert.rejects(grabFrame(ffmpeg, { input: url, t: 100, out: 'pipe:1', full: false }));
});
