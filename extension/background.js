// Stores captures and a track-ID lookup table, and back-fills the metadata of
// captures that arrived before their track was named.
const CAPTURES = 'captures';
const TRACKS = 'tracks';
const NOW = 'nowPlayingId';

const MAX_CAPTURES = 10;
const MAX_TRACKS = 400;

async function get(key, fallback) {
  const bag = await chrome.storage.local.get(key);
  return bag[key] === undefined ? fallback : bag[key];
}

async function badge(count) {
  await chrome.action.setBadgeText({ text: count ? String(count) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#7a2b22' });
}

async function putCaptures(list) {
  await chrome.storage.local.set({ [CAPTURES]: list });
  await badge(list.length);
  return list;
}

function trim(map, limit) {
  const keys = Object.keys(map);
  if (keys.length <= limit) return map;
  const kept = {};
  keys.slice(keys.length - limit).forEach(k => { kept[k] = map[k]; });
  return kept;
}

function applyMeta(record, meta) {
  if (!meta || !meta.title) return record;
  if (record.resolved && record.title) return record;
  return Object.assign({}, record, {
    title: meta.title,
    artist: meta.artist || record.artist || '',
    album: meta.album || record.album || '',
    resolved: true
  });
}

async function mergeTracks(entries) {
  const map = await get(TRACKS, {});
  let changed = false;

  entries.forEach(entry => {
    if (!entry || !entry.id || !entry.title) return;
    const prior = map[entry.id];
    if (prior && prior.artist && !entry.artist) return;
    if (prior && prior.title === entry.title && prior.artist === entry.artist) return;
    map[entry.id] = { title: entry.title, artist: entry.artist || '', album: entry.album || '' };
    changed = true;
  });

  if (!changed) return null;

  const trimmed = trim(map, MAX_TRACKS);
  await chrome.storage.local.set({ [TRACKS]: trimmed });

  // Back-fill anything captured before its name turned up.
  const list = await get(CAPTURES, []);
  let patched = false;
  const next = list.map(record => {
    if (record.resolved && record.title) return record;
    const updated = applyMeta(record, trimmed[record.trackId]);
    if (updated !== record) patched = true;
    return updated;
  });

  if (patched) await putCaptures(next);
  return patched ? next : null;
}

async function store(record) {
  if (!record || !record.payload || !record.trackId) return { ok: false };

  const map = await get(TRACKS, {});
  const filled = applyMeta(record, map[record.trackId]);

  const list = await get(CAPTURES, []);
  const existing = list.findIndex(item => item.trackId === filled.trackId);
  if (existing !== -1) list.splice(existing, 1);

  list.unshift(filled);
  await putCaptures(list.slice(0, MAX_CAPTURES));
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message || !message.type) return;

  if (message.type === 'capture') {
    store(message.record).then(respond);
    return true;
  }

  if (message.type === 'tracks') {
    mergeTracks(message.tracks || []).then(() => respond({ ok: true }));
    return true;
  }

  if (message.type === 'nowPlaying') {
    const track = message.track;
    if (!track || !track.id) { respond({ ok: false }); return true; }
    chrome.storage.local.set({ [NOW]: track.id })
      .then(() => mergeTracks([track]))
      .then(() => respond({ ok: true }));
    return true;
  }

  if (message.type === 'list') {
    Promise.all([get(CAPTURES, []), get(NOW, null)])
      .then(([list, nowPlayingId]) => respond({ list, nowPlayingId }));
    return true;
  }

  if (message.type === 'forget') {
    get(CAPTURES, [])
      .then(list => putCaptures(list.filter(item => item.trackId !== message.trackId)))
      .then(list => respond({ list }));
    return true;
  }

  if (message.type === 'clear') {
    putCaptures([]).then(list => respond({ list }));
    return true;
  }
});

chrome.runtime.onStartup.addListener(() => get(CAPTURES, []).then(list => badge(list.length)));
chrome.runtime.onInstalled.addListener(() => get(CAPTURES, []).then(list => badge(list.length)));
