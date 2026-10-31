'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const hls = require('../src/main/hls');

const MASTER = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720,FRAME-RATE=30.000
720p30/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080,FRAME-RATE=60.000
1080p60/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=640x360,FRAME-RATE=30.000
360p30/playlist.m3u8
`;

test('master playlist: kaliteler yüksekten düşüğe sıralanır ve URL mutlaklaşır', () => {
  assert.ok(hls.isMaster(MASTER));
  const v = hls.parseMaster(MASTER, 'https://cdn.example.com/vod/master.m3u8');
  assert.equal(v.length, 3);
  assert.equal(v[0].height, 1080);
  assert.equal(v[0].fps, 60);
  assert.equal(v[0].url, 'https://cdn.example.com/vod/1080p60/playlist.m3u8');
  assert.match(v[0].label, /1080p60 \(Source\)/);
  assert.equal(v[2].height, 360);
});

test('pickVariant: source en yükseği, sayı en yakın alt kaliteyi seçer', () => {
  const v = hls.parseMaster(MASTER, 'https://x/y.m3u8');
  assert.equal(hls.pickVariant(v, 'source').height, 1080);
  assert.equal(hls.pickVariant(v, '720').height, 720);
  assert.equal(hls.pickVariant(v, '480').height, 360);
  assert.equal(hls.pickVariant(v, '144').height, 360);
  assert.equal(hls.pickVariant([], 'source'), null);
});

test('media playlist: süre ve canlı durumu', () => {
  const media = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
a.ts
#EXTINF:10.5,
b.ts
#EXTINF:4.25,
c.ts
#EXT-X-ENDLIST`;
  assert.ok(!hls.isMaster(media));
  const m = hls.parseMedia(media);
  assert.equal(m.segments, 3);
  assert.equal(m.duration, 24.75);
  assert.equal(m.live, false);
  assert.equal(hls.parseMedia(media.replace('#EXT-X-ENDLIST', '')).live, true);
});
