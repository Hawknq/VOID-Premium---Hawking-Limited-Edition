'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { filterItems, isActive } = require('../src/shared/itemfilter');

const now = Date.parse('2026-10-31T12:00:00Z');
const items = [
  { id: 'a', createdAt: '2026-10-30T12:00:00Z', duration: 20, views: 5 },
  { id: 'b', createdAt: '2026-10-01T12:00:00Z', duration: 90, views: 500 },
  { id: 'c', createdAt: '2026-06-01T12:00:00Z', duration: 600, views: 5000 },
  { id: 'd', createdAt: null, duration: null, views: null },
];
const ids = (f) => filterItems(items, f, now).map((i) => i.id).join('');

test('filtre kapalıyken hepsi gelir', () => {
  assert.equal(ids({}), 'abcd');
  assert.equal(isActive({ days: 0 }), false);
});
test('tarih, süre ve izlenme filtreleri', () => {
  assert.equal(ids({ days: 7 }), 'a');
  assert.equal(ids({ days: 90 }), 'ab');
  assert.equal(ids({ minDur: 60 }), 'bc');
  assert.equal(ids({ maxDur: 30 }), 'a');
  assert.equal(ids({ minViews: 100 }), 'bc');
  assert.equal(ids({ days: 90, minDur: 60, minViews: 100 }), 'b');
  assert.equal(isActive({ minViews: 10 }), true);
});
