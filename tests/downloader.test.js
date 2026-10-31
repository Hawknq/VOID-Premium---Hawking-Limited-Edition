'use strict';
/**
 * Uçtan uca test: yerel HTTP sunucusundan gerçek HLS (master + media) ve doğrudan mp4
 * indirir. ffmpeg bulunamazsa test atlanır.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { downloadItem } = require('../src/main/downloader');

function findFfmpeg() {
  const candidates = [];
  try {
    candidates.push(require('ffmpeg-static'));
  } catch {
    /* kurulu değil */
  }
  candidates.push('ffmpeg');
  for (const c of candidates) {
    if (c && spawnSync(c, ['-version']).status === 0) return c;
  }
  return null;
}

const ffmpeg = findFfmpeg();

test('HLS (master -> kalite seç) ve doğrudan mp4 indirme', { skip: !ffmpeg && 'ffmpeg bulunamadı' }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-e2e-'));
  const srv = path.join(root, 'srv');
  const out = path.join(root, 'out');
  fs.mkdirSync(srv);

  // 3 sn'lik sentetik video + ses, HLS olarak böl
  let r = spawnSync(ffmpeg, [
    '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25:duration=3',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
    '-f', 'hls', '-hls_time', '1', '-hls_playlist_type', 'vod',
    '-hls_segment_filename', path.join(srv, 'seg%d.ts'),
    path.join(srv, '180p.m3u8'),
  ]);
  assert.equal(r.status, 0, String(r.stderr));
  fs.writeFileSync(
    path.join(srv, 'master.m3u8'),
    '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=320x180,FRAME-RATE=25.000\n180p.m3u8\n'
  );
  r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=10:duration=1', '-pix_fmt', 'yuv420p', path.join(srv, 'clip.mp4')]);
  assert.equal(r.status, 0, String(r.stderr));

  const server = http.createServer((req, res) => {
    const file = path.join(srv, path.basename(req.url.split('?')[0]));
    if (!fs.existsSync(file)) {
      res.writeHead(404);
      return res.end();
    }
    const size = fs.statSync(file).size;
    res.writeHead(200, { 'Content-Length': size });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r2) => server.listen(0, '127.0.0.1', r2));
  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const progress = [];
  const ctx = () => ({ setCancel() {}, setFilePath() {}, progress: (p) => progress.push(p) });
  const opts = { dir: out, ffmpegPath: ffmpeg };

  // HLS VOD
  const vodPath = await downloadItem(
    { kind: 'vod', title: 'Test: yayın?', channel: 'hawking', createdAt: '2026-10-31T10:00:00Z', url: `${base}/master.m3u8`, quality: 'source' },
    ctx(),
    opts
  );
  assert.ok(fs.existsSync(vodPath));
  assert.match(path.basename(vodPath), /^hawking - Test yayın \[2026-10-\d\d\]\.mp4$/);
  assert.ok(fs.statSync(vodPath).size > 1000);
  assert.ok(!fs.existsSync(`${vodPath}.part`));
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', vodPath]);
  if (probe.status === 0) assert.ok(Math.abs(parseFloat(String(probe.stdout)) - 3) < 0.6);

  // Aynı isim: üzerine yazmaz
  const vodPath2 = await downloadItem(
    { kind: 'vod', title: 'Test: yayın?', channel: 'hawking', createdAt: '2026-10-31T10:00:00Z', url: `${base}/master.m3u8`, quality: '1080' },
    ctx(),
    opts
  );
  assert.notEqual(vodPath2, vodPath);
  assert.match(path.basename(vodPath2), /\(1\)\.mp4$/);

  // Doğrudan mp4 klip
  const clipPath = await downloadItem({ kind: 'clip', title: 'Klip', channel: 'x', url: `${base}/clip.mp4` }, ctx(), opts);
  assert.equal(fs.statSync(clipPath).size, fs.statSync(path.join(srv, 'clip.mp4')).size);

  // 404 -> hata ve artık dosya kalmaz
  await assert.rejects(downloadItem({ kind: 'clip', title: 'Yok', url: `${base}/yok.mp4` }, ctx(), opts), /404/);
  assert.equal(fs.readdirSync(out).filter((f) => f.endsWith('.part')).length, 0);

  // Klasör yoksa anlamlı hata
  await assert.rejects(downloadItem({ kind: 'clip', title: 'X', url: `${base}/clip.mp4` }, ctx(), { ffmpegPath: ffmpeg }), /klasörü/);
});

test('iptal: HLS indirme kesilir, .part dosyası silinir', { skip: !ffmpeg && 'ffmpeg bulunamadı' }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-cancel-'));
  const out = path.join(root, 'out');
  // Hiç cevap vermeyen sunucu: ffmpeg takılı kalır, iptal ile kesilmeli
  const server = http.createServer(() => {});
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => {
    server.closeAllConnections?.();
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  let cancel = null;
  const ctx = { setCancel: (fn) => (cancel = fn), setFilePath() {}, progress() {} };
  // Playlist alma aşaması da takılacağı için doğrudan indirme yolunu iptal ediyoruz
  const p = downloadItem({ kind: 'clip', title: 'Iptal', url: `${base}/a.mp4` }, ctx, { dir: out, ffmpegPath: ffmpeg });
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(cancel, 'iptal fonksiyonu kaydedilmeli');
  cancel();
  await assert.rejects(p, /İptal|abort/i);
  assert.equal(fs.readdirSync(out).length, 0);
});

test('4K 60 fps çıktı: gerçekten 3840x2160 ve 60 fps üretir; özel dosya adı kullanılır', { skip: !ffmpeg && 'ffmpeg bulunamadı' }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-4k-'));
  const srv = path.join(root, 'srv');
  const out = path.join(root, 'out');
  fs.mkdirSync(srv);
  // 1 sn, 160x90, 25 fps kaynak
  const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=25:duration=1',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
    path.join(srv, 'src.mp4')]);
  assert.equal(r.status, 0, String(r.stderr));

  const server = http.createServer((req, res) => {
    const file = path.join(srv, path.basename(req.url));
    res.writeHead(200, { 'Content-Length': fs.statSync(file).size });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r2) => server.listen(0, '127.0.0.1', r2));
  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}/src.mp4`;
  const ctx = { setCancel() {}, setFilePath() {}, progress() {} };

  const p4k = await downloadItem(
    { kind: 'clip', title: 'Dort K', channel: 'x', createdAt: '2026-10-31T10:00:00Z', url, output: '4k60', duration: 1 },
    ctx,
    { dir: out, ffmpegPath: ffmpeg }
  );
  assert.match(path.basename(p4k), /\[4K60\]\.mp4$/);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate',
    '-of', 'csv=p=0', p4k]);
  if (probe.status === 0) {
    const [w, h, fr] = String(probe.stdout).trim().split(',');
    assert.equal(w, '3840');
    assert.equal(h, '2160');
    assert.equal(fr, '60/1');
  }

  for (const mode of ['vblur', 'vcrop']) {
    const pv = await downloadItem({ kind: 'clip', title: 'Dikey ' + mode, channel: 'x', createdAt: '2026-10-31T10:00:00Z', url, output: mode, duration: 1 }, ctx, { dir: out, ffmpegPath: ffmpeg });
    assert.match(path.basename(pv), /\[Dikey\]\.mp4$/);
    const pr = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', pv]);
    if (pr.status === 0) assert.equal(String(pr.stdout).trim(), '1080,1920');
  }

  const named = await downloadItem({ kind: 'clip', title: 'Dort K', url, fileName: 'Benim Adim' }, ctx, { dir: out, ffmpegPath: ffmpeg });
  assert.equal(path.basename(named), 'Benim Adim.mp4');
});
