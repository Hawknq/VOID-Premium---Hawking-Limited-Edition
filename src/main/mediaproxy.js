'use strict';
/**
 * Uygulama içi oynatıcı için küçük medya aktarıcı: voidmedia://<sunucu>/<yol> -> https://<sunucu>/<yol>
 * Böylece CDN'in CORS / yönlendiren (Referer) kısıtları oynatmayı engellemez. Yalnızca https ve yalnızca
 * genel internet adreslerine izin verir (yerel/özel adres yok).
 */
const { UA } = require('./util');

const SCHEME = 'voidmedia';

function isPrivateHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true; // IPv4 adres sabiti
  if (h.includes(':') || h.startsWith('[')) return true; // IPv6 adres sabiti
  return false;
}

/** voidmedia adresini gerçek adrese çevirir; izin verilmezse null. */
function mapRemote(requestUrl, opts = {}) {
  let u;
  try {
    u = new URL(requestUrl);
  } catch {
    return null;
  }
  if (u.protocol !== `${SCHEME}:`) return null;
  // Yalnızca testler için: yerel sunucuya izin (özel şemada port taşınmadığı için port ayrıca verilir)
  if (opts.allowLocalHttp && u.hostname === '127.0.0.1') return `http://127.0.0.1:${opts.localPort || u.port || 80}${u.pathname}${u.search}`;
  if (isPrivateHost(u.hostname)) return null;
  return `https://${u.host}${u.pathname}${u.search}`;
}

/** https adresini voidmedia adresine çevirir (oynatıcı tarafında da aynı kural). */
function toProxyUrl(url) {
  return String(url).replace(/^https:\/\//i, `${SCHEME}://`);
}

function registerScheme(protocol) {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  ]);
}

function handleMedia(protocol, net, opts = {}) {
  protocol.handle(SCHEME, async (req) => {
    const remote = mapRemote(req.url, opts);
    if (!remote) return new Response('Yasak', { status: 403 });
    const headers = { 'User-Agent': UA };
    const range = req.headers.get('range');
    if (range) headers.Range = range;
    try {
      const up = await net.fetch(remote, { method: 'GET', headers, referrer: 'https://kick.com/', referrerPolicy: 'unsafe-url', bypassCustomProtocolHandlers: true, redirect: 'follow' });
      const out = new Headers();
      for (const k of ['content-type', 'content-range', 'accept-ranges', 'cache-control', 'etag', 'last-modified']) {
        const v = up.headers.get(k);
        if (v) out.set(k, v);
      }
      // net.fetch gövdeyi zaten açar; sıkıştırma/uzunluk başlıklarını taşıma
      if (!up.headers.get('content-encoding') && up.headers.get('content-length')) out.set('content-length', up.headers.get('content-length'));
      out.set('access-control-allow-origin', '*');
      return new Response(up.body, { status: up.status, headers: out });
    } catch (err) {
      return new Response(String(err && err.message ? err.message : err), { status: 502 });
    }
  });
}

module.exports = { SCHEME, mapRemote, toProxyUrl, registerScheme, handleMedia, isPrivateHost };
