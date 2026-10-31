'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseInput, normalizeClip, normalizeVod, createClient } = require('../src/main/kick');
const { sanitizeName, uniquePath, dateStamp } = require('../src/main/util');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('parseInput: klip biçimleri', () => {
  assert.deepEqual(parseInput('clip_01ABCxyz'), { type: 'clip', id: 'clip_01ABCxyz' });
  assert.deepEqual(parseInput('https://kick.com/hawking/clips/clip_01ABC'), {
    type: 'clip',
    id: 'clip_01ABC',
    slug: 'hawking',
  });
  assert.deepEqual(parseInput('https://kick.com/hawking?clip=clip_99'), {
    type: 'clip',
    id: 'clip_99',
    slug: 'hawking',
  });
});

test('parseInput: VOD, kanal, geçersiz', () => {
  const uuid = '1b2c3d4e-1111-2222-3333-444455556666';
  assert.deepEqual(parseInput(`https://kick.com/video/${uuid}`), { type: 'vod', uuid });
  assert.deepEqual(parseInput(`kick.com/hawking/videos/${uuid.toUpperCase()}`), {
    type: 'vod',
    uuid,
    slug: 'hawking',
  });
  // doğrudan m3u8 bağlantıları artık desteklenmiyor
  assert.equal(parseInput('https://stream.kick.com/a/b/master.m3u8?x=1'), null);
  assert.deepEqual(parseInput('https://kick.com/Hawking'), { type: 'channel', slug: 'hawking' });
  assert.equal(parseInput(''), null);
  assert.equal(parseInput('https://example.com/video/abc'), null);
  assert.equal(parseInput('https://kick.com/categories/just-chatting'), null);
});

test('normalizeClip: iç içe yanıtı tek biçime getirir', () => {
  const c = normalizeClip({
    clip: {
      id: 'clip_1',
      title: 'Harika an',
      clip_url: 'https://cdn/x/playlist.m3u8',
      thumbnail_url: 'https://cdn/t.jpg',
      created_at: '2026-10-01T12:00:00Z',
      duration: 30,
      view_count: 1234,
      channel: { slug: 'hawking' },
      creator: { username: 'biri' },
    },
  });
  assert.equal(c.kind, 'clip');
  assert.equal(c.id, 'clip_1');
  assert.equal(c.url, 'https://cdn/x/playlist.m3u8');
  assert.equal(c.channel, 'hawking');
  assert.equal(c.views, 1234);
  assert.equal(c.createdAt, '2026-10-01T12:00:00.000Z');
});

test('normalizeVod: liste ve tekil yanıt, ms süre saniyeye çevrilir', () => {
  const v = normalizeVod({
    source: 'https://cdn/master.m3u8',
    video: { uuid: 'ABC-UUID', views: 50 },
    livestream: {
      session_title: 'Akşam yayını',
      start_time: '2026-10-02 18:00:00',
      duration: 7200000,
      thumbnail: { src: 'https://cdn/th.jpg' },
      channel: { slug: 'hawking' },
    },
  });
  assert.equal(v.kind, 'vod');
  assert.equal(v.id, 'abc-uuid');
  assert.equal(v.title, 'Akşam yayını');
  assert.equal(v.duration, 7200);
  assert.equal(v.thumbnail, 'https://cdn/th.jpg');
  assert.equal(v.channel, 'hawking');
});

test('createClient: doğru uçlara gider, sayfalama ve filtre parametreleri', async () => {
  const calls = [];
  const client = createClient(async (url) => {
    calls.push(url);
    if (url.includes('/clips?')) {
      return { clips: [{ id: 'clip_a', title: 'A', clip_url: 'u' }, { title: 'idsiz' }], nextCursor: 'CUR2' };
    }
    if (url.endsWith('/videos')) return [{ video: { uuid: 'u1' }, livestream: { session_title: 'V' }, source: 's' }];
    return {};
  });

  const page = await client.listClips('hawking', { filter: 'month', cursor: 'CUR1' });
  assert.equal(page.items.length, 1); // id'siz atılır
  assert.equal(page.nextCursor, 'CUR2');
  assert.match(calls[0], /sort=view/);
  assert.match(calls[0], /time=month/);
  assert.match(calls[0], /cursor=CUR1/);

  await client.listClips('hawking', { filter: 'all' });
  assert.match(calls[1], /sort=date/);

  const vods = await client.listVods('hawking');
  assert.equal(vods.items[0].channel, 'hawking');
  assert.equal(vods.items[0].url, 's');
});

test('sanitizeName / uniquePath / dateStamp', () => {
  assert.equal(sanitizeName('a<b>:c/d\\e|f?g*'), 'a b c d e f g');
  assert.equal(sanitizeName('   '), 'video');
  assert.equal(sanitizeName('CON'), '_CON');
  assert.equal(sanitizeName('x'.repeat(400)).length, 150);
  assert.equal(dateStamp('2026-10-31T12:00:00Z').length, 10);
  assert.equal(dateStamp(''), '');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-'));
  const first = uniquePath(dir, 'klip', '.mp4');
  fs.writeFileSync(first, 'x');
  const second = uniquePath(dir, 'klip', '.mp4');
  fs.writeFileSync(second, 'x');
  assert.equal(path.basename(second), 'klip (1).mp4');
  assert.equal(path.basename(uniquePath(dir, 'klip', '.mp4')), 'klip (2).mp4');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('VOD küçük resmi: nesne ({src}), düz metin ve video.thumb biçimleri', () => {
  const { normalizeVod } = require('../src/main/kick');
  const base = { video: { uuid: 'ABC' }, session_title: 'Yayın', start_time: '2026-10-01T10:00:00Z', duration: 3600000, views: 5 };
  assert.equal(normalizeVod({ ...base, thumbnail: { src: 'https://x/a.jpg', srcset: '' } }).thumbnail, 'https://x/a.jpg');
  assert.equal(normalizeVod({ ...base, livestream: { thumbnail: 'https://x/b.jpg' } }).thumbnail, 'https://x/b.jpg');
  assert.equal(normalizeVod({ ...base, video: { uuid: 'ABC', thumb: { url: 'https://x/c.jpg' } } }).thumbnail, 'https://x/c.jpg');
  const n = normalizeVod(base);
  assert.equal(n.thumbnail, '');
  assert.equal(n.title, 'Yayın');
  assert.equal(n.duration, 3600);
});
