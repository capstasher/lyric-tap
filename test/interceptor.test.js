import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'extension', 'interceptor.js'), 'utf8');

const ORIGIN = 'https://open.spotify.com';
const LYRICS_URL = tid => `https://spclient.wg.spotify.com/color-lyrics/v2/track/${tid}?format=json`;
const GRAPHQL_URL = 'https://api-partner.spotify.com/pathfinder/v1/query?operationName=fetchPlaylist';

const id = ch => String(ch).repeat(22).slice(0, 22);

// Builds a page-world sandbox, installs the interceptor into it, and returns
// handles for driving fetch/XHR and reading what was posted back.
function install() {
  const posted = [];
  const responses = new Map();

  class FakeXHR {
    open(method, url) { this.__url = url; }
    send() {
      this.responseText = responses.get(this.__url) || '';
      (this.__listeners || []).forEach(fn => fn());
    }
    addEventListener(name, fn) {
      if (name !== 'load') return;
      (this.__listeners ||= []).push(fn);
    }
  }

  const window = {
    location: { origin: ORIGIN },
    postMessage(message, targetOrigin) { posted.push({ message, targetOrigin }); },
    fetch(url) {
      const body = responses.get(url);
      if (body === undefined) return Promise.reject(new Error('no stub for ' + url));
      return Promise.resolve({ clone: () => ({ text: () => Promise.resolve(body) }) });
    }
  };

  const context = vm.createContext({ window, XMLHttpRequest: FakeXHR, Promise, JSON, Object, Array, String, Date });
  vm.runInContext(source, context);

  return {
    posted,
    stub: (url, body) => responses.set(url, typeof body === 'string' ? body : JSON.stringify(body)),
    fetch: url => window.fetch(url),
    xhr: url => { const x = new FakeXHR(); x.open('GET', url); x.send(); },
    window
  };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

// Objects built inside the VM context carry that realm's prototypes, which
// strict deepEqual refuses to match. Round-trip them into this realm first.
const plain = value => JSON.parse(JSON.stringify(value));

const lyricsBody = {
  lyrics: {
    syncType: 'LINE_SYNCED',
    lines: [{ startTimeMs: '1000', words: 'Alpha' }, { startTimeMs: '4000', words: 'Bravo' }]
  },
  colors: { background: -1 }
};

test('captures a lyrics response seen through fetch', async () => {
  const env = install();
  const url = LYRICS_URL(id('a'));
  env.stub(url, lyricsBody);

  await env.fetch(url);
  await settle();

  assert.equal(env.posted.length, 1);
  const { message, targetOrigin } = env.posted[0];
  assert.equal(targetOrigin, ORIGIN);
  assert.equal(message.source, 'lyric-tap');
  assert.equal(message.kind, 'lyrics');
  assert.equal(message.trackId, id('a'));
  assert.equal(message.payload.lyrics.lines.length, 2);
  assert.equal(typeof message.captured, 'number');
});

test('captures a lyrics response seen through XMLHttpRequest', async () => {
  const env = install();
  const url = LYRICS_URL(id('b'));
  env.stub(url, lyricsBody);

  env.xhr(url);
  await settle();

  assert.equal(env.posted.length, 1);
  assert.equal(env.posted[0].message.trackId, id('b'));
});

test('ignores unrelated traffic entirely', async () => {
  const env = install();
  env.stub('https://open.spotify.com/api/something', { hello: 'world' });

  await env.fetch('https://open.spotify.com/api/something');
  await settle();

  assert.equal(env.posted.length, 0);
});

test('ignores a lyrics URL whose body is not lyrics', async () => {
  const env = install();
  const url = LYRICS_URL(id('c'));
  env.stub(url, { error: 'not found' });

  await env.fetch(url);
  await settle();

  assert.equal(env.posted.length, 0);
});

test('survives a malformed body without throwing', async () => {
  const env = install();
  const url = LYRICS_URL(id('d'));
  env.stub(url, '{ this is not json');

  await assert.doesNotReject(env.fetch(url));
  await settle();

  assert.equal(env.posted.length, 0);
});

test('harvests tracks from the nested GraphQL shape', async () => {
  const env = install();
  env.stub(GRAPHQL_URL, {
    data: { playlistV2: { content: { items: [
      { itemV2: { data: {
        __typename: 'Track',
        uri: `spotify:track:${id('e')}`,
        name: 'First Track',
        artists: { items: [{ profile: { name: 'Band One' } }, { profile: { name: 'Guest' } }] },
        albumOfTrack: { name: 'Album One' }
      } } }
    ] } } }
  });

  await env.fetch(GRAPHQL_URL);
  await settle();

  assert.equal(env.posted.length, 1);
  const message = env.posted[0].message;
  assert.equal(message.kind, 'tracks');
  assert.deepEqual(plain(message.tracks), [{
    id: id('e'),
    title: 'First Track',
    artist: 'Band One, Guest',
    album: 'Album One'
  }]);
});

test('harvests tracks from the flat shape', async () => {
  const env = install();
  env.stub(GRAPHQL_URL, {
    tracks: [{
      uri: `spotify:track:${id('f')}`,
      name: 'Third Track',
      artists: [{ name: 'Band Two' }],
      album: { name: 'Album Two' }
    }]
  });

  await env.fetch(GRAPHQL_URL);
  await settle();

  assert.deepEqual(plain(env.posted[0].message.tracks), [{
    id: id('f'),
    title: 'Third Track',
    artist: 'Band Two',
    album: 'Album Two'
  }]);
});

test('does not mistake artists, albums or episodes for tracks', async () => {
  const env = install();
  env.stub(GRAPHQL_URL, {
    data: {
      artist: { uri: 'spotify:artist:z', name: 'Not A Track' },
      album: { uri: 'spotify:album:w', name: 'Also Not A Track' },
      episode: { uri: 'spotify:episode:e', name: 'Nor This' }
    }
  });

  await env.fetch(GRAPHQL_URL);
  await settle();

  assert.equal(env.posted.length, 0);
});

test('deduplicates a track repeated within one response', async () => {
  const env = install();
  const entry = name => ({ uri: `spotify:track:${id('g')}`, name, artists: [{ name: 'Band' }] });
  env.stub(GRAPHQL_URL, { a: entry('Same Track'), b: entry('Same Track') });

  await env.fetch(GRAPHQL_URL);
  await settle();

  assert.equal(env.posted[0].message.tracks.length, 1);
});

test('returns the original response object to the caller', async () => {
  const env = install();
  const url = LYRICS_URL(id('h'));
  env.stub(url, lyricsBody);

  const result = await env.fetch(url);
  assert.equal(typeof result.clone, 'function');
});

test('patches fetch without losing the native implementation', () => {
  const env = install();
  assert.equal(typeof env.window.fetch, 'function');
});
