// Isolated world. Receives messages from interceptor.js, resolves a capture's
// track ID against metadata seen in this session, and forwards to the worker.
//
// Metadata is keyed by track ID, never by "whatever is playing right now" —
// the player prefetches lyrics for queued tracks, so a capture and the
// now-playing bar routinely refer to different songs.
(function () {
  const TAG = 'lyric-tap';
  const TRACK_HREF = /\/track\/([A-Za-z0-9]{22})/;
  const POLL_MS = 1000;

  const known = new Map();
  let currentId = null;

  function remember(entries) {
    let added = 0;
    entries.forEach(entry => {
      if (!entry || !entry.id || !entry.title) return;
      const prior = known.get(entry.id);
      // Prefer a record that carries an artist over one that doesn't.
      if (prior && prior.artist && !entry.artist) return;
      known.set(entry.id, entry);
      added++;
    });
    return added;
  }

  function send(message) {
    try {
      chrome.runtime.sendMessage(message, () => void chrome.runtime.lastError);
    } catch (err) {
      /* worker asleep or context invalidated */
    }
  }

  // ---- now playing -------------------------------------------------------
  function readNowPlaying() {
    const bar = document.querySelector('[data-testid="now-playing-widget"]');
    if (!bar) return null;

    const link = bar.querySelector('a[href*="/track/"]');
    if (!link) return null;

    const match = (link.getAttribute('href') || '').match(TRACK_HREF);
    if (!match) return null;

    const artist = Array.from(bar.querySelectorAll('a[href*="/artist/"]'))
      .map(node => (node.textContent || '').trim())
      .filter(Boolean)
      .join(', ');

    return {
      id: match[1],
      title: (link.textContent || '').trim(),
      artist: artist,
      album: ''
    };
  }

  function pollNowPlaying() {
    const playing = readNowPlaying();
    if (!playing || playing.id === currentId) return;

    currentId = playing.id;
    remember([playing]);
    send({ type: 'nowPlaying', track: playing });
  }

  setInterval(pollNowPlaying, POLL_MS);
  pollNowPlaying();

  // ---- messages from the page world -------------------------------------
  window.addEventListener('message', event => {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;

    const data = event.data;
    if (!data || data.source !== TAG) return;

    if (data.kind === 'tracks' && Array.isArray(data.tracks)) {
      if (remember(data.tracks)) send({ type: 'tracks', tracks: data.tracks });
      return;
    }

    if (data.kind === 'lyrics' && data.payload && data.trackId) {
      const meta = known.get(data.trackId) || null;
      send({
        type: 'capture',
        record: {
          trackId: data.trackId,
          title: meta ? meta.title : '',
          artist: meta ? meta.artist : '',
          album: meta ? meta.album : '',
          resolved: Boolean(meta),
          captured: data.captured,
          payload: data.payload
        }
      });
    }
  });
})();
