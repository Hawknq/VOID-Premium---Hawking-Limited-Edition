'use strict';

const BASE = 'https://kick.com';

/**
 * Kullanıcının yapıştırdığı metni çözümler.
 * -> { type: 'clip'|'vod'|'channel', ... } veya null
 */
function parseInput(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  if (/^clip_[A-Za-z0-9]+$/i.test(text)) return { type: 'clip', id: text };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
    return { type: 'vod', uuid: text.toLowerCase() };
  }

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return /^[A-Za-z0-9_-]{2,30}$/.test(text) ? { type: 'channel', slug: text.toLowerCase() } : null;
  }

  const host = url.hostname.replace(/^www\./, '');
  if (host !== 'kick.com') return null;
  const parts = url.pathname.split('/').filter(Boolean);

  // kick.com/video/<uuid>
  if (parts[0] === 'video' && parts[1]) return { type: 'vod', uuid: parts[1].toLowerCase() };
  // kick.com/<slug>/videos/<uuid>
  if (parts[1] === 'videos' && parts[2]) return { type: 'vod', uuid: parts[2].toLowerCase(), slug: parts[0] };
  // kick.com/<slug>/clips/clip_xxx
  if (parts[1] === 'clips' && parts[2]) return { type: 'clip', id: parts[2], slug: parts[0] };
  // kick.com/<slug>?clip=clip_xxx
  const clipParam = url.searchParams.get('clip');
  if (clipParam) return { type: 'clip', id: clipParam, slug: parts[0] };
  // kick.com/<slug>
  if (parts.length >= 1 && !['categories', 'browse', 'search', 'dashboard'].includes(parts[0])) {
    return { type: 'channel', slug: parts[0].toLowerCase() };
  }
  return null;
}

function toIso(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/** Klip adresi: birden çok kalite sunan HLS (m3u8) varsa onu, yoksa doğrudan mp4'ü seçer. */
function pickClipUrl(c) {
  const list = [c.clip_url, c.video_url, c.url, c.playlist_url, c.hls_url].filter((u) => typeof u === 'string' && u);
  return list.find((u) => /\.m3u8(\?|$)/i.test(u)) || list[0] || '';
}

/** Kick klip nesnesini tek biçime getirir. */
function normalizeClip(raw) {
  const c = (raw && raw.clip) || raw || {};
  const channel = c.channel || {};
  const creator = c.creator || {};
  return {
    kind: 'clip',
    id: String(c.id || c.clip_id || ''),
    title: c.title || 'Klip',
    thumbnail: c.thumbnail_url || c.thumbnail || '',
    url: pickClipUrl(c),
    createdAt: toIso(c.created_at || c.started_at),
    duration: Number(c.duration) || 0,
    views: Number(c.view_count ?? c.views) || 0,
    channel: channel.slug || channel.username || c.channel_slug || '',
    creator: creator.username || creator.slug || '',
  };
}

/** Kick VOD nesnesini tek biçime getirir (liste ve tekil yanıt ikisini de kapsar). */
function normalizeVod(raw) {
  const v = raw || {};
  const live = v.livestream || {};
  const video = v.video || {};
  const uuid = String(video.uuid || v.uuid || v.id || '').toLowerCase();
  // Küçük resim: Kick liste yanıtında {src, srcset} nesnesi, bazen düz metin (livestream.thumbnail / video.thumb)
  const pickImg = (x) => (typeof x === 'string' ? x : x && (x.src || x.url || x.thumb || '')) || '';
  const thumb = [live.thumbnail, v.thumbnail, video.thumb, v.thumb, video.thumbnail].map(pickImg).find((x) => /^https?:\/\//i.test(x)) || '';
  let duration = Number(live.duration ?? v.duration) || 0;
  if (duration > 100000) duration = Math.round(duration / 1000); // ms -> sn
  const channel =
    (live.channel && (live.channel.slug || live.channel.username)) ||
    (v.channel && (v.channel.slug || v.channel.username)) ||
    '';
  return {
    kind: 'vod',
    id: uuid,
    title: live.session_title || v.session_title || v.title || 'Yayın kaydı',
    thumbnail: thumb,
    url: v.source || '',
    createdAt: toIso(live.start_time || v.start_time || live.created_at || v.created_at),
    duration,
    views: Number(video.views ?? v.views) || 0,
    channel,
  };
}

/**
 * Kick API istemcisi. `getJson(url)` dışarıdan verilir (uygulamada gizli Chromium
 * penceresi üzerinden, testlerde sahte fonksiyon).
 */
function createClient(getJson) {
  return {
    async getChannel(slug) {
      const j = await getJson(`${BASE}/api/v2/channels/${encodeURIComponent(slug)}`);
      return {
        slug: j.slug || slug,
        username: (j.user && j.user.username) || j.slug || slug,
        avatar: (j.user && (j.user.profile_pic || j.user.profilepic)) || '',
        followers: j.followers_count || j.followersCount || 0,
        live: !!j.livestream,
      };
    },

    async getClip(id) {
      return normalizeClip(await getJson(`${BASE}/api/v2/clips/${encodeURIComponent(id)}`));
    },

    /** filter: 'featured' | 'month' | 'all' */
    async listClips(slug, { filter = 'all', cursor = '' } = {}) {
      const q = new URLSearchParams();
      if (filter === 'featured') {
        q.set('sort', 'view');
        q.set('time', 'all');
      } else if (filter === 'month') {
        q.set('sort', 'view');
        q.set('time', 'month');
      } else {
        q.set('sort', 'date');
        q.set('time', 'all');
      }
      if (cursor) q.set('cursor', cursor);
      const j = await getJson(`${BASE}/api/v2/channels/${encodeURIComponent(slug)}/clips?${q}`);
      const list = j.clips || j.data || [];
      return {
        items: list.map(normalizeClip).filter((c) => c.id),
        nextCursor: j.nextCursor || j.next_cursor || '',
      };
    },

    async listVods(slug) {
      let j = await getJson(`${BASE}/api/v2/channels/${encodeURIComponent(slug)}/videos`);
      if (j && !Array.isArray(j)) j = j.data || j.videos || [];
      const items = (Array.isArray(j) ? j : []).map((x) => {
        const n = normalizeVod(x);
        if (!n.channel) n.channel = slug;
        return n;
      });
      return { items: items.filter((v) => v.id), nextCursor: '' };
    },

    async getVod(uuid) {
      const j = await getJson(`${BASE}/api/v1/video/${encodeURIComponent(uuid)}`);
      const n = normalizeVod(j);
      if (!n.id) n.id = uuid;
      return n;
    },
  };
}

module.exports = { pickClipUrl, parseInput, normalizeClip, normalizeVod, createClient };
