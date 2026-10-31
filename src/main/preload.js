'use strict';
const { contextBridge, ipcRenderer, webFrame } = require('electron');

const call = (name, ...args) => ipcRenderer.invoke(name, ...args);

contextBridge.exposeInMainWorld('api', {
  analyze: (input) => call('analyze', input),
  openChannel: (slug) => call('channel:open', slug),
  channelClips: (slug, opts) => call('channel:clips', slug, opts),
  channelVods: (slug) => call('channel:vods', slug),

  queueAdd: (entries) => call('queue:add', entries),
  queueList: () => call('queue:list'),
  queueRename: (id, name) => call('queue:rename', id, name),
  queuePause: (id) => call('queue:pause', id),
  queueResume: (id) => call('queue:resume', id),
  queueCancel: (id) => call('queue:cancel', id),
  queueRetry: (id) => call('queue:retry', id),
  queueRemove: (id) => call('queue:remove', id),
  queueClear: () => call('queue:clear'),
  onQueue: (cb) => {
    const listener = (_e, items) => cb(items);
    ipcRenderer.on('queue:update', listener);
    return () => ipcRenderer.removeListener('queue:update', listener);
  },

  historyList: () => call('history:list'),
  historyRemove: (id) => call('history:remove', id),
  historyClear: () => call('history:clear'),
  historyRequeue: (id) => call('history:requeue', id),
  onHistory: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('history:update', listener);
    return () => ipcRenderer.removeListener('history:update', listener);
  },

  onClipboard: (cb) => {
    const listener = (_e, link) => cb(link);
    ipcRenderer.on('clipboard:link', listener);
    return () => ipcRenderer.removeListener('clipboard:link', listener);
  },

  statusGet: () => call('status:get'),
  statusCheck: () => call('status:check'),
  onStatus: (cb) => {
    const listener = (_e, s) => cb(s);
    ipcRenderer.on('status:update', listener);
    return () => ipcRenderer.removeListener('status:update', listener);
  },


  setZoom: (f) => webFrame.setZoomFactor(Math.min(1.6, Math.max(0.8, Number(f) || 1))),
  winMinimize: () => call('win:minimize'),
  winToggleMax: () => call('win:toggleMax'),
  winClose: () => call('win:close'),
  diagRun: (slug) => call('diag:run', slug),
  probe: (entries) => call('options:probe', entries),
  framePreview: (url, t) => call('frame:preview', url, t),
  playResolve: (entry) => call('play:resolve', entry),
  thumbFrame: (entry) => call('thumb:frame', entry),
  frameSave: (url, t, title) => call('frame:save', url, t, title),

  getSettings: () => call('settings:get'),
  setSettings: (patch) => call('settings:set', patch),
  chooseDir: () => call('dir:choose'),
  openDir: () => call('dir:open'),
  showFile: (p) => call('file:show', p),
});
