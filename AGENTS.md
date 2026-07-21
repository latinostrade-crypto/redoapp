# Redoapp repository guide

## Product surfaces

This repository contains two user-facing surfaces:

1. `ComicExperience` — the public interactive story for normal web visitors.
2. The existing Redoapp Telegram Mini App game — practice, public PVP,
   private rooms, wallet, tickets, quests, XP, referrals, and realtime play.

Do not remove, replace, or keep the game invisibly mounted behind the story.
The two surfaces must remain independently lazy-loaded.

## Routing contract

- Normal browser root: open the story.
- `?play=1`: open the game.
- Telegram Mini App launch: open the game directly.
- `?story=1`: explicitly open the story, including for visual QA.
- Every story game CTA, including “Skip to game”, must open the canonical
  referred Telegram Mini App
  `https://t.me/redo_appbot/app?startapp=ref_KNVPOU`.
- Preserve Telegram `startapp=room_*` and `startapp=ref_*` behaviour.

## Source of truth

Read these files before changing the comic:

- `docs/brief-analysis.md`
- `docs/asset-inventory.md`
- `docs/storyboard.md`
- `docs/motion-system.md`
- `docs/performance-plan.md`

Product claims must remain consistent with `README.md`. Do not invent token,
wallet, reward, payout, matchmaking, or scale promises.

## Asset rules

- Use the real images in `FOR AI/WEBSITE` and the existing brand assets.
- The 12 story JPEG files are opaque, complete compositions. Do not pretend
  that characters or props are transparent layers.
- Animate crops, frames, masks, object position, scale, and whole-image panel
  transitions. Every normal-motion image change must use the reusable fine
  particle-dust transition: sample real image colors plus DOM text/panel
  geometry, scatter/gather the complete scene surface on one canvas per scene,
  and never create a DOM node for each particle.
- Keep pixel edges crisp; avoid long-running blur or photorealistic additions.
- The blue object on the pier is not documented as TON, TKT, a wallet, or a
  reward. The pink heart is an emotional motif, not currency.
- `REDO!` is a brand impact word, not an undo/replay card mechanic.

## Architecture

- Keep story content, order, image paths, copy, timing, transition preset, and
  desktop/mobile layout in typed configuration.
- Keep `ComicExperience`, `ComicScene`, speech bubbles, sound effects,
  progress, and reduced-motion rendering as small focused components.
- Use GSAP + ScrollTrigger as the only owner of scroll-driven transforms and
  opacity. Existing Motion usage may remain inside the game UI.
- A scene owns one reversible master timeline and its own cleanup.
- Never call global `ScrollTrigger.killAll()`.
- Do not update React state on every scroll frame.
- Keep native vertical scrolling; do not add a custom smooth-scroll library.

## Motion and accessibility

- Normal mode: reversible pin/scrub timelines with several distinct
  transition presets.
- Reduced motion: semantic sections in normal document flow; no pin,
  parallax, shake, flash, snap zoom, or particle dissolve.
- All important text must exist as HTML, not only in images.
- Provide meaningful alt text for the primary image; decorative duplicates
  use empty alt and `aria-hidden`.
- Preserve visible focus, keyboard order, touch targets of at least 44 px,
  and 200% zoom without horizontal overflow.
- Do not autoplay audio.

## Mobile and Telegram

- Use `100svh` as stable mobile geometry with `100vh` fallback; `100dvh` may
  fill the current viewport but must not continuously change pin distance.
- Respect `env(safe-area-inset-*)` and Telegram safe-area data when available.
- Mobile choreography is shorter and simpler: one primary and at most one
  secondary large image, reduced parallax, smaller impact shake.
- Do not block native `pan-y`, depend on hover, or request fullscreen for the
  story automatically.

## Performance

- Do not eagerly load all story images, the card deck, wallet UI, and the game
  at once.
- Give every raster explicit dimensions/aspect ratio.
- Load the first story image eagerly and later images lazily.
- Keep full-size masked raster layers to a practical minimum.
- Animate mostly `transform` and `opacity`; use masks briefly.
- Backend wake-up and card preloading belong to the game entry, not the story
  entry.

## Required validation

Before considering comic work complete, run:

```bash
npm run lint
npm run build
npm run test:traffic
```

Also verify the story in a real browser at desktop and mobile widths, test
reverse scrolling and `prefers-reduced-motion`, inspect the console, and check
that all image requests return successfully. Confirm `?play=1`, `?story=1`,
and the story CTA.
