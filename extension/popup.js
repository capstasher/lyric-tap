(function () {
  const $ = id => document.getElementById(id);
  const list = $('captures');
  const status = $('status');

  let captures = [];
  let nowPlayingId = null;
  let selected = null;

  function say(message, warn) {
    status.textContent = message || '';
    status.classList.toggle('warn', Boolean(warn));
  }

  function send(message) {
    return new Promise(resolve => chrome.runtime.sendMessage(message, resolve));
  }

  function label(item) {
    if (item.title) return item.title;
    return 'Unnamed track';
  }

  function render() {
    list.innerHTML = '';
    $('empty').hidden = captures.length > 0;

    captures.forEach(item => {
      const li = document.createElement('li');
      if (selected && selected.trackId === item.trackId) li.classList.add('active');
      if (!item.resolved || !item.title) li.classList.add('unresolved');

      const timed = LRC.inspect(item.payload).usable;
      if (!timed) li.classList.add('untimed');

      const title = document.createElement('span');
      title.className = 't';
      title.textContent = label(item);

      if (item.trackId === nowPlayingId) {
        const flag = document.createElement('span');
        flag.className = 'flag';
        flag.textContent = 'playing';
        title.appendChild(flag);
      }

      const line = document.createElement('span');
      line.className = 'a';
      const when = new Date(item.captured || Date.now());
      const bits = [item.artist, when.toLocaleTimeString()];
      if (!timed) bits.push('unsynced');
      line.textContent = bits.filter(Boolean).join(' — ');

      li.append(title, line);
      li.addEventListener('click', () => select(item));
      list.appendChild(li);
    });

    $('editor').hidden = !selected;
  }

  function select(item) {
    selected = item;
    $('title').value = item.title || '';
    $('artist').value = item.artist || '';
    $('album').value = item.album || '';

    const link = $('trackLink');
    link.href = `https://open.spotify.com/track/${item.trackId}`;
    link.textContent = item.trackId;

    // An unsynced payload has nothing to time against, so the LRC exports are
    // shut off rather than producing a file with every line at zero.
    const check = LRC.inspect(item.payload);
    $('saveLrc').disabled = !check.usable;
    $('copyLrc').disabled = !check.usable;

    if (!check.usable) {
      say(check.reason, true);
    } else if (!item.resolved || !item.title) {
      say('No metadata seen for this track yet — play it, or type the names in.', true);
    } else {
      say('');
    }

    render();
  }

  function options() {
    return {
      digits: parseInt($('precision').value, 10),
      gaps: $('gaps').checked,
      merge: $('merge').checked,
      shiftMs: (parseFloat($('shift').value) || 0) * 1000,
      offsetTag: parseFloat($('offsetTag').value) || 0,
      title: $('title').value,
      artist: $('artist').value,
      album: $('album').value,
      by: $('by').value
    };
  }

  function buildLrc() {
    if (!selected) return null;
    try {
      return LRC.build(selected.payload, options());
    } catch (err) {
      say(err.message, true);
      return null;
    }
  }

  function download(text, filename, addBom) {
    const payload = (addBom ? '\uFEFF' : '') + text;
    const blob = new Blob([payload], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  $('saveLrc').addEventListener('click', () => {
    const built = buildLrc();
    if (!built) return;
    download(built.text, built.name, $('bom').checked);
    say(`${built.count} lines, ${built.gaps} gap markers — ${built.name}`);
  });

  $('copyLrc').addEventListener('click', async () => {
    const built = buildLrc();
    if (!built) return;
    try {
      await navigator.clipboard.writeText(built.text);
      say(`Copied ${built.count} lines.`);
    } catch (err) {
      say('Clipboard refused; use Save instead.', true);
    }
  });

  $('saveJson').addEventListener('click', () => {
    if (!selected) return;
    const base = [$('artist').value.trim(), $('title').value.trim()].filter(Boolean).join(' - ');
    const name = (LRC.safeName(base) || selected.trackId) + '.json';
    download(JSON.stringify(selected.payload, null, 2), name, false);
    say(`Saved ${name}`);
  });

  $('forget').addEventListener('click', async () => {
    if (!selected) return;
    const reply = await send({ type: 'forget', trackId: selected.trackId });
    captures = (reply && reply.list) || [];
    selected = null;
    say('');
    render();
  });

  $('trackLink').addEventListener('click', event => {
    event.preventDefault();
    chrome.tabs.create({ url: event.currentTarget.href });
  });

  send({ type: 'list' }).then(reply => {
    captures = (reply && reply.list) || [];
    nowPlayingId = (reply && reply.nowPlayingId) || null;

    const playing = captures.find(item => item.trackId === nowPlayingId);
    if (playing) select(playing);
    else if (captures.length) select(captures[0]);
    else render();
  });
})();
