# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.0 — 2026-10-11

First public release.

Captures the synced lyrics the Spotify web player fetches for a track and
writes them out as an `.lrc` file.

### Added

- Lyrics capture by wrapping `fetch` and `XMLHttpRequest` in the page's own
  world, since Manifest V3 cannot read response bodies any other way.
- Track metadata harvested from the player's GraphQL traffic and keyed by track
  ID, so a lyric prefetched for a queued track is named correctly rather than
  inheriting whatever happened to be playing at the time.
- Back-filling for captures that arrive before their track's metadata does.
- LRC export with ID tags, a timestamp shift, an `[offset:]` tag, hundredth or
  millisecond precision, and an optional UTF-8 byte-order mark.
- A blank line at `[00:00.00]` and at each instrumental gap, so the display
  clears instead of parking a line on screen.
- Stacked timestamps on repeated lines, written once with all their times.
- Refusal to build from unsynced lyrics, detected both from an explicit
  `syncType` and from the case where no two lines carry different timings.
- Raw JSON export.
- `tools/cue-bench.html`, a standalone converter covering `.lrc`, SubRip,
  WebVTT and OpenShot caption cues.
- Test suites for the LRC builder and the interceptor.
