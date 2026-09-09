# CODEX_DESIGN_REBUILD.md

## Mission

Redesign the existing multiplayer poker web app into a distinctive premium **Resistance** product while preserving the app's complete existing functionality.

This is NOT a rewrite from scratch.

The current application is the functional source of truth:
- game logic
- multiplayer behavior
- backend integration
- WebSocket / realtime events
- authentication
- wallet integration
- tournaments
- matchmaking
- tables
- balances
- bets
- user profiles
- inventory / gifts / NFTs
- routing
- API contracts
- state management

The task is to rebuild the **visual system, UX presentation, component layer, layout and motion design** around the existing functionality.

Do not remove working features just to simplify the redesign.

---

# 1. Product identity

The product should feel like:

**Premium dark multiplayer poker interface built as a clandestine Resistance network — minimal, cinematic, tactical and social.**

Keywords:

- Resistance
- underground network
- private club
- encrypted communication
- anonymous operatives
- tactical
- premium
- cinematic
- modern
- restrained
- high-stakes
- social PvP
- clean
- fast

It must NOT feel like:

- pixel-art UI
- generic crypto casino
- Stake clone
- old green poker table
- Vegas casino
- cyberpunk cliché
- neon overload
- hacker terminal parody
- Web3 purple-gradient landing page
- military simulator
- childish game UI

Pixel-art can remain inside collectible artwork, character art, NFT assets, stickers, cards or avatars if those assets already exist.

The application UI itself must NOT use pixel-art as its primary design language.

---

# 2. Core design concept

Think of the application as a hidden multiplayer network.

Poker is the core mechanic.

Resistance is the world around it.

Use Resistance terminology selectively to create atmosphere without making normal poker UX confusing.

Good examples:

- Resistance Network
- Operative
- Signal
- Transmission
- Classified Event
- Access Granted
- Identity Verified
- Signal Lost
- Pot Captured
- Identities Revealed

Do NOT rename universally understood poker actions.

Keep:

- Fold
- Check
- Call
- Bet
- Raise
- All-in

Do not replace them with role-play terminology.

Functionality and clarity always win over theme.

---

# 3. Visual direction

## Base palette

Start with a near-black neutral system.

Suggested starting tokens:

```css
:root {
  --bg-root: #080909;
  --bg-surface: #0E1011;
  --bg-surface-2: #131516;
  --bg-elevated: #181A1C;

  --text-primary: rgba(255,255,255,.94);
  --text-secondary: rgba(255,255,255,.58);
  --text-tertiary: rgba(255,255,255,.36);

  --border-soft: rgba(255,255,255,.07);
  --border-medium: rgba(255,255,255,.12);

  --danger: #FF4D45;
  --success: #77D68A;
}
```

Choose ONE primary Resistance accent after inspecting the current brand assets.

Preferred directions:

1. signal red / red-orange
2. radioactive yellow-green
3. warm warning orange

Do not use multiple competing neon accents.

The accent must be rare enough to communicate importance.

Use it for:
- primary CTA
- current turn
- active selection
- important status
- critical event
- timer pressure
- winner state

Do not paint every component with the accent.

---

# 4. Typography

Primary UI font:

Prefer a modern neutral grotesk already available in the project.

Good references:
- Inter
- Geist
- similar high-quality grotesk

Secondary typography may use a condensed or monospace face ONLY for:
- system labels
- IDs
- transmissions
- timestamps
- table identifiers
- small technical metadata

Avoid making the entire interface monospace.

Typography hierarchy should carry more visual weight than decorative effects.

Use:
- strong large numeric values
- clean hierarchy
- compact labels
- generous spacing
- high legibility on mobile

---

# 5. Shape language

Avoid excessively rounded mobile SaaS cards.

Suggested radius system:

```css
--radius-xs: 6px;
--radius-sm: 9px;
--radius-md: 12px;
--radius-lg: 16px;
--radius-xl: 22px;
```

Poker cards may use their own physical-card radius.

Use thin borders instead of excessive shadows.

Surfaces should feel layered, not floating everywhere.

Avoid glassmorphism as the default design.

Blur may be used only for specific overlays or menus.

---

# 6. Texture

The app may use extremely subtle environmental texture:

- fine grain
- faint noise
- restrained vignette
- soft radial light around active game areas
- thin network geometry
- low-opacity grid fragments
- tiny signal indicators

These effects must never reduce readability.

Do not add noisy decorative backgrounds behind every panel.

---

# 7. Motion language

Motion is important to the brand.

It should feel:
- fast
- deliberate
- physical
- restrained
- slightly cinematic

Default UI interactions:
- 120–180 ms

Larger game transitions:
- 220–450 ms

Avoid:
- constant pulsing
- floating elements everywhere
- large bounce effects
- excessive glow
- random glitch effects

Glitch should be extremely rare.

Use motion primarily to communicate:
- whose turn it is
- cards being dealt
- chips entering the pot
- a bet being placed
- all-in
- showdown
- winner
- player joining/leaving
- reconnecting
- tournament state changes

Respect `prefers-reduced-motion`.

---

# 8. Poker table

The poker table is the visual centerpiece.

Do NOT default to a large green felt oval.

Explore a dark digital arena.

The central playing field can use:
- subtle radial lighting
- restrained geometric boundary
- dark matte surface
- faint concentric signal rings
- low-opacity network lines

The table should work on:
- desktop
- tablet
- Telegram Mini App
- mobile portrait
- mobile landscape where supported

Player positions must remain extremely clear.

The current player / active turn must be instantly understandable.

Do not sacrifice game readability for atmosphere.

---

# 9. Player seat component

Create a reusable `PlayerSeat` design system component.

It should support all real game states:

- empty seat
- occupied
- current user
- active turn
- disconnected
- reconnecting
- folded
- all-in
- winner
- eliminated
- spectator if supported

Potential data:

- avatar
- username
- stack
- current bet
- status
- timer
- cards / card backs
- dealer / blind markers
- optional streak / reputation / cosmetic

Do not show everything at once.

Use progressive disclosure and hierarchy.

---

# 10. Poker cards

Cards should feel physical and premium without copying traditional casino design.

Goals:
- high readability
- strong rank/suit recognition
- distinctive proportions
- good mobile visibility
- beautiful deal / flip animations

Prefer clean typography and oversized suit symbolism over decorative casino ornament.

Do not make card faces overly dark if that hurts immediate recognition.

---

# 11. Primary game actions

Create a dedicated action system:

- Fold
- Check
- Call
- Bet
- Raise
- All-in

Do not present every action as a giant brightly colored button.

Suggested hierarchy:

- Fold = low emphasis / destructive secondary
- Check = neutral
- Call = contextual primary
- Raise / Bet = strong primary
- All-in = special high-risk state

Bet controls must be extremely easy to use with one hand on mobile.

Support the existing functionality, including current:
- slider
- input
- presets
- min/max
- pot percentages
- confirm behavior

Do not delete betting capabilities while redesigning.

---

# 12. Game-state moments

Give important poker moments their own animation grammar.

Examples:

## Player joins
`OPERATIVE JOINED`

## Disconnect
`SIGNAL LOST`

## Reconnect
`SIGNAL RESTORED`

## Showdown
`IDENTITIES REVEALED`

## Winner
`POT CAPTURED`

## All-in
`ALL IN`

Optional secondary atmospheric text:
`NO RETREAT`

Atmospheric copy must never obscure actual financial/game information.

---

# 13. Lobby

The lobby should feel like entering an active network rather than browsing generic casino tables.

Potential structure:

- active tables
- quick play
- friends / private rooms
- tournaments
- events
- featured game
- recent activity
- online players

A room can visually behave like a live network node.

Example:

```
ROOM 047
3 / 4 PLAYERS
BUY-IN 500
LIVE
```

Do not over-theme all terminology.

User comprehension comes first.

---

# 14. Tournaments and events

Tournament pages should feel more editorial and cinematic than standard tables.

Resistance language can be stronger here.

Examples:

```
TRANSMISSION 07
64 PLAYERS
10,000 PRIZE POOL
REGISTRATION 01:42:18
```

Holder-gated event:

```
CLASSIFIED EVENT
ACCESS: AYANAMI HOLDERS
```

Clearly show:
- prize
- entry
- eligibility
- registration status
- participants
- start time
- rules
- rewards
- live status

---

# 15. Profile

Treat profiles like identities inside the network.

Possible atmosphere:

- Operative ID
- avatar / character
- poker stats
- recent games
- wins
- tournament results
- inventory
- cosmetics
- achievements
- gifts / NFT ownership if already supported

Do not turn the profile into an unreadable fake terminal.

---

# 16. Navigation

Navigation must remain extremely clear.

For mobile / Telegram Mini App, likely prioritize:

- Play
- Events
- Inventory / Collection
- Profile

Use the actual existing application information architecture as the source of truth.

Do not invent routes that duplicate existing functionality.

---

# 17. Component system

Before redesigning every screen, build a reusable UI foundation.

Create or consolidate primitives such as:

- Button
- IconButton
- TextButton
- Surface
- Card
- Modal
- BottomSheet
- Drawer
- Tooltip
- Dropdown
- ContextMenu
- Tabs
- SegmentedControl
- Badge
- StatusDot
- Avatar
- Input
- NumberInput
- Slider
- Progress
- Skeleton
- Toast
- EmptyState
- ErrorState
- PlayerSeat
- PlayingCard
- ChipStack
- PotDisplay
- BetControls
- TableStatus
- TournamentCard
- EventCard

Prefer extending the project's existing component architecture rather than introducing a second competing system.

---

# 18. Design tokens

Centralize visual decisions.

Create tokens for:

- colors
- typography
- spacing
- radii
- borders
- shadows
- z-index
- motion durations
- easing
- breakpoints
- safe-area spacing

Avoid hardcoded random values spread across components.

Example spacing scale:

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
```

Use the framework / styling system already present in the repo where practical.

---

# 19. Telegram Mini App requirements

If this application runs inside Telegram, preserve and test:

- Telegram viewport behavior
- safe areas
- dynamic viewport height
- mobile keyboard
- touch targets
- Telegram theme integration if currently used
- back button behavior
- closing confirmation if currently used
- wallet flows
- deep links
- authentication
- platform-specific APIs

Do not redesign these integrations without understanding their current implementation.

The app must feel native enough inside Telegram while retaining its own strong visual identity.

---

# 20. Responsive behavior

Design mobile-first where appropriate, but do not degrade desktop.

Test at minimum:

- 320 px
- 360 px
- 390 px
- 430 px
- 768 px
- 1024 px
- 1440 px

Important:
- no clipped cards
- no hidden actions
- no inaccessible betting controls
- no player seat collisions
- no unusable modal sizes
- no content under safe areas

---

# 21. Accessibility

Maintain:

- sufficient contrast
- keyboard navigation where applicable
- visible focus
- semantic buttons
- accessible form labels
- reduced motion
- no color-only critical information
- appropriate touch target sizes

Do not disable accessibility to achieve a visual effect.

---

# 22. Functional preservation — HARD RULES

The redesign must preserve all current real behavior.

Before changing a feature:

1. locate its current component
2. understand its state
3. identify API calls
4. identify WebSocket events
5. identify route dependencies
6. identify wallet/auth dependencies
7. identify loading/error states
8. identify mobile-specific behavior

Do NOT silently replace real data with mock data.

Do NOT remove real handlers because they complicate the new design.

Do NOT alter backend contracts for cosmetic reasons.

Do NOT modify game rules.

Do NOT change multiplayer synchronization logic unless a real bug is found and the change is explicitly documented.

Do NOT rename API fields or socket event names just to improve frontend naming.

Do NOT rewrite stable infrastructure without necessity.

---

# 23. Work strategy

## Phase 1 — Audit

Inspect the entire project before making large changes.

Produce an internal inventory of:

- routes
- screens
- components
- global styles
- game-state components
- realtime code
- authentication
- wallet code
- Telegram code
- API layer
- state management
- reusable UI
- duplicated UI
- responsive issues

Find the actual application entry points.

Do not assume architecture from filenames alone.

---

## Phase 2 — Foundation

Build the new design foundation first:

- theme tokens
- typography
- spacing
- core components
- surfaces
- navigation shell
- motion primitives

Do not redesign every screen independently.

---

## Phase 3 — Poker table prototype

Redesign one fully functional poker table before propagating the language throughout the app.

It must use real existing game state.

Verify:
- seats
- actions
- timers
- cards
- chips
- pot
- betting
- all-in
- folded states
- showdown
- winner
- disconnect/reconnect
- responsive behavior

This screen defines the final visual language.

---

## Phase 4 — Main flows

Then migrate:

1. lobby
2. room creation / joining
3. poker table
4. tournaments
5. events
6. profile
7. inventory / collection
8. settings
9. authentication / onboarding
10. error / loading / reconnect states

Adapt the list to the actual routes in the repository.

---

# 24. Implementation principles

Prefer:
- small reusable components
- semantic tokens
- CSS variables
- predictable layout systems
- CSS Grid/Flexbox
- lightweight animations
- existing project dependencies

Avoid introducing a large UI library unless there is a clear technical reason.

Do not import a generic casino template.

Do not add dependencies simply because they make one animation easier.

If animation tooling already exists, reuse it.

If not, prefer CSS transitions/animations where sufficient.

---

# 25. Code quality

While touching UI code:

- remove obvious dead styling
- consolidate duplicated visual constants
- keep components readable
- avoid giant 1000-line presentation components
- separate game logic from presentation when doing so is safe
- do not perform unrelated architecture rewrites

Preserve TypeScript strictness if enabled.

Do not introduce `any` to bypass errors.

---

# 26. Verification

After every meaningful redesign stage:

- run lint
- run typecheck
- run tests
- run build
- inspect console errors
- inspect network/API errors
- verify realtime multiplayer flows

If the project has no tests for a critical path, add focused tests where practical.

Prioritize preserving real behavior over chasing arbitrary coverage numbers.

---

# 27. Visual QA

Manually inspect redesigned screens at multiple viewport sizes.

Look for:

- inconsistent spacing
- random radii
- random colors
- tiny text
- visual noise
- unreadable metadata
- excessive borders
- too many panels
- awkward empty states
- unbalanced table composition
- overlapping players
- clipped cards
- poor button hierarchy

The application should feel designed as one product, not generated screen-by-screen by AI.

---

# 28. Anti-AI-slop rules

Never generate generic modern UI by default.

Specifically avoid:

- gradient blobs
- 3-column SaaS cards everywhere
- excessive glass
- fake statistics
- meaningless decorative charts
- huge hero copy inside product screens
- random pills around every label
- repeated card-inside-card layouts
- dozens of gradients
- generic purple/blue AI palette
- excessive iconography
- decorative fake terminal text

Every visible element must serve:
- gameplay
- navigation
- hierarchy
- status
- atmosphere

---

# 29. Decision rule

Whenever there is tension between:

1. functionality
2. readability
3. brand atmosphere

Use this priority:

**functionality > readability > atmosphere**

Resistance should make the product memorable, not harder to use.

---

# 30. Before changing code

First inspect the repository and write a concise implementation plan based on the actual stack and architecture.

Then start implementing without waiting for approval unless a destructive architectural change would be unavoidable.

When uncertain, preserve existing behavior.

Do not replace the project with a demo.

Do not create a disconnected design prototype as the final implementation.

The result must remain a real, fully functional multiplayer poker application.

---

# 31. Definition of done

The redesign is successful when:

- all existing major features still work
- multiplayer remains functional
- backend contracts remain compatible
- poker gameplay is immediately understandable
- the design is visually cohesive
- the app does not look like a generic casino
- the app does not look like a generic crypto product
- the app does not use pixel-art as its core UI language
- Resistance is recognizable through atmosphere, copy, motion and interaction
- mobile / Telegram UX is strong
- the poker table feels distinctive
- all screens share one design system
- production build succeeds

The goal is not merely "dark mode".

The goal is to create a product users can recognize from a single screenshot even when the logo is hidden.
