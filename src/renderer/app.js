'use strict';

/* ---------- yardımcılar ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

async function rpc(promise) {
  const res = await promise;
  if (!res.ok) throw new Error(res.error || 'Bilinmeyen hata');
  return res.data;
}

let toastTimer = null;
function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show${isError ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), isError ? 5000 : 2600);
}

const pad = (n) => String(n).padStart(2, '0');
function fmtDuration(sec) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}
function fmtSpeed(bps) {
  if (!bps) return '';
  if (bps > 1048576) return `${(bps / 1048576).toFixed(1)} MB/s`;
  return `${Math.max(1, Math.round(bps / 1024))} KB/s`;
}
function fmtViews(n) {
  if (!n) return '';
  if (n < 1000) return `${n} izlenme`;
  return `${(n / 1000).toLocaleString('tr-TR', { maximumFractionDigits: n >= 10000 ? 0 : 1 })} B izlenme`;
}

function fmtBytes(n) {
  n = Number(n) || 0;
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(2)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(n >= 104857600 ? 0 : 1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

function entryFrom(item, quality, extra = {}) {
  return {
    ...extra,
    kind: item.kind,
    id: item.id,
    title: item.title,
    channel: item.channel,
    createdAt: item.createdAt,
    thumbnail: item.thumbnail,
    url: item.url,
    duration: item.duration || 0,
    quality: quality || 'source',
  };
}

function thumbEl(src, cls) {
  if (!src) return el('div', { class: cls || 'thumb-ph' });
  return el('img', { class: cls || '', src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
}

/* ---------- sekmeler ---------- */
function switchTab(name) {
  $$('.tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === name);
    b.setAttribute('aria-selected', String(b.dataset.tab === name));
  });
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  if (name === 'history') loadHistory();
}
$$('.tab').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
$$('[data-goto]').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.goto)));
$('#win-min').addEventListener('click', () => window.api.winMinimize());
$('#win-max').addEventListener('click', () => window.api.winToggleMax());
$('#win-close').addEventListener('click', () => window.api.winClose());

/* ---------- bağlantı türü çipleri ---------- */
const SRC_INFO = {
  clip: { ph: 'https://kick.com/yayinci/clips/clip_xxxxx', hint: "Kick klip URL'sini veya klip ID'sini yapıştırın." },
  vod: { ph: 'https://kick.com/video/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'Kick VOD (yayın kaydı) bağlantısını yapıştırın.' },
};
function setSrc(type) {
  const info = SRC_INFO[type] || SRC_INFO.clip;
  $$('.srcchip').forEach((c) => c.classList.toggle('active', c.dataset.src === type));
  $('#link-input').placeholder = info.ph;
  $('#link-hint').textContent = info.hint;
}
$$('.srcchip').forEach((c) =>
  c.addEventListener('click', () => {
    setSrc(c.dataset.src);
    $('#link-input').focus();
  })
);

/* ---------- yazı / arayüz boyutu ---------- */
let uiScale = 1;
function applyScale(f, save = true) {
  uiScale = Math.min(1.6, Math.max(0.8, Math.round(f * 100) / 100));
  window.api.setZoom(uiScale);
  $('#set-uiScale').value = Math.round(uiScale * 100);
  $('#scale-val').textContent = `${Math.round(uiScale * 100)}%`;
  if (save) window.api.setSettings({ uiScale });
}
$('#set-uiScale').addEventListener('input', (e) => applyScale(Number(e.target.value) / 100));
$('#scale-minus').addEventListener('click', () => applyScale(uiScale - 0.05));
$('#scale-plus').addEventListener('click', () => applyScale(uiScale + 0.05));
$('#scale-reset').addEventListener('click', () => applyScale(1));
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  if (e.key === '+' || e.key === '=') applyScale(uiScale + 0.05);
  else if (e.key === '-' || e.key === '_') applyScale(uiScale - 0.05);
  else if (e.key === '0') applyScale(1);
  else return;
  e.preventDefault();
});

/* ---------- ayarlar ---------- */
let appSettings = { defaultQuality: 'source', defaultOutput: 'original', dir: '' };

let concurrency = 2;
function showConcurrency(n) {
  concurrency = n;
  $('#set-conc-val').textContent = n;
  $$('.concrow button').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === n));
}

function showDir(dir) {
  appSettings.dir = dir || '';
  $('#dir-label').textContent = dir || 'Klasör seç';
  $('#dir-btn').title = dir ? `${dir}\nTıkla: değiştir · Sağ tık: klasörü aç` : 'İndirme klasörü';
  $('#set-dir-label').textContent = dir || 'Seçilmedi (ilk indirmede sorulur)';
}

async function initSettings() {
  const s = await rpc(window.api.getSettings());
  appSettings = { ...appSettings, ...s };
  showConcurrency(s.concurrency);
  showDir(s.dir);
  if (s.version) {
    $('#version').textContent = `v${s.version}`;
    $('#about-version').textContent = `v${s.version}`;
  }
  for (const k of ['background', 'autoStart', 'startHidden', 'notify', 'clipboardWatch']) $(`#set-${k}`).checked = !!s[k];
  for (const k of ['priority', 'defaultQuality']) $(`#set-${k}`).value = s[k];
  $('#set-speedLimit').value = s.speedLimit || 0;
  applyScale(s.uiScale || 1, false);
  if (!s.packaged) {
    $('#set-autoStart').disabled = true;
    $('#autostart-hint').textContent = 'Yalnızca kurulu/paketlenmiş uygulamada çalışır.';
  }
  $('#set-startHidden').disabled = !s.background;
}

function bumpConcurrency(delta) {
  setConcurrency(Math.min(8, Math.max(1, concurrency + delta)));
}
function setConcurrency(next) {
  showConcurrency(next);
  window.api.setSettings({ concurrency: next });
}
$$('.concrow button').forEach((b) => b.addEventListener('click', () => setConcurrency(Number(b.dataset.n))));
$('#set-conc-minus').addEventListener('click', () => bumpConcurrency(-1));
$('#set-conc-plus').addEventListener('click', () => bumpConcurrency(1));

async function chooseDir() {
  try {
    showDir(await rpc(window.api.chooseDir()));
  } catch (err) {
    toast(err.message, true);
  }
}
$('#dir-btn').addEventListener('click', chooseDir);
$('#set-dir-choose').addEventListener('click', chooseDir);
$('#set-dir-open').addEventListener('click', () => window.api.openDir());
$('#dir-btn').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.api.openDir();
});

// Ayarlar sekmesindeki anahtarlar ve seçimler anında kaydedilir
for (const k of ['background', 'autoStart', 'startHidden', 'notify', 'clipboardWatch']) {
  $(`#set-${k}`).addEventListener('change', async (e) => {
    try {
      await rpc(window.api.setSettings({ [k]: e.target.checked }));
      appSettings[k] = e.target.checked;
      if (k === 'background') $('#set-startHidden').disabled = !e.target.checked;
    } catch (err) {
      e.target.checked = !e.target.checked;
      toast(err.message, true);
    }
  });
}
for (const k of ['priority', 'defaultQuality']) {
  $(`#set-${k}`).addEventListener('change', async (e) => {
    appSettings[k] = e.target.value;
    try {
      await rpc(window.api.setSettings({ [k]: e.target.value }));
    } catch (err) {
      toast(err.message, true);
    }
  });
}
$('#set-speedLimit').addEventListener('change', async (e) => {
  const v = Math.min(1000, Math.max(0, Number(e.target.value) || 0));
  e.target.value = v;
  try {
    await rpc(window.api.setSettings({ speedLimit: v }));
  } catch (err) {
    toast(err.message, true);
  }
});
$('#set-history-clear').addEventListener('click', () => {
  if (confirm('Tüm indirme geçmişi silinsin mi? (İndirilen dosyalar silinmez.)')) window.api.historyClear();
});

/* ---------- LİNK sekmesi ---------- */
$('#link-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const value = $('#link-input').value.trim();
  if (!value) return;
  const btn = $('#link-go');
  btn.disabled = true;
  $('#link-go-label').textContent = 'Analiz ediliyor…';
  try {
    const res = await rpc(window.api.analyze(value));
    if (res.type === 'channel') {
      switchTab('channel');
      $('#channel-input').value = res.slug;
      openChannel(res.slug);
      return;
    }
    renderLinkResult(res);
  } catch (err) {
    $('#link-result').replaceChildren();
    $('#link-empty').hidden = false;
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    $('#link-go-label').textContent = 'Analiz Et';
  }
});

function renderLinkResult(res) {
  const { item } = res;
  setSrc(res.type === 'vod' ? 'vod' : 'clip');
  $('#link-empty').hidden = true;

  const metaParts = [
    item.channel,
    fmtDate(item.createdAt),
    item.duration ? fmtDuration(item.duration) : '',
    fmtViews(item.views),
  ].filter(Boolean);

  const nameInput = el('input', { type: 'text', id: 'file-name', spellcheck: 'false', 'aria-label': 'Dosya adı' });
  nameInput.value = item.suggestedName || '';

  const addBtn = el('button', {
    class: 'primary',
    text: 'İndir',
    onclick: () => {
      const typed = nameInput.value.trim();
      // Ad değiştirilmediyse boş gönderilir: otomatik ad (4K'da [4K60] eki) kullanılır
      openDrawer([entryFrom(item, 'source', { fileName: typed && typed !== item.suggestedName ? typed : '' })], {
        title: item.title,
      });
    },
  });

  const kindLabel = res.type === 'vod' ? 'VOD' : 'KLİP';
  $('#link-result').replaceChildren(
    el('div', { class: 'result' }, [
      thumbEl(item.thumbnail),
      el('div', { class: 'result-info' }, [
        el('div', { class: 'meta', text: kindLabel }),
        el('div', { class: 'result-title', text: item.title }),
        el('div', { class: 'meta', text: metaParts.join(' · ') }),
        el('label', { class: 'field' }, [el('span', { text: 'Dosya adı (.mp4 otomatik eklenir)' }), nameInput]),
        el('div', { class: 'result-actions' }, [addBtn, el('button', { class: 'ghost', type: 'button', text: 'İzle', onclick: () => openPlayer(item) })]),
      ]),
    ])
  );
}

/* ---------- KANAL sekmesi ---------- */
const ch = {
  slug: '',
  info: null,
  sub: 'clips',
  filter: 'featured',
  items: [],
  cursor: '',
  selected: new Map(),
  sortForced: false,
  sortMode: 'dateDesc',
  fl: { days: 0, minDur: 0, maxDur: 0, minViews: 0 },
  loading: false,
  error: '',
  token: 0,
};

$('#channel-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const slug = $('#channel-input').value.trim().replace(/^https?:\/\/(www\.)?kick\.com\//i, '').split(/[/?#]/)[0];
  if (slug) openChannel(slug);
});

async function openChannel(slug) {
  const token = ++ch.token;
  ch.slug = slug.toLowerCase();
  ch.items = [];
  ch.cursor = '';
  ch.selected.clear();
  ch.error = '';
  $('#channel-body').hidden = true;
  const goBtn = $('#channel-form button');
  goBtn.disabled = true;
  goBtn.textContent = 'Açılıyor…';
  try {
    ch.info = await rpc(window.api.openChannel(ch.slug));
    if (token !== ch.token) return;
    $('#ch-avatar').src = ch.info.avatar || '';
    $('#ch-avatar').style.visibility = ch.info.avatar ? 'visible' : 'hidden';
    $('#ch-name').textContent = ch.info.username;
    const meta = $('#ch-meta');
    meta.replaceChildren();
    if (ch.info.live) meta.append(el('span', { class: 'live-dot' }), 'Canlı · ');
    meta.append(`${(ch.info.followers || 0).toLocaleString('tr-TR')} takipçi`);
    $('#channel-body').hidden = false;
    await loadItems(true);
  } catch (err) {
    toast(err.message, true);
  } finally {
    goBtn.disabled = false;
    goBtn.textContent = 'Kanalı Aç';
  }
}

async function loadItems(reset) {
  if (ch.loading) return;
  if (reset) {
    ch.items = [];
    ch.cursor = '';
    ch.selected.clear();
  }
  const token = ch.token;
  ch.loading = true;
  ch.error = '';
  renderGrid();
  try {
    const res =
      ch.sub === 'clips'
        ? await rpc(window.api.channelClips(ch.slug, { filter: ch.filter, cursor: ch.cursor }))
        : await rpc(window.api.channelVods(ch.slug));
    if (token !== ch.token) return;
    const seen = new Set(ch.items.map((i) => i.id));
    for (const it of res.items) if (!seen.has(it.id)) ch.items.push(it);
    ch.cursor = res.nextCursor || '';
  } catch (err) {
    ch.error = err.message;
  } finally {
    ch.loading = false;
    renderGrid();
  }
}

/** Tarih butonuna basılmadıkça Kick'in verdiği sıra (öne çıkan / yeni) korunur. */
function sortedItems() {
  const base = VoidItemFilter.filterItems(ch.items, ch.fl);
  if (!ch.sortForced) return base;
  const arr = base.slice();
  arr.sort((a, b) => {
    if (ch.sortMode === 'views') return (b.views || 0) - (a.views || 0);
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return ch.sortMode === 'dateAsc' ? ta - tb : tb - ta;
  });
  return arr;
}

function updateToolbar() {
  const n = ch.selected.size;
  const btn = $('#dl-selected');
  btn.textContent = `İndir (${n})`;
  btn.disabled = n === 0;
  const vis = sortedItems();
  const allSelected = vis.length > 0 && vis.every((i) => ch.selected.has(i.id));
  $('#select-all').textContent = allSelected ? 'Seçimi kaldır' : 'Hepsini seç';
  $('#sort-btn').textContent = { dateDesc: 'Tarih ↓', dateAsc: 'Tarih ↑', views: 'İzlenme ↓' }[ch.sortMode];
  const fa = VoidItemFilter.isActive(ch.fl);
  $('#f-reset').hidden = !fa;
  $('#f-count').textContent = fa ? `${vis.length} / ${ch.items.length} gösteriliyor` : '';
  $('#clip-filters').hidden = ch.sub !== 'clips';
  $('#dl-all').hidden = ch.sub !== 'clips';
}

function renderGrid() {
  const grid = $('#grid');
  const items = sortedItems();
  grid.replaceChildren(
    ...items.map((it) => {
      const selected = ch.selected.has(it.id);
      const card = el(
        'div',
        {
          class: `card${selected ? ' selected' : ''}`,
          tabindex: '0',
          role: 'checkbox',
          'aria-checked': String(selected),
          'aria-label': it.title,
          'data-id': it.id,
          onkeydown: (e) => {
            if (e.target !== card) return;
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              card.click();
            }
          },
          onclick: () => {
            if (ch.selected.has(it.id)) ch.selected.delete(it.id);
            else ch.selected.set(it.id, it);
            card.classList.toggle('selected', ch.selected.has(it.id));
            card.setAttribute('aria-checked', String(ch.selected.has(it.id)));
            updateToolbar();
          },
        },
        [
          thumbEl(it.thumbnail, 'thumb'),
          el('div', { class: 'tick', text: '✓' }),
          el('button', {
            class: 'watch',
            type: 'button',
            'aria-label': `İzle: ${it.title}`,
            onclick: (e) => {
              e.stopPropagation();
              openPlayer(it);
            },
          }, [icon('play'), 'İzle']),
          it.duration ? el('div', { class: 'dur', text: fmtDuration(it.duration) }) : null,
          el('div', { class: 'body' }, [
            el('div', { class: 'title', text: it.title }),
            el('div', { class: 'meta' }, [
              el('span', {
                text: ch.sub === 'vods' ? [fmtDate(it.createdAt), fmtTime(it.createdAt)].filter(Boolean).join(' · ') : fmtDate(it.createdAt),
              }),
              el('span', { text: fmtViews(it.views) }),
            ]),
          ]),
        ]
      );
      return card;
    })
  );

  const status = $('#grid-status');
  status.className = 'grid-status';
  if (ch.loading) status.textContent = 'Yükleniyor…';
  else if (ch.error) {
    status.className = 'grid-status error';
    status.textContent = ch.error;
  } else if (!ch.items.length) status.textContent = ch.sub === 'clips' ? 'Bu filtrede klip bulunamadı.' : 'VOD bulunamadı.';
  else if (!items.length) status.textContent = 'Filtreye uyan öğe yok' + (ch.cursor ? ' (daha fazla yükleyebilirsin).' : '.');
  else status.textContent = `${items.length} öğe`;

  $('#more-btn').hidden = !(ch.cursor && ch.sub === 'clips' && !ch.loading);
  updateToolbar();
  fillThumbs(items);
}

$$('.subtab').forEach((b) =>
  b.addEventListener('click', () => {
    if (ch.sub === b.dataset.sub) return;
    ch.sub = b.dataset.sub;
    $$('.subtab').forEach((x) => x.classList.toggle('active', x === b));
    loadItems(true);
  })
);
$$('.chip').forEach((b) =>
  b.addEventListener('click', () => {
    if (ch.filter === b.dataset.filter) return;
    ch.filter = b.dataset.filter;
    $$('.chip').forEach((x) => x.classList.toggle('active', x === b));
    loadItems(true);
  })
);
$('#sort-btn').addEventListener('click', () => {
  const order = ['dateDesc', 'dateAsc', 'views'];
  ch.sortMode = ch.sortForced ? order[(order.indexOf(ch.sortMode) + 1) % order.length] : 'dateDesc';
  ch.sortForced = true;
  renderGrid();
});
function readFilters() {
  const dur = Number($('#f-dur').value);
  ch.fl = {
    days: Number($('#f-days').value),
    minDur: dur > 0 ? dur : 0,
    maxDur: dur < 0 ? -dur : 0,
    minViews: Number($('#f-views').value),
    top: Number($('#f-top').value),
  };
  renderGrid();
}
for (const id of ['f-days', 'f-dur', 'f-views', 'f-top']) $(`#${id}`).addEventListener('change', readFilters);
$('#f-reset').addEventListener('click', () => {
  $('#f-days').value = '0';
  $('#f-dur').value = '0';
  $('#f-views').value = '0';
  $('#f-top').value = '0';
  readFilters();
});
$('#dl-all').addEventListener('click', async () => {
  const btn = $('#dl-all');
  if (btn.disabled) return;
  btn.disabled = true;
  const label = btn.textContent;
  const all = new Map();
  try {
    let cursor = '';
    for (let page = 0; page < 100 && all.size < 1000; page += 1) {
      const res = await rpc(window.api.channelClips(ch.slug, { filter: 'all', cursor }));
      for (const it of res.items) all.set(it.id, it);
      btn.textContent = `Yükleniyor… ${all.size}`;
      cursor = res.nextCursor || '';
      if (!cursor) break;
    }
    if (!all.size) return toast('Bu kanalda klip bulunamadı.', true);
    const list = VoidItemFilter.filterItems(Array.from(all.values()), ch.fl);
    if (!list.length) return toast('Seçili filtreye uyan klip yok.', true);
    openDrawer(list.map((i) => entryFrom(i, 'source')), {
      title: `${ch.slug} · ${VoidItemFilter.isActive(ch.fl) ? 'filtrelenmiş klipler' : 'tüm klipler'} (${list.length})`,
      sample: true,
    });
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

$('#select-all').addEventListener('click', () => {
  const vis = sortedItems();
  const allSelected = vis.length > 0 && vis.every((i) => ch.selected.has(i.id));
  if (allSelected) vis.forEach((i) => ch.selected.delete(i.id));
  else vis.forEach((i) => ch.selected.set(i.id, i));
  renderGrid();
});
$('#more-btn').addEventListener('click', () => loadItems(false));
$('#dl-selected').addEventListener('click', () => {
  const entries = Array.from(ch.selected.values()).map((i) => entryFrom(i, 'source'));
  if (!entries.length) return;
  openDrawer(entries, {
    title: entries.length === 1 ? entries[0].title : `${entries.length} öğe`,
    onAdded: () => {
      ch.selected.clear();
      renderGrid();
    },
  });
});

/* ---------- KUYRUK ---------- */
const STATUS_LABEL = {
  queued: 'Sırada',
  paused: 'Duraklatıldı',
  done: 'Tamamlandı',
  error: 'Hata',
  canceled: 'İptal edildi',
};

const SVG_NS = 'http://www.w3.org/2000/svg';
function icon(name, cls = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `ic ${cls}`.trim());
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

function qbtn(iconName, title, handler, cls = '') {
  const b = el('button', { title, 'aria-label': title, class: cls, onclick: handler });
  b.appendChild(icon(iconName));
  return b;
}

let queueEditing = false;
let lastQueueItems = [];

/** Kuyruktaki bir öğenin adını yerinde düzenletir (yalnızca sırada/duraklatılmış). */
function startRename(it, titleEl) {
  queueEditing = true;
  const input = el('input', { type: 'text', class: 'qrename', spellcheck: 'false', 'aria-label': 'Dosya adı' });
  input.value = it.fileName || it.suggestedName || it.title;
  const finish = async (save) => {
    if (!queueEditing) return;
    queueEditing = false;
    if (save && input.value.trim()) {
      try {
        await rpc(window.api.queueRename(it.id, input.value.trim()));
      } catch (err) {
        toast(err.message, true);
      }
    }
    renderQueue(lastQueueItems);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
  titleEl.replaceChildren(input);
  input.focus();
  input.select();
}

function renderQueue(items) {
  lastQueueItems = items;
  if (queueEditing) return; // yazarken liste yeniden çizilip imleç kaybolmasın
  const running = items.filter((i) => i.status === 'running').length;
  const active = items.filter((i) => ['queued', 'running', 'paused'].includes(i.status)).length;
  $('#queue-running').textContent = running;
  $('#queue-count').textContent = active;
  $('#queue-empty').hidden = items.length > 0;
  const list = $('#queue-list');

  // Yeni eklenenler üstte; çalışanlar her zaman en üstte
  const order = { running: 0, queued: 1, paused: 2, error: 3, canceled: 4, done: 5 };
  const sorted = items.slice().sort((a, b) => order[a.status] - order[b.status] || b.addedAt - a.addedAt);

  list.replaceChildren(
    ...sorted.map((it) => {
      const buttons = [];
      if (['queued', 'paused'].includes(it.status)) {
        buttons.push(qbtn('edit', 'Dosya adını düzenle', () => startRename(it, titleEl)));
      }
      if (it.status === 'queued') buttons.push(qbtn('pause', 'Duraklat', () => window.api.queuePause(it.id)));
      if (it.status === 'paused') buttons.push(qbtn('play', 'Devam et', () => window.api.queueResume(it.id)));
      if (['queued', 'paused', 'running'].includes(it.status)) buttons.push(qbtn('x', 'İptal', () => window.api.queueCancel(it.id), 'danger'));
      if (it.status === 'done') {
        buttons.push(qbtn('folder', 'Klasörde göster', () => window.api.showFile(it.filePath)));
        buttons.push(qbtn('trash', 'Listeden kaldır', () => window.api.queueRemove(it.id), 'danger'));
      }
      if (['error', 'canceled'].includes(it.status)) {
        buttons.push(qbtn('retry', 'Tekrar dene', () => window.api.queueRetry(it.id)));
        buttons.push(qbtn('trash', 'Listeden kaldır', () => window.api.queueRemove(it.id), 'danger'));
      }

      const titleEl = el('div', { class: 'qtitle' }, [
        outputTag(it.output) ? el('span', { class: 'tag', text: outputTag(it.output) }) : null,
        it.fileName || it.title,
      ]);
      const bar = el('div', { class: 'bar' }, [el('i')]);
      bar.firstChild.style.width = `${it.status === 'done' ? 100 : it.percent || 0}%`;

      const pct =
        it.status === 'running' || it.status === 'done'
          ? `${Math.round(it.status === 'done' ? 100 : it.percent || 0)}%`
          : STATUS_LABEL[it.status] || it.status;
      const pctEl = el('span', { class: `qpct${it.status === 'running' || it.status === 'done' ? '' : ' dim'}`, text: pct });

      const sub = `${it.kind === 'vod' ? 'VOD' : 'Klip'} · ${it.channel || it.sourceId || ''}`.replace(/ · $/, '');
      const sizeTxt = it.bytesTotal
        ? `${fmtBytes(it.bytesDone || 0)} / ${it.totalEstimated ? '~' : ''}${fmtBytes(it.bytesTotal)}`
        : it.bytesDone
          ? fmtBytes(it.bytesDone)
          : '';
      const running_ = it.status === 'running';
      const meta = el('div', { class: 'qmeta3' }, [
        el('span', {}, [running_ ? icon('download', 'sm') : null, running_ ? fmtSpeed(it.speed) : '']),
        el('span', { text: sizeTxt }),
        el('span', { text: running_ && it.eta ? fmtClockLong(it.eta) : '' }),
      ]);

      const thumb = it.thumbnail
        ? el('img', { class: 'qthumb', src: it.thumbnail, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy' })
        : el('div', { class: 'qthumb' }, [icon(it.kind === 'vod' ? 'play' : 'download')]);

      return el('div', { class: `qitem ${it.status}` }, [
        thumb,
        el('div', { class: 'qmain' }, [
          el('div', { class: 'qtop' }, [titleEl, el('div', { class: 'qbtns' }, buttons)]),
          el('div', { class: 'qsub', text: sub }),
          el('div', { class: 'qprog' }, [bar, pctEl]),
          meta,
          it.status === 'error' && it.error ? el('div', { class: 'qerr', text: it.error }) : null,
        ]),
      ]);
    })
  );
}

/** 00:12:45 biçimi (kuyruk kartında kalan süre) */
function fmtClockLong(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s2 = Math.floor(sec % 60);
  return [h, m, s2].map((n) => String(n).padStart(2, '0')).join(':');
}

$('#queue-clear').addEventListener('click', () => window.api.queueClear());

/* ---------- GEÇMİŞ ---------- */
let historyItems = [];

async function loadHistory() {
  try {
    historyItems = await rpc(window.api.historyList());
    renderHistory();
  } catch (err) {
    toast(err.message, true);
  }
}

function renderHistory() {
  const q = $('#history-filter').value.trim().toLowerCase();
  const list = historyItems.filter(
    (h) => !q || `${h.title} ${h.channel}`.toLowerCase().includes(q)
  );
  $('#history-count').textContent = historyItems.length;
  $('#history-empty').hidden = historyItems.length > 0;
  $('#history-list').replaceChildren(
    ...list.map((h) => {
      const ok = h.status === 'done';
      const meta = [
        h.channel,
        new Date(h.finishedAt).toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        ok && h.size ? fmtBytes(h.size) : '',
        outputTag(h.output),
      ].filter(Boolean);
      const metaEl = el('div', { class: 'hmeta', text: meta.join(' · ') });
      if (!ok) metaEl.append(el('div', { class: 'bad', text: `Başarısız: ${h.error || 'bilinmeyen hata'}` }));
      else if (!h.exists) metaEl.append(el('div', { class: 'bad', text: 'Dosya bulunamadı (taşınmış veya silinmiş olabilir).' }));

      return el('div', { class: 'hitem' }, [
        thumbEl(h.thumbnail, 'thumb-sm'),
        el('div', { class: 'hinfo' }, [el('div', { class: 'htitle', text: h.title }), metaEl]),
        el('div', { class: 'hbtns' }, [
          el('button', {
            text: '📁 Göster',
            disabled: !(ok && h.exists),
            onclick: () => window.api.showFile(h.filePath),
          }),
          el('button', {
            text: '↻ Tekrar indir',
            onclick: async () => {
              try {
                await rpc(window.api.historyRequeue(h.id));
                toast('Kuyruğa eklendi');
              } catch (err) {
                toast(err.message, true);
              }
            },
          }),
          el('button', { text: '🗑', title: 'Geçmişten sil', onclick: () => window.api.historyRemove(h.id) }),
        ]),
      ]);
    })
  );
}

$('#history-filter').addEventListener('input', renderHistory);
$('#history-clear').addEventListener('click', async () => {
  if (!historyItems.length) return;
  if (confirm('Tüm indirme geçmişi silinsin mi? (İndirilen dosyalar silinmez.)')) window.api.historyClear();
});

/* ---------- YAN PANEL: boyut ve çözünürlük ---------- */
const Q = window.VoidQuality;
const drawer = { vert: { on: false, mode: 'blur', res: '1080' }, open: false, token: 0, entries: [], probed: [], free: null, selection: 'source', onAdded: null, sampled: false, trim: { on: false, start: '', end: '' }, pv: { t: 0, img: '', busy: false, err: '', seq: 0, videoFail: false } };

/** "90", "1:30", "1:02:03" -> saniye; geçersizse null */
function parseTime(txt) {
  const t = String(txt || '').trim();
  if (!t) return null;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null;
  return t.split(':').reduce((acc, n) => acc * 60 + Number(n), 0);
}
function fmtClock(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s2 = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s2).padStart(2, '0')}` : `${m}:${String(s2).padStart(2, '0')}`;
}

/** Kırpma durumu: yalnızca tek öğede geçerli. */
function trimState() {
  const none = { on: false, valid: true, error: '', start: 0, end: 0, factor: 1 };
  if (!drawer.trim.on || drawer.probed.length !== 1) return none;
  const dur = drawer.probed[0].duration || 0;
  const start = parseTime(drawer.trim.start) ?? 0;
  const endRaw = drawer.trim.end.trim() ? parseTime(drawer.trim.end) : dur;
  if (drawer.trim.start.trim() && parseTime(drawer.trim.start) === null) return { ...none, on: true, valid: false, error: 'Başlangıç biçimi hatalı (örn. 1:30).' };
  if (endRaw === null) return { ...none, on: true, valid: false, error: 'Bitiş biçimi hatalı (örn. 2:45).' };
  if (endRaw <= start) return { ...none, on: true, valid: false, error: 'Bitiş, başlangıçtan sonra olmalı.' };
  if (dur && start >= dur) return { ...none, on: true, valid: false, error: `Başlangıç süreden (${fmtClock(dur)}) küçük olmalı.` };
  const end = dur && endRaw >= dur ? 0 : endRaw; // sona kadar = sınırsız
  const len = (end || dur || 0) - start;
  return { on: true, valid: true, error: '', start, end, factor: dur && len > 0 ? Math.min(1, len / dur) : 1 };
}

function closeDrawer() {
  drawer.open = false;
  drawer.token += 1; // süren hesaplamayı yok say
  $('#drawer').hidden = true;
}

async function openDrawer(entries, opts = {}) {
  const token = ++drawer.token;
  drawer.open = true;
  drawer.entries = entries;
  drawer.probed = [];
  drawer.onAdded = opts.onAdded || null;
  drawer.selection = appSettings.defaultQuality || 'source';
  drawer.sampled = false;
  drawer.trim = { on: false, start: '', end: '' };
  drawer.vert = { on: false, mode: 'blur', res: '1080' };
  drawer.pv = { t: 0, img: '', busy: false, err: '', seq: 0, videoFail: false };
  $('#drawer-title').textContent = opts.title ? `İndir: ${opts.title}` : 'İndirme seçenekleri';
  $('#drawer-confirm').disabled = true;
  $('#drawer-total').textContent = '';
  $('#drawer-body').replaceChildren(el('div', { class: 'dloading', text: 'Boyutlar ve çözünürlükler hesaplanıyor…' }));
  $('#drawer').hidden = false;
  try {
    // Çok sayıda öğede (arşiv) yalnızca ilk 3'ü ölçülür, kalanı onlara göre tahmin edilir
    const sample = !!opts.sample && entries.length > 6;
    const res = await rpc(window.api.probe(sample ? entries.slice(0, 3) : entries));
    if (token !== drawer.token) return;
    let items = res.items;
    drawer.sampled = sample;
    if (sample) {
      const ref = items.find((p) => !p.error && p.qualities.length && p.duration);
      items = items.concat(
        entries.slice(3).map((e) => {
          const d = Number(e.duration) || (ref ? ref.duration : 0);
          if (!ref) return { id: e.id, title: e.title, duration: d, url: e.url || '', qualities: [], error: '' };
          const k = ref.duration ? d / ref.duration : 1;
          return {
            ...ref,
            id: e.id,
            title: e.title,
            duration: d,
            url: e.url || '',
            error: '',
            qualities: ref.qualities.map((q) => ({ ...q, bytes: Math.round(q.bytes * k), exact: false })),
          };
        })
      );
    }
    drawer.probed = items;
    drawer.free = res.free;
    renderDrawer();
  } catch (err) {
    if (token !== drawer.token) return;
    $('#drawer-body').replaceChildren(el('div', { class: 'dloading', text: err.message }));
  }
}

function outputTag(o) {
  return { '4k60': '4K 60', '1440p60': '2K 60', '1080p60': '1080p60', vblur: 'DİKEY', vcrop: 'DİKEY', vblur720: 'DİKEY', vcrop720: 'DİKEY' }[o] || '';
}

const UP_OPTS = [
  { value: 'up1080', output: '1080p60', h: 1080, name: '1080p60', note: '1080p60' },
  { value: 'up1440', output: '1440p60', h: 1440, name: '1440p60 (2K)', note: '2K 60' },
  { value: 'up2160', output: '4k60', h: 2160, name: '2160p60 (4K)', note: '4K 60' },
];

/** Kısa video (TikTok / Shorts / Reels) çıktıları: [mod][çözünürlük] */
const VERT = { blur: { 1080: 'vblur', 720: 'vblur720' }, crop: { 1080: 'vcrop', 720: 'vcrop720' } };
const VERT_RES = { 1080: '1080×1920 (Full HD)', 720: '720×1280 (HD)' };
function vertOutput() {
  return drawer.vert && drawer.vert.on ? VERT[drawer.vert.mode][drawer.vert.res] : '';
}

/** Seçili kalite için bir öğenin sonucu: { label, bytes, exact, quality, output } */
function chosenFor(p) {
  const f = trimState().factor;
  const vo = vertOutput();
  if (vo) {
    return {
      label: `Dikey 9:16 · ${drawer.vert.res}p · ${drawer.vert.mode === 'blur' ? 'bulanık arka plan' : 'ortadan kırp'}`,
      bytes: p.duration ? Math.round(Q.estUpscaleBytes(p.duration, vo) * f) : 0,
      exact: false,
      quality: 'source',
      output: vo,
    };
  }
  const up = UP_OPTS.find((u) => u.value === drawer.selection);
  if (up) {
    return {
      label: `${up.name} (yükseltme)`,
      bytes: p.duration ? Math.round(Q.estUpscaleBytes(p.duration, up.output) * f) : 0,
      exact: false,
      quality: 'source',
      output: up.output,
    };
  }
  const q = Q.pickQuality(p.qualities, drawer.selection);
  if (!q) return { label: '—', bytes: 0, exact: false, quality: 'source', output: 'original' };
  return { label: q.label.replace(' (Source)', ''), bytes: Math.round(q.bytes * f), exact: q.exact && f === 1, quality: q.value || 'source', output: 'original' };
}

function drawerTotals() {
  let bytes = 0;
  let unknown = 0;
  let approx = false;
  for (const p of drawer.probed) {
    const c = chosenFor(p);
    if (p.error || !c.bytes) unknown += 1;
    else {
      bytes += c.bytes;
      if (!c.exact) approx = true;
    }
  }
  return { bytes, unknown, approx };
}

function renderDrawer() {
  const body = $('#drawer-body');
  const ok = drawer.probed.filter((p) => !p.error && p.qualities.length);
  const heights = Q.unionSelections(ok.map((p) => p.qualities));
  // Kaynağın gerçek en yüksek kalitesi (etiketiyle, örn. "1080p60")
  const topQ = ok.map((p) => p.qualities[0]).sort((x, y) => (y.height || 0) - (x.height || 0))[0];
  const topLabel = topQ ? topQ.label.replace(' (Source)', '') : 'Kaynak';
  const opts = [{ value: 'source', name: topLabel, sub: 'Kaynak kalite · kayıpsız' }].concat(
    heights.slice(1).map((h) => {
      const q = ok.map((p) => p.qualities.find((x) => x.height === h)).find(Boolean);
      return { value: String(h), name: q ? q.label : `${h}p`, sub: '' };
    })
  );
  // Kaynağın zaten sunduğu kalitenin üzerindeki seçenekler "yükseltme" olarak aynı listede
  const topH = topQ ? topQ.height : 0;
  const topFps = topQ ? topQ.fps : 0;
  for (const u of UP_OPTS) {
    const native = topH === u.h && topFps >= 50;
    if (u.h < topH || native) continue;
    opts.push({ value: u.value, name: u.name, sub: 'Yükseltme (yavaş, dosya büyük)', up: true });
  }
  // Düşükten yükseğe sırala (aynı çözünürlükte düşük fps önce); dikey seçenekler en sonda
  const rank = (o) => {
    if (o.value === 'source') return topH * 10 + 1;
    const up = UP_OPTS.find((u) => u.value === o.value);
    if (up) return up.h * 10 + 2;
    const hh = Number(o.value);
    const q = ok.map((pp) => pp.qualities.find((x) => x.height === hh)).find(Boolean);
    return hh * 10 + (q && q.fps >= 50 ? 1 : 0);
  };
  opts.sort((x, y) => rank(x) - rank(y));
  if (!opts.some((o) => o.value === drawer.selection)) drawer.selection = 'source';
  const upSel = UP_OPTS.find((u) => u.value === drawer.selection);

  const sizeFor = (sel) => {
    let b = 0;
    let known = false;
    let approx = false;
    for (const p of drawer.probed) {
      if (p.error || !p.qualities.length) continue;
      const up = UP_OPTS.find((u) => u.value === sel);
      const bytes = up ? (p.duration ? Q.estUpscaleBytes(p.duration, up.output) : 0) : (Q.pickQuality(p.qualities, sel) || {}).bytes;
      const exact = !up && (Q.pickQuality(p.qualities, sel) || {}).exact && trimState().factor === 1;
      if (bytes) {
        b += bytes * trimState().factor;
        known = true;
        if (!exact) approx = true;
      }
    }
    return known ? `${approx ? '~' : ''}${fmtBytes(b)}` : 'bilinmiyor';
  };

  const qualityRows = opts.map((o) => {
    const input = el('input', { type: 'radio', name: 'dq', value: o.value });
    const vertOn = !!vertOutput();
    input.checked = o.value === drawer.selection && !vertOn;
    input.disabled = vertOn;
    const row = el('label', { class: `opt${input.checked ? ' sel' : ''}${vertOn ? ' dim' : ''}` }, [
      input,
      el('span', { class: 'o-name' }, [o.name, o.sub ? el('small', { text: o.sub }) : null]),
      el('span', { class: 'o-size', text: sizeFor(o.value) }),
    ]);
    input.addEventListener('change', () => {
      drawer.selection = o.value;
      renderDrawer();
    });
    return row;
  });

  const itemRows = drawer.probed.slice(0, 40).map((p) => {
    const c = chosenFor(p);
    const right = p.error ? 'alınamadı' : `${c.label}${c.bytes ? ` · ${c.exact ? '' : '~'}${fmtBytes(c.bytes)}` : ''}`;
    const left = el('span', { text: p.title });
    const r = el('span', { class: p.error ? 'bad' : '', text: right });
    if (p.error) r.title = p.error;
    return el('div', { class: 'ditem-wrap' }, [
      el('div', { class: 'ditem' }, [left, r]),
      p.error ? el('div', { class: 'derr', text: p.error }) : null,
    ]);
  });

  // Önizleme: ffmpeg ile seçilen andan kare çıkarır (yalnızca tek öğede)
  let pvUi = null;
  if (drawer.probed.length === 1 && !drawer.probed[0].error && drawer.probed[0].url && drawer.probed[0].duration > 0) {
    const p0 = drawer.probed[0];
    const pv = drawer.pv;
    // Doğrudan mp4 ise gerçek oynatıcı; HLS ya da oynatma hatasında kare önizlemeye düşer
    const useVideo = !/\.m3u8(\?|$)/i.test(p0.url) && !pv.videoFail;
    const frame = el('div', { class: 'pv-frame', id: 'pv-frame' });
    let video = null;
    if (useVideo) {
      video = el('video', { controls: '', preload: 'metadata', src: toProxy(p0.url) });
      video.muted = false;
      frame.appendChild(video);
    }
    const paint = () => {
      const box = $('#pv-frame');
      if (!box || useVideo) return;
      box.replaceChildren(
        ...[
          pv.img ? el('img', { src: pv.img, alt: 'Önizleme karesi' }) : el('div', { class: 'pv-ph', text: pv.busy ? 'Kare alınıyor…' : 'Bir an seç, kare görünsün' }),
          pv.busy && pv.img ? el('div', { class: 'pv-busy', text: 'Yükleniyor…' }) : null,
        ].filter(Boolean)
      );
    };
    const timeLabel = el('b', { id: 'pv-time', text: fmtClock(pv.t) });
    const range = el('input', { type: 'range', id: 'pv-range', min: '0', max: String(Math.floor(p0.duration)), step: '1', value: String(Math.min(pv.t, Math.floor(p0.duration))), 'aria-label': 'Önizleme zamanı' });
    const load = async () => {
      const seq = ++pv.seq;
      pv.busy = true;
      pv.err = '';
      paint();
      try {
        const img = await rpc(window.api.framePreview(p0.url, pv.t));
        if (seq !== pv.seq) return;
        pv.img = img;
      } catch (err) {
        if (seq !== pv.seq) return;
        pv.err = err.message;
      } finally {
        if (seq === pv.seq) {
          pv.busy = false;
          paint();
          const e = $('#pv-err');
          if (e) e.textContent = pv.err;
        }
      }
    };
    range.addEventListener('input', () => {
      pv.t = Number(range.value);
      timeLabel.textContent = fmtClock(pv.t);
      if (video) video.currentTime = pv.t;
    });
    if (video) {
      const sync = () => {
        pv.t = Math.floor(video.currentTime || 0);
        timeLabel.textContent = fmtClock(pv.t);
        range.value = String(Math.min(pv.t, Math.floor(p0.duration)));
      };
      // Çekmece yeniden çizilince (örn. Başlangıç yap) kaldığı anı geri yükle
      video.addEventListener('loadedmetadata', () => { if (pv.t > 0) video.currentTime = pv.t; });
      video.addEventListener('timeupdate', sync);
      video.addEventListener('seeked', sync);
      video.addEventListener('error', () => {
        pv.videoFail = true;
        renderDrawer();
      });
    } else {
      range.addEventListener('change', load);
    }
    const setTrim = (key) => {
      drawer.trim.on = true;
      drawer.trim[key] = fmtClock(pv.t);
      renderDrawer();
    };
    const save = el('button', { class: 'ghost small', type: 'button', text: 'Kareyi PNG kaydet' });
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        const file = await rpc(window.api.frameSave(p0.url, pv.t, p0.title));
        toast('Kare kaydedildi: ' + file.split(/[\\/]/).pop());
        window.api.showFile(file);
      } catch (err) {
        toast(err.message, true);
      } finally {
        save.disabled = false;
      }
    });
    const startBtn = el('button', { class: 'ghost small', type: 'button', text: 'Başlangıç yap', onclick: () => setTrim('start') });
    const endBtn = el('button', { class: 'ghost small', type: 'button', text: 'Bitiş yap', onclick: () => setTrim('end') });
    const stepBtns = video
      ? [-5, -1, 1, 5].map((d) =>
          el('button', {
            class: 'ghost small',
            type: 'button',
            text: `${d > 0 ? '+' : '−'}${Math.abs(d)} sn`,
            onclick: () => {
              video.currentTime = Math.max(0, Math.min(p0.duration, (video.currentTime || 0) + d));
            },
          })
        )
      : [];
    pvUi = el('div', {}, [
      el('div', { class: 'dsec', text: 'Önizleme' }),
      frame,
      el('div', { class: 'pv-row' }, [range, timeLabel, el('span', { class: 'pv-dur', text: `/ ${fmtClock(p0.duration)}` })]),
      stepBtns.length ? el('div', { class: 'pv-actions' }, stepBtns) : null,
      el('div', { class: 'pv-actions' }, [startBtn, endBtn, save]),
      el('div', { class: 'derr', id: 'pv-err', text: pv.err }),
      el('div', { class: 'dnote', text: video ? 'Videoyu oynat, istediğin anda durdurup Başlangıç/Bitiş yap ya da kareyi PNG kaydet. Oynatılamazsa kare önizlemeye geçilir.' : 'Kaydırıcıyı bırakınca o andan bir kare alınır (birkaç sn sürebilir). Kareyi başlangıç/bitiş yapabilir ya da tam çözünürlükte PNG kaydedebilirsin.' }),
    ]);
    queueMicrotask(paint);
  }

  // Bölüm kırpma (yalnızca tek öğede)
  let trimUi = null;
  if (drawer.probed.length === 1 && !drawer.probed[0].error) {
    const dur = drawer.probed[0].duration || 0;
    const cb = el('input', { type: 'checkbox', id: 'trim-on' });
    cb.checked = drawer.trim.on;
    cb.addEventListener('change', () => {
      drawer.trim.on = cb.checked;
      renderDrawer();
    });
    const mk = (key, label, ph) => {
      const inp = el('input', { type: 'text', placeholder: ph, spellcheck: 'false', 'aria-label': label, id: `trim-${key}` });
      inp.value = drawer.trim[key];
      inp.addEventListener('input', () => {
        drawer.trim[key] = inp.value;
        renderDrawer();
        // Yeniden çizimden sonra imleç aynı kutuda kalsın
        const again = $(`#trim-${key}`);
        if (again) {
          again.focus();
          again.setSelectionRange(again.value.length, again.value.length);
        }
      });
      return el('label', {}, [label, inp]);
    };
    const st = trimState();
    trimUi = el('div', {}, [
      el('div', { class: 'dsec', text: 'Bölüm' }),
      el('label', { class: 'trim-toggle' }, [cb, `Yalnızca bir bölümünü indir${dur ? ` (toplam ${fmtClock(dur)})` : ''}`]),
      drawer.trim.on ? el('div', { class: 'trim' }, [mk('start', 'Başlangıç', '0:00'), mk('end', 'Bitiş', dur ? fmtClock(dur) : 'sona kadar')]) : null,
      drawer.trim.on && st.error ? el('div', { class: 'derr', text: st.error }) : null,
      drawer.trim.on && st.valid
        ? el('div', { class: 'dnote', text: 'Kopya modunda başlangıç en yakın anahtar kareye yuvarlanabilir (birkaç saniye oynama olur). Yükseltme/küçültmede kesin kırpılır.' })
        : null,
    ]);
  }

  // Kısa video (TikTok / YouTube Shorts / Reels): Kick kalitesinden ayrı bölüm
  const vcb = el('input', { type: 'checkbox', id: 'vert-on' });
  vcb.checked = drawer.vert.on;
  vcb.addEventListener('change', () => {
    drawer.vert.on = vcb.checked;
    renderDrawer();
  });
  const seg = (key, items) =>
    el(
      'div',
      { class: 'seg', role: 'group' },
      items.map(([val, label]) => {
        const b = el('button', { type: 'button', class: `segbtn${drawer.vert[key] === val ? ' active' : ''}`, text: label });
        b.addEventListener('click', () => {
          drawer.vert[key] = val;
          renderDrawer();
        });
        return b;
      })
    );
  const vertUi = el('div', { class: 'vertbox' }, [
    el('div', { class: 'dsec', text: 'Kısa video · TikTok · YouTube Shorts · Reels' }),
    el('label', { class: 'trim-toggle' }, [vcb, 'Dikey (9:16) videoya çevir']),
    drawer.vert.on
      ? el('div', {}, [
          el('div', { class: 'vlabel', text: 'Çözünürlük' }),
          seg('res', [['1080', VERT_RES[1080]], ['720', VERT_RES[720]]]),
          el('div', { class: 'vlabel', text: 'Yatay görüntü nasıl sığsın?' }),
          seg('mode', [['blur', 'Bulanık arka plan'], ['crop', 'Ortadan kırp']]),
          el('div', {
            class: 'dnote',
            text:
              (drawer.vert.mode === 'blur'
                ? 'Görüntü genişliğe sığdırılır, üstte ve altta kalan alan aynı görüntünün bulanığıyla dolar; hiçbir yer kesilmez. '
                : 'Yatay görüntünün ortası alınır; kenarlar (örn. oyun arayüzü) kesilir, ekran dolu olur. ') +
              'Kaynak her zaman Kick\'in en yüksek kalitesinden alınır, bu yüzden yukarıdaki Kick kalitesi seçimi devre dışıdır. Yeniden kodlandığı için yavaştır, boyut kaba tahmindir.',
          }),
        ])
      : el('div', { class: 'dnote', text: 'Açınca video 9:16 dikey formata çevrilir. Çözünürlüğü ve sığdırma biçimini buradan seçersin.' }),
  ]);

  const single = ok.length && ok.every((p) => p.qualities.length === 1 && !p.qualities[0].height);
  body.replaceChildren(
    ...[
      el('div', { class: 'dsec', text: 'Kick kalitesi' }),
      ...qualityRows,
      single
        ? el('div', {
            class: 'dnote',
            text: 'Bu kaynak yalnızca tek kalite sunuyor (doğrudan dosya). Başka kalite listesi bulunamadı.',
          })
        : null,
      upSel && !vertOutput()
        ? el('div', {
            class: 'dnote',
            text:
              `Kick kaynağı ${upSel.h}p değil: görüntü ${upSel.name.split(' ')[0]} ve 60 kare/sn'ye yükseltilir. ` +
              'Gerçek detay eklenmez, 30 fps içerikte kareler tekrarlanır. Yeniden kodlandığı için yavaştır, boyut kaba tahmindir.',
          })
        : null,
      vertUi,
      pvUi,
      trimUi,
      drawer.sampled ? el('div', { class: 'dnote', text: 'Çok sayıda öğe var: kalite ve boyutlar ilk 3 klibe bakılarak tahmin edildi.' }) : null,
      el('div', { class: 'dsec', text: `Öğeler (${drawer.probed.length})` }),
      ...itemRows,
      drawer.probed.length > 40 ? el('div', { class: 'meta', text: `… ve ${drawer.probed.length - 40} öğe daha` }) : null,
    ].filter(Boolean)
  );

  renderDrawerFooter();
}

function renderDrawerFooter() {
  const t = drawerTotals();
  const total = el('div');
  total.append(el('b', { text: t.bytes ? `${t.approx ? '~' : ''}${fmtBytes(t.bytes)}` : 'Boyut bilinmiyor' }), ' toplam');
  if (t.unknown && t.bytes) total.append(el('div', { text: `${t.unknown} öğenin boyutu bilinmiyor, toplama dahil değil.` }));
  if (drawer.free !== null) {
    const enough = !t.bytes || t.bytes <= drawer.free;
    total.append(
      el('div', {
        class: enough ? '' : 'bad',
        text: enough
          ? `Diskte boş yer: ${fmtBytes(drawer.free)}`
          : `Diskte yeterli yer yok: boş ${fmtBytes(drawer.free)}, gereken ~${fmtBytes(t.bytes)}`,
      })
    );
  } else if (!appSettings.dir) {
    total.append(el('div', { text: 'İndirme klasörü henüz seçilmedi, eklerken sorulacak.' }));
  }
  $('#drawer-total').replaceChildren(total);
  $('#drawer-confirm').disabled = !drawer.probed.length || !trimState().valid;
  $('#drawer-confirm').textContent = drawer.probed.length > 1 ? `Kuyruğa ekle (${drawer.probed.length})` : 'Kuyruğa ekle';
}

$('#drawer-close').addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('#player').hidden) return closePlayer();
    if (drawer.open) closeDrawer();
    closeStatusPop();
  }
});
$('#drawer-confirm').addEventListener('click', async () => {
  const btn = $('#drawer-confirm');
  btn.disabled = true;
  try {
    const entries = drawer.probed.map((p, i) => {
      const c = chosenFor(p);
      return {
        ...drawer.entries[i],
        // probe sırasında tamamlanan adres ve süre yeniden istenmesin
        url: p.url || drawer.entries[i].url,
        duration: p.duration || drawer.entries[i].duration,
        quality: c.quality,
        output: c.output,
        ...(trimState().on && trimState().valid ? { trimStart: trimState().start, trimEnd: trimState().end } : {}),
      };
    });
    const n = await rpc(window.api.queueAdd(entries));
    toast(n ? `${n} indirme kuyruğa eklendi` : 'Seçilenler zaten kuyrukta');
    const cb = drawer.onAdded;
    closeDrawer();
    if (cb) cb();
  } catch (err) {
    toast(err.message, true);
    btn.disabled = false;
  }
});

/* ---------- BAĞLANTI DURUMU + KICK HESABI ---------- */
let lastStatus = { state: 'checking', label: 'Kontrol ediliyor…' };

function renderStatus(s) {
  lastStatus = s;
  const chip = $('#status-chip');
  chip.dataset.state = s.state;
  $('#status-label').textContent = s.state === 'ok' ? 'Bağlı' : s.label;
  let sub = s.state === 'ok' ? 'Kick erişimi var' : s.state === 'checking' ? 'Kick bağlantısı' : 'Ayrıntı için tıkla';
  $('#status-sub').textContent = sub;
  if (!$('#status-pop').hidden) renderStatusPop();
}

function renderStatusPop() {
  const s = lastStatus;
  const when = s.checkedAt ? new Date(s.checkedAt).toLocaleTimeString('tr-TR') : '';
  const pop = $('#status-pop');
  pop.replaceChildren(
    el('h4', { text: s.label }),
    el('p', { text: [s.detail, when ? `Son kontrol: ${when}` : ''].filter(Boolean).join(' · ') || 'Kick bağlantısı kontrol ediliyor.' }),
    el('div', { class: 'pop-actions' }, [
      el('button', { class: 'ghost small', text: 'Yeniden kontrol et', onclick: () => window.api.statusCheck() }),
      el('button', { class: 'ghost small', text: 'Bağlantı tanılama', onclick: runDiag }),
    ]),
    el('ul', { class: 'diag', id: 'diag-list' })
  );
}

async function runDiag() {
  const list = $('#diag-list');
  list.replaceChildren(el('li', { text: 'Test ediliyor…' }));
  try {
    const slug = ($('#channel-input').value || '').trim().toLowerCase();
    const steps = await rpc(window.api.diagRun(slug));
    list.replaceChildren(
      ...steps.map((st) =>
        el('li', { class: st.ok ? 'ok' : 'bad' }, [el('b', { text: `${st.ok ? '✓' : '✗'} ${st.name}` }), el('span', { text: st.detail })])
      )
    );
  } catch (err) {
    list.replaceChildren(el('li', { class: 'bad', text: err.message }));
  }
}

function closeStatusPop() {
  $('#status-pop').hidden = true;
  $('#status-chip').setAttribute('aria-expanded', 'false');
}
$('#status-chip').addEventListener('click', (e) => {
  e.stopPropagation();
  const pop = $('#status-pop');
  if (!pop.hidden) return closeStatusPop();
  renderStatusPop();
  pop.hidden = false;
  $('#status-chip').setAttribute('aria-expanded', 'true');
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.pop-wrap')) closeStatusPop();
});

/* ---------- başlangıç ---------- */
(async function init() {
  try {
    await initSettings();
    renderQueue(await rpc(window.api.queueList()));
  } catch (err) {
    toast(err.message, true);
  }
  window.api.onQueue(renderQueue);
  window.api.onHistory(() => {
    if ($('#view-history').classList.contains('active')) loadHistory();
  });
  window.api.onStatus(renderStatus);
  try {
    renderStatus(await rpc(window.api.statusGet()));
  } catch {
    /* durum bilgisi yoksa rozet "kontrol ediliyor" kalır */
  }
})();

/* ---------- Pano algılama ---------- */
let clipLink = '';
function hideClipbar() { $('#clipbar').hidden = true; }
if (window.api.onClipboard) {
  window.api.onClipboard((link) => {
    clipLink = link;
    $('#clipbar-link').textContent = link.length > 60 ? link.slice(0, 57) + '…' : link;
    $('#clipbar').hidden = false;
  });
}
$('#clipbar-close').addEventListener('click', hideClipbar);
$('#clipbar-go').addEventListener('click', () => {
  hideClipbar();
  switchTab('link');
  $('#link-input').value = clipLink;
  $('#link-form').requestSubmit();
});

/* ---------- Sürükle-bırak ---------- */
// Pencereye bırakılan bir dosya/bağlantının sayfayı değiştirmesini engelle, Kick linkini analize gönder
let dragDepth = 0;
function dropText(dt) {
  const raw = (dt.getData('text/uri-list') || dt.getData('text/plain') || '').split(/\r?\n/).map((x) => x.trim()).find((x) => x && !x.startsWith('#'));
  return raw && /kick\.com/i.test(raw) ? raw : '';
}
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth += 1;
  $('#dropzone').hidden = false;
});
window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $('#dropzone').hidden = true;
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('#dropzone').hidden = true;
  const link = dropText(e.dataTransfer);
  if (!link) return toast('Bırakılan öğede Kick linki bulunamadı.', true);
  hideClipbar();
  switchTab('link');
  $('#link-input').value = link;
  $('#link-form').requestSubmit();
});

/* ---------- Uygulama içi oynatıcı ---------- */
const player = { hls: null, token: 0 };
const toProxy = (u) => String(u).replace(/^https:\/\//i, 'voidmedia://');

function closePlayer() {
  player.token += 1;
  if (player.hls) {
    try { player.hls.destroy(); } catch { /* yoksay */ }
    player.hls = null;
  }
  const v = $('#player-video');
  v.pause();
  v.removeAttribute('src');
  v.load();
  $('#player-q').hidden = true;
  $('#player').hidden = true;
}

function playerMsg(text, bad = false) {
  const m = $('#player-msg');
  m.textContent = text;
  m.className = `player-msg${bad ? ' bad' : ''}`;
}

async function openPlayer(item) {
  closePlayer();
  const tok = player.token;
  const v = $('#player-video');
  $('#player-title').textContent = item.title || 'Oynatıcı';
  $('#player').hidden = false;
  playerMsg('Yükleniyor…');
  try {
    const r = await rpc(window.api.playResolve({ kind: item.kind, id: item.id, url: item.url || '', title: item.title, duration: item.duration }));
    if (tok !== player.token) return;
    const fail = (text) => {
      if (tok === player.token) playerMsg(text, true);
    };
    if (r.isHls) {
      if (!window.Hls || !window.Hls.isSupported()) return fail('Bu sürümde canlı akış (HLS) oynatma desteklenmiyor.');
      const Base = window.Hls.DefaultConfig.loader;
      class ProxyLoader extends Base {
        load(context, config, callbacks) {
          context.url = toProxy(context.url);
          super.load(context, config, callbacks);
        }
      }
      const hls = new window.Hls({ enableWorker: false, loader: ProxyLoader, maxBufferLength: 40 });
      player.hls = hls;
      hls.on(window.Hls.Events.MANIFEST_PARSED, (_e, data) => {
        const sel = $('#player-q');
        const levels = data.levels.map((l, i) => ({ i, h: l.height || 0, fps: Math.round(Number(l.frameRate) || 0) })).sort((a, b) => b.h - a.h);
        sel.replaceChildren(
          el('option', { value: '-1', text: 'Otomatik' }),
          ...levels.map((l) => el('option', { value: String(l.i), text: l.h ? `${l.h}p${l.fps >= 50 ? l.fps : ''}` : `Kalite ${l.i + 1}` }))
        );
        sel.hidden = levels.length < 2;
        playerMsg('');
        v.play().catch(() => {});
      });
      hls.on(window.Hls.Events.ERROR, (_e, data) => {
        if (data && data.fatal) fail('Oynatılamadı: Kick bu videoyu uygulama içinde oynatmaya izin vermiyor olabilir. İndirip izleyebilirsin.');
      });
      hls.loadSource(r.url);
      hls.attachMedia(v);
    } else {
      v.onerror = () => fail('Oynatılamadı: Kick bu videoyu uygulama içinde oynatmaya izin vermiyor olabilir. İndirip izleyebilirsin.');
      v.onloadedmetadata = () => playerMsg('');
      v.src = r.url;
      v.play().catch(() => {});
    }
  } catch (err) {
    if (tok === player.token) playerMsg(err.message, true);
  }
}
$('#player-q').addEventListener('change', (e) => {
  if (player.hls) player.hls.currentLevel = Number(e.target.value);
});
$('#player-close').addEventListener('click', closePlayer);
$('#player').addEventListener('click', (e) => {
  if (e.target === $('#player')) closePlayer();
});

/* ---------- Görseli olmayan öğeler için kare küçük resmi ---------- */
const thumbTried = new Set();
function fillThumbs(items) {
  if (!window.api.thumbFrame) return;
  let n = 0;
  for (const it of items) {
    if (it.thumbnail || thumbTried.has(`${it.kind}:${it.id}`) || n >= 30) continue;
    n += 1;
    thumbTried.add(`${it.kind}:${it.id}`);
    window.api
      .thumbFrame(it)
      .then((res) => {
        if (!res || !res.ok) return;
        it.thumbnail = res.data;
        const card = $(`#grid [data-id="${CSS.escape(it.id)}"]`);
        const ph = card && card.querySelector('.thumb');
        if (ph && ph.tagName !== 'IMG') ph.replaceWith(thumbEl(res.data, 'thumb'));
      })
      .catch(() => {});
  }
}
