'use strict';
/** Kanal tarayıcıdaki liste filtresi (arayüz ve test tarafından ortak). */
(function (root) {
  /**
   * @param {object[]} items  {createdAt, duration (sn), views}
   * @param {{days?:number, minDur?:number, maxDur?:number, minViews?:number, top?:number}} f  0/undefined = kapalı
   * @param {number} [now]
   */
  function filterItems(items, f, now = Date.now()) {
    const o = f || {};
    const list = items.filter((it) => {
      if (o.days > 0) {
        const t = it.createdAt ? Date.parse(it.createdAt) : NaN;
        if (!Number.isFinite(t) || now - t > o.days * 86400000) return false;
      }
      if (o.minDur > 0 && !(Number(it.duration) >= o.minDur)) return false;
      if (o.maxDur > 0 && !(Number(it.duration) > 0 && Number(it.duration) <= o.maxDur)) return false;
      if (o.minViews > 0 && !(Number(it.views) >= o.minViews)) return false;
      return true;
    });
    // En çok izlenen N klip (izlenmeye göre azalan)
    if (o.top > 0) return list.slice().sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0)).slice(0, o.top);
    return list;
  }
  function isActive(f) {
    return !!f && (f.days > 0 || f.minDur > 0 || f.maxDur > 0 || f.minViews > 0 || f.top > 0);
  }
  const api = { filterItems, isActive };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VoidItemFilter = api;
})(typeof window !== 'undefined' ? window : globalThis);
