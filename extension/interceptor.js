// Runs in the page's own JavaScript world so it can see the app's network
// calls. It only observes responses the page has already requested — it never
// issues requests of its own and never touches credentials.
(function () {
  const TAG = 'lyric-tap';
  const LYRICS = /\/color-lyrics\/v2\/track\/([A-Za-z0-9]+)/;
  const METADATA = /(pathfinder\/v\d+\/query|api-partner\.spotify\.com)/;
  const TRACK_URI = /^spotify:track:([A-Za-z0-9]{22})$/;

  const MAX_BODY = 4000000;   // don't walk absurd payloads
  const MAX_NODES = 60000;    // hard ceiling on the walk

  function post(message) {
    window.postMessage(
      Object.assign({ source: TAG }, message),
      window.location.origin
    );
  }

  // ---- lyrics ------------------------------------------------------------
  function publishLyrics(url, text) {
    const match = String(url).match(LYRICS);
    if (!match) return;

    let payload;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      return;
    }
    if (!payload || !payload.lyrics) return;

    post({
      kind: 'lyrics',
      trackId: match[1],
      payload: payload,
      captured: Date.now()
    });
  }

  // ---- track metadata ----------------------------------------------------
  function artistsOf(node) {
    const source = node.artists;
    let items = null;
    if (source && Array.isArray(source.items)) items = source.items;
    else if (Array.isArray(source)) items = source;
    if (!items) return '';

    return items
      .map(entry => {
        if (!entry || typeof entry !== 'object') return '';
        if (typeof entry.name === 'string') return entry.name;
        if (entry.profile && typeof entry.profile.name === 'string') return entry.profile.name;
        return '';
      })
      .filter(Boolean)
      .join(', ');
  }

  function albumOf(node) {
    const album = node.albumOfTrack || node.album;
    return album && typeof album.name === 'string' ? album.name : '';
  }

  // Walks any JSON the player received, collecting every object that looks
  // like a track entity. This is what lets a prefetched lyric be named
  // correctly: the queue's metadata arrived in the same session.
  function harvest(text) {
    if (!text || text.length > MAX_BODY) return;

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return;
    }

    const found = new Map();
    let budget = MAX_NODES;

    (function walk(node, depth) {
      if (budget-- <= 0 || depth > 14) return;
      if (!node || typeof node !== 'object') return;

      if (Array.isArray(node)) {
        for (const child of node) walk(child, depth + 1);
        return;
      }

      if (typeof node.uri === 'string' && typeof node.name === 'string' && node.name) {
        const match = node.uri.match(TRACK_URI);
        if (match && !found.has(match[1])) {
          found.set(match[1], {
            id: match[1],
            title: node.name,
            artist: artistsOf(node),
            album: albumOf(node)
          });
        }
      }

      for (const value of Object.values(node)) walk(value, depth + 1);
    })(data, 0);

    if (found.size) post({ kind: 'tracks', tracks: Array.from(found.values()) });
  }

  function inspect(url, text) {
    if (LYRICS.test(url)) publishLyrics(url, text);
    else if (METADATA.test(url)) harvest(text);
  }

  // ---- fetch -------------------------------------------------------------
  const nativeFetch = window.fetch;
  window.fetch = function (...args) {
    const result = nativeFetch.apply(this, args);
    try {
      const target = args[0];
      const url = typeof target === 'string' ? target : (target && target.url) || '';
      if (LYRICS.test(url) || METADATA.test(url)) {
        result
          .then(res => res.clone().text())
          .then(text => inspect(url, text))
          .catch(() => {});
      }
    } catch (err) {
      /* never let the tap break the page */
    }
    return result;
  };

  // ---- XMLHttpRequest ----------------------------------------------------
  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__lyricTapUrl = url;
    return nativeOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    const url = this.__lyricTapUrl;
    if (url && (LYRICS.test(url) || METADATA.test(url))) {
      this.addEventListener('load', () => {
        try {
          inspect(url, this.responseText);
        } catch (err) {
          /* ignore */
        }
      });
    }
    return nativeSend.apply(this, args);
  };
})();
