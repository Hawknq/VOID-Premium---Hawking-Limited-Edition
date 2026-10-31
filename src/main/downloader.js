'use strict';
const fs = require('fs');
const { spawn } = require('child_process');
const { UA, sanitizeName, uniquePath, dateStamp, sleep } = require('./util');
const hls = require('./hls');
const { getMediaInfo } = require('./mediainfo');

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' } });
  if (!res.ok) throw new Error(`Playlist alınamadı (HTTP ${res.status})`);
  return res.text();
}

/** m3u8 adresini analiz eder: kalite listesi ve (varsa) süre döndürür. */
async function analyzeHls(url) {
  const text = await fetchText(url);
  if (hls.isMaster(text)) {
    const variants = hls.parseMaster(text, url);
    if (!variants.length) throw new Error('Playlist içinde kalite bulunamadı.');
    return { variants, duration: 0 };
  }
  const media = hls.parseMedia(text);
  // Adres tek bir kalitenin (media) playlist'i olabilir; yanındaki master'ı bulursak tüm kaliteler listelenir.
  for (const rel of ['../master.m3u8', 'master.m3u8']) {
    try {
      const mUrl = new URL(rel, url).toString();
      if (mUrl === url) continue;
      const mText = await fetchText(mUrl);
      if (!hls.isMaster(mText)) continue;
      const variants = hls.parseMaster(mText, mUrl);
      if (variants.length > 1) return { variants, duration: media.duration, discovered: true };
    } catch {
      /* master yok; tek kalite olarak devam */
    }
  }
  return { variants: [{ url, bandwidth: 0, width: 0, height: 0, fps: 0, label: 'Source' }], duration: media.duration };
}

/** Otomatik dosya adı (uzantısız): "kanal - başlık [tarih]". */
function autoName(item) {
  const date = dateStamp(item.createdAt);
  const parts = [];
  if (item.channel) parts.push(item.channel);
  parts.push(item.title || (item.kind === 'vod' ? 'Yayin kaydi' : 'Klip'));
  let name = parts.join(' - ');
  if (date) name += ` [${date}]`;
  return sanitizeName(name, item.kind === 'vod' ? 'vod' : 'klip');
}

/**
 * Nihai dosya adı (uzantısız). Kullanıcı bir ad yazdıysa aynen kullanılır;
 * otomatik adda 4K çıktı "[4K60]" ile ayırt edilir.
 */
const UPSCALE = {
  '4k60': { w: 3840, h: 2160, level: '5.2', tag: '4K60' },
  '1080p60': { w: 1920, h: 1080, level: '4.2', tag: '1080p60' },
  '1440p60': { w: 2560, h: 1440, level: '5.1', tag: '2K60' },
  // Dikey 9:16 (TikTok / Shorts / Reels): arka planı bulanık ya da ortadan kırpılmış
  vblur: { w: 1080, h: 1920, level: '4.2', tag: 'Dikey', vertical: 'blur' },
  vcrop: { w: 1080, h: 1920, level: '4.2', tag: 'Dikey', vertical: 'crop' },
  vblur720: { w: 720, h: 1280, level: '3.1', tag: 'Dikey 720', vertical: 'blur' },
  vcrop720: { w: 720, h: 1280, level: '3.1', tag: 'Dikey 720', vertical: 'crop' },
};

function buildBaseName(item) {
  if (item.fileName && String(item.fileName).trim()) {
    return sanitizeName(String(item.fileName).replace(/\.mp4$/i, ''), item.kind === 'vod' ? 'vod' : 'klip');
  }
  const base = autoName(item);
  const up = UPSCALE[item.output];
  let name = up ? `${base} [${up.tag}]` : base;
  if (item.trimStart > 0 || item.trimEnd > 0) name += ' [kırpık]';
  return sanitizeName(name);
}

function safeUnlink(p) {
  try {
    fs.unlinkSync(p);
  } catch {
    /* yok say */
  }
}

/**
 * ffmpeg argümanları.
 *  - 'copy' : yeniden kodlamadan kayıpsız kopya
 *  - '4k60' : 3840x2160, 60 kare/sn'ye yükseltme (yeniden kodlar; gerçek çözünürlük kazandırmaz)
 */
function buildFfmpegArgs({ input, outPart, mode, trim, readrate }) {
  const t = trim || {};
  const head = [
    '-hide_banner', '-loglevel', 'error', '-user_agent', UA,
    ...(readrate > 0 ? ['-readrate', String(readrate)] : []),
    ...(t.start > 0 ? ['-ss', String(t.start)] : []),
    '-i', input,
    ...(t.end > 0 ? ['-t', String(t.end - (t.start || 0))] : []),
  ];
  const tail = ['-f', 'mp4', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', '-y', outPart];
  const sc = /^scale:(\d+)$/.exec(String(mode));
  if (sc) {
    // Doğrudan dosyada daha düşük kaliteye indirme (kare hızı korunur, büyütme yapılmaz)
    return [
      ...head,
      '-vf', `scale=-2:${sc[1]}:flags=lanczos,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-c:a', 'copy',
      ...tail,
    ];
  }
  const up = UPSCALE[mode];
  if (up && up.vertical) {
    // Kaynak kare hızı korunur; 1080x1920 dikey çıktı
    const common = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-profile:v', 'high', '-level:v', up.level, '-c:a', 'aac', '-b:a', '160k'];
    if (up.vertical === 'crop') {
      return [...head, '-vf', `scale=-2:${up.h}:flags=lanczos,crop=${up.w}:${up.h},setsar=1,format=yuv420p`, ...common, ...tail];
    }
    return [
      ...head,
      '-filter_complex',
      `[0:v]split[a][b];[a]scale=${up.w}:${up.h}:force_original_aspect_ratio=increase,crop=${up.w}:${up.h},boxblur=40:6[bg];` +
        `[b]scale=${up.w}:-2:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[v]`,
      '-map', '[v]', '-map', '0:a?',
      ...common,
      ...tail,
    ];
  }
  if (up) {
    return [
      ...head,
      '-vf',
      `scale=${up.w}:${up.h}:force_original_aspect_ratio=decrease:flags=lanczos,` +
        `pad=${up.w}:${up.h}:(ow-iw)/2:(oh-ih)/2:color=black,fps=60,format=yuv420p`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '17',
      '-profile:v', 'high',
      '-level:v', up.level,
      '-c:a', 'aac',
      '-b:a', '192k',
      ...tail,
    ];
  }
  return [...head, '-c', 'copy', '-bsf:a', 'aac_adtstoasc', ...tail];
}

/** Kaynak zaten 4K 60 fps ise yeniden kodlamaya gerek yok; değilse istenirse yükseltilir. */
function chooseMode(output, variant) {
  const up = UPSCALE[output];
  if (!up) return 'copy';
  if (up.vertical) return output;
  const native = variant.height === up.h && variant.fps >= 50;
  return native ? 'copy' : output;
}

/** ffmpeg çalıştırır; ilerleme, hız ve bayt bilgisini ctx.progress ile bildirir. */
function runFfmpeg({ ffmpegPath, input, outPart, duration, mode, ctx, trim, readrate }) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, buildFfmpegArgs({ input, outPart, mode, trim, readrate }), { windowsHide: true });
    let canceled = false;
    let stderr = '';
    let buf = '';
    let lastTime = 0;
    let lastWall = Date.now();
    let lastSize = 0;
    let rate = 0; // video-sn / gerçek-sn

    ctx.setCancel(() => {
      canceled = true;
      proc.kill('SIGKILL');
    });

    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      const kv = {};
      for (const line of lines) {
        const i = line.indexOf('=');
        if (i > 0) kv[line.slice(0, i)] = line.slice(i + 1);
      }
      const us = parseInt(kv.out_time_us || kv.out_time_ms || '0', 10);
      if (!us) return;
      const cur = us / 1e6;
      const size = parseInt(kv.total_size || '0', 10) || 0;
      const now = Date.now();
      const dt = (now - lastWall) / 1000;
      if (dt >= 0.5) {
        const r = (cur - lastTime) / dt;
        rate = rate ? rate * 0.7 + r * 0.3 : r;
        const speed = Math.max(0, (size - lastSize) / dt);
        lastTime = cur;
        lastWall = now;
        lastSize = size;
        const percent = duration ? Math.min(100, (cur / duration) * 100) : 0;
        const eta = duration && rate > 0 ? Math.max(0, (duration - cur) / rate) : 0;
        // Toplam boyut HLS'de baştan bilinmez: ilerlemeye göre tahmin edilir (en az %2'den sonra)
        const estimatedTotal = percent >= 2 ? Math.round(size / (percent / 100)) : 0;
        ctx.progress({ percent, speed, eta, bytes: size, total: estimatedTotal, estimated: true });
      }
    });
    proc.stderr.on('data', (d) => {
      stderr = (stderr + d.toString()).slice(-800);
    });
    proc.on('error', (err) => reject(new Error(`ffmpeg başlatılamadı: ${err.message}`)));
    proc.on('close', (code) => {
      if (canceled) return reject(new Error('İptal edildi'));
      if (code === 0) return resolve();
      reject(new Error(stderr.trim().split('\n').pop() || `ffmpeg hata kodu ${code}`));
    });
  });
}

/** Doğrudan mp4 indirme (akış olarak, ilerleme ve hız ile). */
async function downloadDirect({ url, outPart, ctx, speedLimit = 0 }) {
  const startedAt = Date.now();
  const controller = new AbortController();
  let canceled = false;
  ctx.setCancel(() => {
    canceled = true;
    controller.abort();
  });
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: controller.signal });
  if (!res.ok || !res.body) throw new Error(`İndirme başlatılamadı (HTTP ${res.status})`);
  const total = parseInt(res.headers.get('content-length') || '0', 10);
  const ws = fs.createWriteStream(outPart);
  let received = 0;
  let lastWall = Date.now();
  let lastBytes = 0;
  let speed = 0;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!ws.write(value)) await new Promise((r) => ws.once('drain', r));
      received += value.length;
      if (speedLimit > 0) {
        // Hız sınırı: şimdiye kadar alınan bayt, sınırın izin verdiğinden öndeyse bekle
        const ahead = received / speedLimit - (Date.now() - startedAt) / 1000;
        if (ahead > 0.05) await sleep(Math.min(ahead * 1000, 2000));
      }
      const now = Date.now();
      const dt = (now - lastWall) / 1000;
      if (dt >= 0.5) {
        const s = (received - lastBytes) / dt;
        speed = speed ? speed * 0.7 + s * 0.3 : s;
        lastBytes = received;
        lastWall = now;
        ctx.progress({
          percent: total ? (received / total) * 100 : 0,
          speed,
          eta: total && speed > 0 ? (total - received) / speed : 0,
          bytes: received,
          total,
          estimated: false,
        });
      }
    }
    await new Promise((resolve, reject) => {
      ws.end((err) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    ws.destroy();
    if (canceled) throw new Error('İptal edildi');
    throw err;
  }
}

/**
 * Tek bir kuyruk öğesini indirir. Başarıda dosya yolunu döndürür.
 * item.output: 'original' (varsayılan, kayıpsız) | '4k60' (4K 60 fps'e yükseltme)
 * opts: { dir, ffmpegPath }
 */
async function downloadItem(item, ctx, opts) {
  if (!opts.dir) throw new Error('İndirme klasörü seçilmedi.');
  fs.mkdirSync(opts.dir, { recursive: true });
  if (!item.url) throw new Error('İndirme adresi bulunamadı (yayın silinmiş veya abonelere özel olabilir).');

  const out = uniquePath(opts.dir, buildBaseName(item), '.mp4');
  const outPart = `${out}.part`;
  const isHls = /\.m3u8(\?|$)/i.test(item.url);
  const want4k = !!UPSCALE[item.output];
  const trim = { start: Number(item.trimStart) || 0, end: Number(item.trimEnd) || 0 };
  const trimmed = trim.start > 0 || trim.end > 0;
  const limit = Number(opts.speedLimit) || 0; // bayt/sn, 0 = sınırsız
  const span = (total) => (trimmed ? Math.max(0, (trim.end || total) - trim.start) : total);

  try {
    if (isHls) {
      const info = await analyzeHls(item.url);
      // 4K çıktıda her zaman en yüksek kaliteli kaynak seçilir
      const variant = want4k ? info.variants[0] : hls.pickVariant(info.variants, item.quality);
      let duration = info.duration;
      if (!duration) {
        try {
          duration = hls.parseMedia(await fetchText(variant.url)).duration;
        } catch {
          duration = 0;
        }
      }
      let mode = chooseMode(item.output, variant);
      // İstenen kalite kaynakta yoksa (tek kalite sunan akış) yeniden kodlayarak küçült
      const wantH = parseInt(item.quality, 10);
      if (wantH && mode === 'copy' && opts.ffmpegPath && !(variant.height && variant.height <= wantH)) {
        const mi = await getMediaInfo(opts.ffmpegPath, variant.url);
        if (mi && mi.height > wantH) mode = `scale:${wantH}`;
      }
      // HLS'de bayt sınırı, kalitenin bit hızına göre "gerçek zamanın kaç katı" okunacağına çevrilir
      const readrate = limit > 0 && variant.bandwidth ? Math.max(0.1, +(limit / (variant.bandwidth / 8)).toFixed(3)) : 0;
      await runFfmpeg({ ffmpegPath: opts.ffmpegPath, input: variant.url, outPart, duration: span(duration), mode, ctx, trim, readrate });
    } else if (want4k) {
      await runFfmpeg({
        ffmpegPath: opts.ffmpegPath,
        input: item.url,
        outPart,
        duration: span(Number(item.duration) || 0),
        mode: item.output,
        ctx,
        trim,
      });
    } else {
      // Doğrudan dosya: daha düşük kalite istendiyse (kaynaktan küçükse) yeniden kodlayarak indir
      const want = parseInt(item.quality, 10);
      let scaleTo = 0;
      if (want && opts.ffmpegPath) {
        const info = await getMediaInfo(opts.ffmpegPath, item.url);
        if (info && info.height > want) scaleTo = want;
      }
      if (scaleTo || trimmed) {
        await runFfmpeg({ ffmpegPath: opts.ffmpegPath, input: item.url, outPart, duration: span(Number(item.duration) || 0), mode: scaleTo ? `scale:${scaleTo}` : 'copy', ctx, trim });
      } else {
        await downloadDirect({ url: item.url, outPart, ctx, speedLimit: limit });
      }
    }
    if (trimmed && (!fs.existsSync(outPart) || fs.statSync(outPart).size < 1024)) {
      throw new Error('Bölüm kırpılamadı: kaynak, istenen aralığı okumaya izin vermiyor. Kırpmadan indirmeyi dene.');
    }
    fs.renameSync(outPart, out);
    return out;
  } catch (err) {
    safeUnlink(outPart);
    throw err;
  }
}

module.exports = { UPSCALE, analyzeHls, downloadItem, buildBaseName, autoName, buildFfmpegArgs, chooseMode, fetchText, sleep };
