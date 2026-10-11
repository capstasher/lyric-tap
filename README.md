# Lyric Tap

A Chrome/Brave extension that saves the synced lyrics of the track playing in
the Spotify web player as an `.lrc` file — the format MiniLyrics, foobar2000,
VLC and most desktop players read.

Built for a specific nuisance: you own the CD, you're playing the CD, and you
want the words to scroll along with it.

No Spicetify, no patched client, no account credentials. The extension reads
responses the web player has already fetched for you and reformats them.

## Install

**From a release.** Download `lyric-tap-vX.Y.Z.zip` from
[Releases](../../releases) and unpack it. Open `chrome://extensions` (or
`brave://extensions`), turn on **Developer mode**, click **Load unpacked**, and
select the unpacked folder.

**From source.** Clone the repository and load the `extension/` folder the same
way.

Either way, reload any Spotify tab that was already open — the interceptor has
to be in place before the page's own scripts run.

## Use

1. Play a track on `open.spotify.com`.
2. **Open the lyrics panel.** This is the step that matters: the player only
   requests lyrics when the panel is opened, and the extension only sees what
   the player requests.
3. Click the toolbar button. The track appears in the list, with the one
   currently playing marked and selected first.
4. Check the track ID beneath the fields if you want to be certain, adjust the
   tags, then **Save .lrc**.
5. Rename the file to match your audio file's base name and drop it alongside.

The ten most recent captures are kept. Older ones fall off on their own, and
re-capturing a track replaces its existing entry.

## Export options

| Control | What it does |
| --- | --- |
| Title / Artist / Album / Made by | Written as `[ti:]`, `[ar:]`, `[al:]`, `[by:]`. Empty fields are omitted. |
| Shift | Bakes a correction into every timestamp, in seconds. Negative pulls earlier. |
| offset tag | Writes `[offset:N]` in milliseconds and leaves the timestamps alone. |
| Timestamps | Hundredths `[mm:ss.xx]` or milliseconds `[mm:ss.xxx]`. |
| Blank lines at intro and gaps | An empty line at `[00:00.00]` plus one at each instrumental, so nothing sits on screen before the singing starts. On by default. |
| Stack timestamps | Repeated lines written once carrying all their times. On by default. |
| UTF-8 byte-order mark | Stops older Windows players guessing at the encoding. On by default. |

`Shift` and `offset` solve the same problem differently. Shift is permanent and
universally understood; the offset tag is reversible but depends on the player
honouring it, and players disagree about which direction a positive value
moves things. Test before trusting it.

## Also included

`tools/cue-bench.html` is a standalone page — open it in any browser, no
install — that takes the same JSON and converts it to `.lrc`, SubRip `.srt`,
WebVTT `.vtt`, or bare cue text for OpenShot's Caption effect. Useful if you
want subtitles rather than lyrics, or if you'd rather not run an extension. The
extension's **Raw JSON** button gives you the input it expects.

## How it works

`interceptor.js` runs in the page's own JavaScript world and wraps `fetch` and
`XMLHttpRequest`, watching for two things: the colour-lyrics endpoint, whose
body is the timed payload, and the player's GraphQL traffic, which it walks for
anything shaped like a track entity — a `spotify:track:` URI with a name,
artists and album beside it.

`bridge.js` runs in the isolated world, keeps those tracks in a map keyed by ID,
and hands captures to the service worker with the metadata for *that specific
track ID* attached.

The keying is the whole trick. **The lyrics response contains no title, artist
or album** — only the lines, provider, language and a colour scheme. The sole
identifier in the exchange is the track ID in the request URL. Since the player
prefetches lyrics for queued tracks, reading the now-playing bar at capture time
names the wrong song roughly as often as the right one. Resolving by ID fixes
it, and a capture that arrives before its name does gets back-filled when the
metadata turns up.

Reading the response body requires the page-world wrapper because Manifest V3
removed blocking `webRequest`, and neither `declarativeNetRequest` nor the
non-blocking `webRequest` can see bodies. The remaining alternative is
`chrome.debugger`, which works but puts a "being debugged" banner across the
browser.

## Privacy

- No network requests of its own. It only observes traffic the page already made.
- No access to, or storage of, session tokens or credentials.
- No telemetry, no analytics, no remote endpoints.
- Captures live in `chrome.storage.local` on your machine and nowhere else.
- Permissions are `storage` plus content scripts scoped to `open.spotify.com`.

## Limits

- **Lyrics only arrive when you open the panel.** There's no background fetch.
- **A capture can outrun its name.** Lyrics for a queued track sometimes land
  before that track's metadata. The entry shows in italics as "Unnamed track"
  with its ID, and names itself once the metadata appears. The fields are
  editable regardless.
- **Unsynced lyrics are refused.** Some tracks come back as a block of text with
  every timestamp at zero. Those entries get a dashed border and the `.lrc`
  buttons switch off; **Raw JSON** still works. An LRC built from them would
  fire every line at the start of the track.
- **Line-synced only.** The payload carries per-line timings, so there's no
  word-level karaoke to extract even where a player would show it.
- **Availability varies** by track, region and account type.
- **Selectors and endpoints rot.** See below.
- `world: "MAIN"` content scripts need Chrome 111+, so Brave 1.49+.

## When it stops working

Spotify changes its internals without notice. Two things are likely to break,
and both are one-line fixes:

- **Nothing captures at all.** The endpoint moved. Open devtools on the Spotify
  tab, watch the request fired when the lyrics panel opens, and update the
  `LYRICS` pattern at the top of `extension/interceptor.js`.
- **Captures appear but never get names.** The metadata shape changed. Update
  the `METADATA` pattern, or `artistsOf`/`albumOf` in the same file.

Issues and pull requests welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## A note on what this is for

This reformats data the Spotify web player has already delivered to your own
browser, for your own offline listening. Spotify's terms don't contemplate
extracting content from the player, and the lyrics themselves are licensed from
a third-party provider and aren't yours to redistribute. Keep the files to
yourself and this stays what it's meant to be: a way to read along with music
you already own.

## Licence

[MIT](LICENSE). The licence covers this extension's code, not anything you
capture with it.
