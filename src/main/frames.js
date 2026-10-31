'use strict';
const { spawn } = require('child_process');
const { UA } = require('./util');

/** Tek kare çıkarmak için ffmpeg argümanları. out: dosya yolu ya da 'pipe:1'. */
function buildFrameArgs({ input, t, out, full }) {
  const sec = Math.max(0, Number(t) || 0);
  const pipe = out === 'pipe:1';
  return [
    '-hide_banner', '-loglevel', 'error', '-user_agent', UA,
    '-ss', String(sec), '-i', input,
    '-frames:v', '1', '-an', '-sn',
    ...(full ? [] : ['-vf', 'scale=640:-2']),
    ...(pipe ? ['-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '5'] : ['-y']),
    out,
  ];
}

/** Kareyi çıkarır; out='pipe:1' ise JPEG Buffer döner, dosya yoluysa dosyayı yazar. */
function grabFrame(ffmpegPath, opts, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const pipe = opts.out === 'pipe:1';
    const proc = spawn(ffmpegPath, buildFrameArgs(opts), { windowsHide: true });
    const chunks = [];
    let err = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('Kare alınamadı (zaman aşımı).'));
    }, timeoutMs);
    if (pipe) proc.stdout.on('data', (d) => chunks.push(d));
    proc.stderr.on('data', (d) => (err += d));
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const buf = Buffer.concat(chunks);
      if (code !== 0 || (pipe && !buf.length)) {
        return reject(new Error(err.trim().split('\n').pop() || 'Bu ana ait kare bulunamadı (süreyi aşmış olabilir).'));
      }
      resolve(pipe ? buf : null);
    });
  });
}

module.exports = { buildFrameArgs, grabFrame };
