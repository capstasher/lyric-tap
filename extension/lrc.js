// Converts a line-synced lyrics payload into LRC text.
// Same logic as the standalone Cue Bench page.
(function (global) {
  const pad = (n, w) => String(n).padStart(w, '0');
  const LEAD_IN_MIN_MS = 500;

  function lrcStamp(ms, digits) {
    ms = Math.max(0, Math.round(ms));
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const frac = digits === 3
      ? pad(ms % 1000, 3)
      : pad(Math.floor((ms % 1000) / 10), 2);
    return `[${pad(m, 2)}:${pad(s, 2)}.${frac}]`;
  }

  // Finds the object that holds the timed lines, so its sibling fields
  // (syncType and friends) stay reachable.
  function findNode(data) {
    if (!data || typeof data !== 'object') return null;
    if (Array.isArray(data.lines)) return data;
    if (Array.isArray(data)) {
      for (const value of data) {
        const found = findNode(value);
        if (found) return found;
      }
      return null;
    }
    for (const value of Object.values(data)) {
      const found = findNode(value);
      if (found) return found;
    }
    return null;
  }

  // Decides whether a payload is usable. Unsynced lyrics are a wall of text
  // with every timestamp at zero; there is nothing to build an LRC from.
  function inspect(payload) {
    const node = findNode(payload);
    if (!node || !node.lines.length) {
      return { usable: false, reason: 'No lyric lines in that payload.' };
    }

    const syncType = typeof node.syncType === 'string' ? node.syncType : '';
    const sung = node.lines.filter(l => (l.words || '').trim());
    if (!sung.length) {
      return { usable: false, syncType, reason: 'Every line in that payload is blank.' };
    }

    const stamps = new Set(sung.map(l => parseInt(l.startTimeMs, 10) || 0));
    const timed = stamps.size > 1;

    if (/unsync/i.test(syncType) || !timed) {
      return {
        usable: false,
        syncType,
        reason: 'These lyrics came back unsynced — no timings to build from.'
      };
    }

    return { usable: true, syncType, lines: node.lines };
  }

  function safeName(text) {
    return String(text).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
  }

  function build(payload, options) {
    const opts = Object.assign({
      digits: 2,
      gaps: true,
      merge: true,
      shiftMs: 0,
      offsetTag: 0,
      title: '',
      artist: '',
      album: '',
      by: ''
    }, options || {});

    const check = inspect(payload);
    if (!check.usable) throw new Error(check.reason);

    const entries = check.lines
      .map(l => ({ start: parseInt(l.startTimeMs, 10) || 0, words: (l.words || '').trim() }))
      .sort((a, b) => a.start - b.start);

    const items = [];
    let blanks = 0;

    entries.forEach(entry => {
      if (entry.words) {
        items.push({ t: entry.start + opts.shiftMs, text: entry.words });
      } else if (opts.gaps && items.length && items[items.length - 1].text) {
        items.push({ t: entry.start + opts.shiftMs, text: '' });
        blanks++;
      }
    });

    if (!items.length) throw new Error('Every line in that payload is blank.');

    // Lead-in: clear the display over the intro rather than parking the first
    // line on screen from the moment the track starts.
    if (opts.gaps && items[0].t >= LEAD_IN_MIN_MS) {
      items.unshift({ t: 0, text: '' });
      blanks++;
    }

    const rows = [];
    const seen = new Map();
    items.forEach(item => {
      if (opts.merge && item.text && seen.has(item.text)) {
        seen.get(item.text).times.push(item.t);
        return;
      }
      const row = { text: item.text, times: [item.t] };
      if (opts.merge && item.text) seen.set(item.text, row);
      rows.push(row);
    });

    const out = [];
    const tag = (key, value) => { if (value) out.push(`[${key}:${value}]`); };
    tag('ti', opts.title.trim());
    tag('ar', opts.artist.trim());
    tag('al', opts.album.trim());
    tag('by', opts.by.trim());
    if (opts.offsetTag) {
      out.push(`[offset:${opts.offsetTag > 0 ? '+' : ''}${Math.round(opts.offsetTag)}]`);
    }
    if (out.length) out.push('');

    rows.forEach(row => {
      const stamps = row.times
        .sort((a, b) => a - b)
        .map(t => lrcStamp(t, opts.digits))
        .join('');
      out.push(stamps + row.text);
    });

    const base = [opts.artist.trim(), opts.title.trim()].filter(Boolean).join(' - ');

    return {
      text: out.join('\n') + '\n',
      name: (safeName(base) || 'lyrics') + '.lrc',
      count: items.filter(i => i.text).length,
      gaps: blanks
    };
  }

  global.LRC = { build, inspect, safeName };
})(this);
