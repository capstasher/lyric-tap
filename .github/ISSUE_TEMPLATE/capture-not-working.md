---
name: Captures stopped working
about: Nothing appears in the list, or captures appear but never get names
title: '[capture] '
labels: ['endpoint']
---

<!--
This is the most likely failure, and usually means Spotify changed something.
Please don't paste captured lyrics into the issue — the structure is what's
useful, not the words.
-->

## What happens

<!-- Nothing captures at all / captures appear but stay "Unnamed track" / something else -->

## Checks

- [ ] The lyrics panel was open on the track
- [ ] The Spotify tab was reloaded after installing or updating the extension
- [ ] Lyrics are actually available for this track in the player

## Environment

- Browser and version:
- Extension version:
- Operating system:

## Console output

<!--
Two places to look:
  1. devtools on the Spotify tab
  2. the "service worker" link on the extension's card in chrome://extensions
Paste any errors from either.
-->

```
```

## The request, if you can see it

<!--
With devtools open on the Spotify tab, open the lyrics panel and watch the
network tab. If the lyrics request now goes somewhere other than
/color-lyrics/v2/track/, the new URL pattern is exactly what's needed here.
Structure only please — no response bodies containing lyrics.
-->

- URL pattern of the lyrics request:
- Anything else you noticed:
