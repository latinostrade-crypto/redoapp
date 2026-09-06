# Changelog

## Unreleased — Resistance UI and Render preparation (2026-09-06)

- Resistance game menus, shared dark controls, game-specific banners and compact profile wallet control.
- Pixel banner transitions, poker chip presentation and improved hand-result UI.
- Pixel-identical lossless menu assets, deferred UNO deck loading, cached wallet chunk and visibility-aware sticker playback.
- Build-time backend compilation, lower-overhead health checks and SSE delivery, bounded slow-client handling and stable Blackjack subscriptions.
- Reproducible Render builds, hashed-asset cache headers, scoped build filters and an audited dependency lockfile.
- Local release gates and an explicit commit manifest; no deployment or paid-launch approval implied.
- Eliminate idle outbox rewrites; acknowledge immutable global snapshots only after successful writes and drain concurrent persistence requests.
- Scope backend-only Supabase RPC/view permissions, retain the existing Render Starter service, and detach the obsolete YOapp Blueprint without deleting resources.

## Version 3

Recent live updates:

- private room deep-link auto-join
- referral activation and Telegram notifications
- game-over UI improvements and menu return flow
- XP sync fixes
- PVP rewards UI cleanup
- `1%` referral share from referred public-match payouts
- referral bonus history entries
- total referral earnings widget

## Version 2

Production integration phase:

- Telegram Mini App launch
- direct links for referrals and rooms
- persistent runtime state
- Render deployment notes
- TON verification and wallet flow documentation

## Version 1

Initial documented state:

- offline mode
- public PVP
- private rooms
- wallet-linked ticket economy
- queue, room, and settlement logic
