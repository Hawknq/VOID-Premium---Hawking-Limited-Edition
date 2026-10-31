'use strict';
const { spawn } = require('child_process');
const { UA } = require('./util');

/** ffmpeg -i çıktısından (stderr) çözünürlük, kare hızı ve süreyi okur. */
function parseInfo(text) {
  const s = String(text || '');
  const info = { width: 0, height: 0, fps: 0, duration: 0 };
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s);
  if (d) info.duration = Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]);
  const v = /Stream #[^\n]*Video:[^\n]*/.exec(s);
  if (v) {
    // "yuv420p(...), 1920x1080 [SAR 1:1 DAR 16:9], 60 fps" -> 0x0 gibi codec etiketlerini atla
    const size = /[\s,](\d{2,5})x(\d{2,5})(?=[\s,\[])/.exec(v[0]);
    if (size) {
      info.width = Number(size[1]);
      info.height = Number(size[2]);
    }
    const f = /(\d+(?:\.\d+)?)\s*fps/.exec(v[0]);
    if (f) info.fps = Math.round(parseFloat(f[1]));
  }
  return info;
}

/** Bir adresin ilk kısmını okuyup medya bilgisini döndürür; başarısızsa null. */
function getMediaInfo(ffmpegPath, url, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let err = '';
    let proc;
    try {
      proc = spawn(ffmpegPath, ['-hide_banner', '-user_agent', UA, '-i', url], { windowsHide: true });
    } catch {
      return resolve(null);
    }
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
    }, timeoutMs);
    proc.stderr.on('data', (d) => {
      err = (err + d.toString()).slice(-6000);
    });
    proc.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    proc.on('close', () => {
      clearTimeout(timer);
      const info = parseInfo(err);
      resolve(info.height ? info : null);
    });
  });
}

module.exports = { parseInfo, getMediaInfo };
