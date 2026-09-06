# Poker reactions — 2026-09-06

## Reproduced cause

In a real 390 px browser the reaction was at y=483..535, while its
`rp-pixel-build rp-seat-build-shell` ancestor was y=530..590 with computed
`clip-path: inset(0% 0px 0px)`. The reaction existed, but only its bottom edge
could paint. Raising z-index inside that clipping ancestor cannot fix this.

There was also a single reaction slot for all players, uncancelled expiry
timeouts and an offline `undefined === undefined` sender comparison that could
assign the local reaction to bots without user IDs. Online send errors were
silently ignored.

## Changes

- Render each reaction outside the avatar's masked/animated shell. The upper
  rail uses an inward placement so the table boundary cannot crop the bubble.
- Key reactions by actual user ID (or local seat ID in practice); keep independent
  5-second timers. Old expiry callbacks and failed requests cannot erase newer
  reactions. Table exit disposes all timers.
- Display the sender's selection immediately and keep existing server SSE
  broadcast for other clients. Failed sending reports a visible notice.
- Keep a readable label during sticker loading/failure, rather than an empty
  canvas. No new assets, libraries, polling or persistent database writes.

## Verification

- `test:poker-reactions`: ownership, concurrent senders, replacement, expiry,
  stale request/timeout and disposal.
- `test:match-emoji`: three independent clients on an isolated compiled backend
  receive both senders' actual SSE events; IDs match each perspective's seats.
  External bot/database/payment integrations are explicitly disabled.
- Browser fixture using the real components: all 10 bubbles remain inside the
  table at 320, 390 and 768 px, with no clipped PixelBuild ancestor.
- Both tests are included in `prepare:release`. No server code or database
  migrations are required; this fix can be deployed to the static frontend only.
