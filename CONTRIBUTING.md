# Contributing

## Getting set up

There are no dependencies and no build step for development. Clone the
repository, load `extension/` unpacked from `chrome://extensions`, and edit in
place. Reload the extension and the Spotify tab to pick up changes to the
content scripts.

Tests need Node 20 or newer:

```
npm test          # the suite
npm run build     # produce dist/lyric-tap-vX.Y.Z.zip
npm run check     # both
```

## Layout

```
extension/       the extension itself; this is what ships
  interceptor.js   page world — wraps fetch/XHR, finds lyrics and track metadata
  bridge.js        isolated world — resolves metadata by track ID, talks to the worker
  background.js    service worker — storage, back-filling, badge
  lrc.js           the LRC builder, shared with the popup
  popup.html/js    the interface
tools/           cue-bench.html, the standalone converter
test/            node:test suites
scripts/build.mjs  dependency-free zip packer
```

## House style

Vanilla JavaScript, no framework, no bundler, no runtime dependencies. The
extension should stay something a person can read end to end in one sitting and
audit before trusting it with their browser traffic. Please keep it that way —
a pull request that adds a build pipeline is unlikely to be merged.

Comments explain *why*, not *what*. The ID-keying in `bridge.js` is the model:
the code is short, the reason it exists is not obvious, so the reason is what's
written down.

## The most useful contributions

**Endpoint fixes.** Spotify changes its internals and the patterns at the top
of `interceptor.js` go stale. If you've worked out the new shape, that's the
single most valuable thing you can send. Include the URL pattern and a
redacted sample of the response structure — structure only, not anybody's
lyrics.

**Metadata shapes.** `artistsOf` and `albumOf` handle two known response
shapes. If you find a third, add it along with a test case in
`test/interceptor.test.js`.

**Player compatibility.** If an `.lrc` written here misbehaves in a player, say
which player, which option combination, and what it did. LRC is a loose format
and implementations disagree, particularly about `[offset:]`.

## Pull requests

- Run `npm run check` before opening one.
- Add tests for behaviour changes. The existing suites use placeholder lyrics
  (`Alpha`, `Bravo`) rather than real ones — please do the same.
- One concern per pull request.
- Describe what you observed, not only what you changed. For anything touching
  the interceptor, say which browser and version you tested in.

## Reporting a problem

Use the issue templates. For capture failures, the browser console on the
Spotify tab and the service worker's console (the **service worker** link on
the extension's card in `chrome://extensions`) are where the evidence lives.

Please don't attach captured lyrics to issues. The structure is what's useful
for debugging, and the words belong to whoever wrote them.
