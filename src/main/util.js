'use strict';
const fs = require('fs');
const path = require('path');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/** Dosya adında yasak karakterleri temizler. */
function sanitizeName(name, fallback = 'video') {
  let s = String(name || '')
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s = '_' + s;
  if (!s) s = fallback;
  return s.length > 150 ? s.slice(0, 150).trim() : s;
}

/** Aynı isimli dosya varsa "(1)", "(2)" ekler, asla üzerine yazmaz. */
function uniquePath(dir, baseName, ext) {
  let candidate = path.join(dir, `${baseName}${ext}`);
  let i = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${baseName} (${i})${ext}`);
    i += 1;
  }
  return candidate;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/** ISO tarihi "2026-10-31" biçimine çevirir. */
function dateStamp(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDuration(sec) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { UA, sanitizeName, uniquePath, dateStamp, formatDuration, sleep };
