# Resistance Poker — Design & Motion Reference

## Purpose

This skill defines the visual language, interaction rules, animation system, and implementation constraints for the Resistance Poker interface.

The goal is NOT to create a generic casino UI, a generic cyberpunk UI, or a normal web application with pixel decorations.

The interface must feel like a modern multiplayer poker application running inside an old underground arcade/terminal system.

Pixel art is not decoration.
Pixels are the physical material of the world.

Every important state change should feel like a game event.

---

# 1. Core Design Principle

The product combines:

- modern usability
- clear poker hierarchy
- dark Resistance atmosphere
- pixel-native motion
- old-game event presentation
- restrained glitch
- terminal-like system feedback

The UI must remain readable and fast.

Do not sacrifice usability for style.

The interface itself may be relatively clean.
The strongest pixel identity must come from:

- transitions
- movement
- state changes
- cards
- player states
- game announcements
- screen effects
- text reveals
- timers
- loading
- win/loss states

---

# 2. Forbidden Visual Direction

Do NOT make the interface look like:

- PokerStars
- Las Vegas casino
- generic mobile casino
- generic neon cyberpunk
- generic SaaS dashboard
- glassmorphism
- soft pastel UI
- excessive rounded cards
- glossy 3D casino chips everywhere
- constant glow
- constant glitch
- confetti-heavy mobile game
- crypto exchange dashboard
- standard Material UI
- default Tailwind UI
- generic Framer Motion showcase

Avoid:

- smooth fade-only transitions
- generic slide-up modals
- generic skeleton shimmer
- loading spinners
- excessive blur
- oversized gradients
- floating glass cards
- random animation styles

---

# 3. The Pixel World Rule

Treat pixels as the physical material of the interface.

Appearance:
PIXELS -> ASSEMBLE -> OBJECT

Disappearance:
OBJECT -> BREAK INTO PIXELS -> VOID

Transition:
BLACK PIXELS -> SCREEN OCCLUSION -> NEXT SCENE -> PIXELS RETRACT

Error:
PIXEL STRUCTURE BREAKS / SIGNAL DISTORTS

Player disconnect:
PLAYER VISUAL -> PIXEL LOSS -> OFFLINE STATE

Victory:
CHAOS -> STABILIZATION -> WINNER STATE

This rule must remain consistent across the entire application.

---

# 4. Motion Philosophy

Normal web animation should be avoided whenever a pixel-native alternative exists.

Bad:
opacity 0 -> 1
translateY(20px) -> 0
smooth scale pop
generic ease-in-out

Preferred:
stepped movement
pixel assembly
frame-by-frame sprite behavior
scanline build
tile wipe
hard snap
pixel displacement
short controlled distortion
screen-space block transitions

Movement should often feel visually quantized.

Use animation stepping where appropriate:

- CSS steps()
- integer position rounding
- sprite sheets
- frame sampling
- discrete keyframes

The user should feel that the animation is being rendered by an old game engine, even though the application runs smoothly.

---

# 5. Motion Intensity Levels

Every animation must belong to one of five levels.

## LEVEL 0 — STATIC

Use for:

- lobby
- settings
- wallet
- profile
- passive information
- table list

Allowed:

- very subtle pixel texture
- minimal cursor blink
- small status indicator
- subtle border activity

No screen shake.
No heavy glitch.

---

## LEVEL 1 — MICRO

Use for:

- hover
- tap
- button press
- toggle
- menu selection
- tooltip
- focus state

Examples:

- 1px border displacement
- 1-frame inversion
- pixel snap
- tiny stepped movement
- short terminal tick

Duration:
approximately 60–180ms

---

## LEVEL 2 — GAMEPLAY

Use for:

- deal
- check
- call
- raise
- fold
- active turn
- timer
- pot update
- chip/value movement

Effects must be noticeable but not disruptive.

Duration:
approximately 120–500ms

---

## LEVEL 3 — EVENT

Use for:

- player join
- player leave
- showdown
- river reveal
- elimination
- reconnect
- hand result
- important table state change

Can briefly affect a larger region of the screen.

Duration:
approximately 250–900ms

---

## LEVEL 4 — IMPACT

Reserved only for:

- GAME START
- ALL IN
- WINNER
- GAME OVER
- major tournament victory

Allowed:

- screen shake
- hard flash
- strong pixel wipe
- controlled RGB displacement
- full-screen announcement
- larger pixel destruction

Never use Level 4 effects for ordinary UI.

---

# 6. Core Animation Primitives

Create reusable primitives.
Do NOT rewrite similar effects independently.

Required primitives:

- PixelBuild
- PixelDissolve
- BlackPixelWipe
- PixelTextReveal
- PixelCounter
- PixelTimer
- PixelBorderProgress
- PixelCardDeal
- PixelCardFlip
- PixelSnap
- PixelBurst
- SignalGlitch
- ScreenGlitch
- ScreenShake
- ArcadeAnnouncement
- PlayerSignalState
- PlayerElimination
- PixelModalTransition
- PixelSceneTransition

All poker screens must reuse these primitives.

---

# 7. GAME START Sequence

When the hand/game begins, treat it as a ceremony.

Suggested sequence:

1. Final player/state becomes ready.
2. Short interface pause.
3. Optional tiny CRT/signal disturbance.
4. Full-screen or table-centered announcement appears:

READY?

Then:

GAME
START!

The wording must be English and arcade-like.

Do NOT use:
"Game started successfully"
"The game has begun"

Use:
GAME START!
or
GAME START

Animation:

- text is assembled from square pixels
- bitmap/pixel font
- hard impact
- optional 1–2 frame screen shake
- announcement breaks apart into pixels
- deal animation begins immediately

Do not use a normal fade.

---

# 8. Card Deal Animation

Cards should not glide like normal DOM elements.

Required feeling:

- deck emits card
- card travels in visually stepped motion
- slight rotation is allowed
- card snaps into player slot
- 1px or very small bounce on impact

The visual motion may appear at approximately:

- 8 fps
- 12 fps
- 16 fps

even when the application renders at 60 fps.

Do not make movement physically jerky enough to hurt usability.
The stepping is visual language, not actual performance degradation.

---

# 9. Card Flip

Use:

- sharp rotateY / frame-based flip
- pixel edge transition
- brief face reveal snap

Avoid:

- long smooth 3D animation
- glossy casino card effects

The flip should feel mechanical and game-like.

---

# 10. Player Turn

Do not use only a glowing circular ring.

Preferred behavior:

- active player border builds pixel-by-pixel
- perimeter becomes the turn indicator
- timer can consume the border over time

Example concept:

┌────────────
│ PLAYER_01
│
└────────────

The active perimeter should communicate:
"this player currently owns the signal."

---

# 11. Timer

Avoid generic circular progress indicators.

Preferred:

- pixel bars
- segmented timer
- perimeter decay
- block depletion

Example:

████████████████
██████████░░░░░░
████░░░░░░░░░░░░
██░░░░░░░░░░░░░░

Final seconds may briefly display:

3
2
1

Large bitmap digits can appear near the active player or table center.

Do not overuse full-screen countdowns.

---

# 12. CHECK / CALL / RAISE

Actions should create compact visual confirmation.

CHECK:
small pixel snap / terminal confirmation

CALL:
value locks in and moves toward pot

RAISE:
bet value increases with stepped counter motion

Preferred number animation:
not smooth continuous interpolation

Instead:
integer / stepped counting
or fast digit replacement

---

# 13. BET / POT Animation

Do not rely on realistic casino chip physics.

The wager may be represented by:

- chip sprite
- token block
- numeric value
- compact stack
- Resistance-styled value packet

Movement:

PLAYER -> POT

Use stepped movement and short impact.

When bet reaches pot:

- pot value updates
- tiny pixel reaction
- subtle 1-frame pulse
- optional border expansion

Avoid excessive particle effects.

---

# 14. FOLD

Fold should feel like signal withdrawal.

Possible sequence:

1. cards lose contrast
2. cards shift away in stepped motion
3. cards dissolve into pixels or move toward muck
4. player state becomes inactive

Do not use a soft opacity fade only.

---

# 15. ALL IN

ALL IN is a Level 4 event.

It must feel dangerous and exceptional.

Sequence concept:

1. brief input lock
2. short RGB displacement or horizontal pixel tear
3. controlled screen shake
4. large announcement:

ALL
IN

5. total wager moves toward pot
6. table returns to calm state

Important:
The screen must not remain glitchy afterward.

Glitch is punctuation, not atmosphere wallpaper.

---

# 16. SHOWDOWN

Showdown should progressively increase tension.

Recommended sequence:

- table stabilizes
- cards reveal one by one
- each reveal uses sharp pixel flip
- winning hand receives controlled highlight
- losing hand becomes visually secondary
- final result locks

Do not immediately explode into victory effects.

Allow a short pause before WINNER.

---

# 17. WINNER Sequence

Avoid:

- confetti
- generic trophy animation
- gold explosion
- slot-machine celebration

Preferred:

WINNER
IDENTIFIED

or

PLAYER_03
WINS

or another concise approved game phrase.

Then:

POT CAPTURED
14.82 TON

Visual behavior:

- winner portrait/avatar assembles or stabilizes
- other UI reduces emphasis
- short monochrome flash may be used
- pixel border or scan can lock onto winner
- reward counter resolves in stepped digits

Victory should feel controlled and powerful.

---

# 18. Player Elimination

When a player permanently leaves the current match:

1. avatar begins losing pixels
2. signal breaks
3. identity partially fragments
4. seat moves into offline/eliminated state

Possible status:

[ OFFLINE ]

or

ELIMINATED

The empty seat may retain a subtle visual trace.

This helps make the table feel persistent.

---

# 19. Player Disconnect / Reconnect

Disconnect:

- no generic red toast only
- player visual loses pixel integrity
- signal indicator drops
- seat enters disconnected state

Reconnect:

- pixels rebuild
- signal line returns
- player identity restores

Keep this readable and fast.

---

# 20. GAME OVER Sequence

GAME OVER is one of the signature transitions.

Suggested sequence:

1. final result is visible
2. short pause
3. large bitmap text appears:

GAME OVER

4. winner/result remains visible briefly
5. black pixels begin appearing across the screen
6. black pixels spread until the entire screen is covered
7. next screen loads under black
8. black pixels retract or dissolve

Optional terminal-style closing state:

SESSION CLOSED_

This is not a joke message.
It should feel like a system state.

The underscore may blink.

---

# 21. Black Pixel Wipe

This is a major brand transition.

Implementation concept:

Sparse black square blocks appear across the screen.

Then clusters expand.

Eventually:

BLACK PIXEL COVERAGE = 100%

Use for:

- GAME OVER
- leaving a table
- switching major game scenes
- tournament end
- dramatic reconnect

Do NOT use for every small navigation.

---

# 22. Modals

Avoid generic centered rounded modal + fade.

Preferred:

- panel assembles from pixels
- border appears first
- content resolves second
- controls appear last
- closing reverses sequence

Possible sequence:

FRAME -> HEADER -> CONTENT -> ACTIONS

Use subtle stagger.

No excessive movement.

---

# 23. Menus

Menus should feel like terminal modules.

Preferred:

- hard snap positioning
- pixel cursor
- active row inversion
- border construction
- text reveal
- small stepped transitions

Avoid:

- floating glass panels
- huge blur
- soft bouncing cards

---

# 24. Loading

Do not use:

- spinner
- skeleton shimmer
- generic progress ring

Preferred:

CONNECTING TO TABLE_

[████████░░░░░░░]

SYNCING PLAYERS
LOADING DECK
VERIFYING SESSION
READY

Messages should be functional and atmospheric.

Do NOT add humorous or random loading messages.

The loading state must feel like a system boot sequence.

---

# 25. Typography

Use a layered typography system.

Primary game/event font:
bitmap / pixel font

Use for:

- GAME START
- GAME OVER
- ALL IN
- WINNER
- timers
- system labels
- short status text

Secondary UI font:
highly readable modern sans or mono

Use for:

- balances
- settings
- tournament descriptions
- long text
- table information

Do not render all text in a hard-to-read pixel font.

---

# 26. Text Animation

Large announcements:
pixel assembly

System text:
terminal reveal or short stepped appearance

Numbers:
stepped counter

Do not use typewriter animation everywhere.

Typewriter-like behavior is allowed only for system/terminal moments.

---

# 27. Pixel Grid

Choose a consistent internal pixel scale.

Recommended logical pixel units:

2px
4px
8px

Effects should align to a common grid.

Avoid random pixel sizes in every component.

Pixel effects should remain crisp.

When possible:

- use integer transforms
- avoid fractional positioning for pixel effects
- preserve nearest-neighbor rendering for sprite assets

---

# 28. Glitch Rules

Glitch must be rare.

Allowed for:

- ALL IN
- GAME START
- GAME OVER
- major errors
- signal loss
- elimination
- special tournament event

Not allowed continuously.

Possible glitch primitives:

- horizontal line displacement
- RGB channel shift
- block displacement
- frame duplication
- brief image tearing

Typical duration:
40–220ms

Avoid prolonged distortion.

---

# 29. Screen Shake

Use sparingly.

Allowed:

- GAME START
- ALL IN
- huge final pot
- GAME OVER impact
- major tournament victory

Typical displacement:
1–4px

Typical duration:
60–180ms

Do not use heavy mobile-game shaking.

---

# 30. Pixel Texture

Pixel texture may exist subtly in:

- backgrounds
- dividers
- table surface
- border masks
- player frames
- overlays

It must not reduce readability.

Avoid adding noise uniformly over the entire app.

---

# 31. Lobby Visual Balance

Lobby should remain mostly calm.

Target balance:

90% modern dark interface
10% retro/pixel atmosphere

Use:

- clean lists
- readable tables
- concise cards
- restrained pixel borders
- small animated indicators

Avoid large arcade effects in passive browsing.

---

# 32. Poker Table Visual Balance

Target:

70% modern usable poker
30% pixel game identity

The table must remain easy to understand at a glance.

Prioritize:

- player's own cards
- current turn
- pot
- bet amounts
- player statuses
- actions
- timer

Style must never obscure gameplay.

---

# 33. Critical Event Balance

For major moments:

GAME START
ALL IN
SHOWDOWN
WINNER
GAME OVER

The system can become temporarily:

100% arcade / Resistance

Then quickly return to the calm table state.

Contrast creates impact.

---

# 34. Player Reactions

Player reactions should feel native to the game.

Use:

- pixel speech bubbles
- sprite animation
- 2–4 frame character animation
- small reaction popups
- compact pixel iconography

Do not place generic modern emoji stickers over the table unless intentionally integrated.

Examples of character states:

- laugh
- shock
- anger
- GG
- celebration
- doubt

Keep them short.

---

# 35. Sound Design Hooks

Code should expose hooks for sound events.

Suggested sound event IDs:

ui_click
ui_confirm
ui_cancel
card_deal
card_flip
player_turn
timer_warning
bet_move
pot_receive
fold
all_in
player_join
player_disconnect
player_eliminated
showdown
game_start
winner
game_over
scene_transition

Sound direction:

- short
- dry
- bit-crushed where appropriate
- arcade
- terminal
- mechanical
- non-casino

Avoid slot-machine jingles.

---

# 36. Haptic Hooks

On supported mobile devices, expose optional haptic hooks.

Examples:

button tap:
light

card received:
very light

turn begins:
light

ALL IN:
medium

WINNER:
medium

GAME OVER:
light/medium

Never vibrate continuously.

Respect user settings.

---

# 37. Accessibility

All motion-heavy features must respect:

prefers-reduced-motion

Reduced-motion mode should:

- remove screen shake
- remove RGB tearing
- reduce pixel particle counts
- replace long wipes with short stepped transitions
- preserve state clarity

Never hide essential information inside animation.

---

# 38. Performance Rules

This runs inside a Telegram Mini App / mobile browser environment.

Performance is critical.

Prefer:

1. CSS transforms
2. opacity only when stylistically justified
3. CSS steps()
4. sprite sheets
5. lightweight Motion animations
6. canvas only when clearly beneficial
7. WebGL only for effects impossible to achieve efficiently otherwise

Avoid:

- hundreds of animated DOM nodes
- massive particle systems
- persistent filters
- expensive blur
- large SVG filter chains
- continuous layout thrashing

Animations must use:

transform
opacity
clip-path when safe
CSS custom properties
requestAnimationFrame only when necessary

Avoid animating layout properties such as:

width
height
top
left

when transform can be used.

---

# 39. Preferred Technical Stack

For React interfaces:

Use Motion / Framer Motion for:

- state transitions
- orchestrated component animations
- mount/unmount
- shared layout where appropriate

Use CSS animations for:

- loops
- cursor blink
- scanlines
- small step animations
- sprite playback
- border progress

Use GSAP only for:

- complex full-screen timelines
- GAME START
- GAME OVER
- BLACK PIXEL WIPE
- advanced showdown sequences

Do not add GSAP for trivial button effects.

Canvas may be used for:

- large pixel wipes
- performant block effects
- full-screen pixel dissolve

Use WebGL only if measured performance justifies it.

---

# 40. Required Reusable Components

Create or maintain reusable components for:

PokerTable
PlayerSeat
PlayerAvatar
PlayerStatus
PlayerTimer
CommunityCards
HoleCards
Deck
Pot
BetDisplay
BetControls
ActionButton
RaiseControl
GameAnnouncement
GameStartSequence
GameOverSequence
WinnerSequence
AllInSequence
ShowdownSequence
PixelModal
PixelToast
PixelLoader
PixelSceneTransition
PixelSpeechBubble
ConnectionStatus

Do not duplicate animation logic across pages.

---

# 41. Design Tokens

Create centralized tokens for:

- spacing
- pixel unit
- typography
- border thickness
- animation durations
- motion intensity
- z-index
- screen shake strength
- glitch strength
- pixel block size
- transition timing
- player status colors
- table states

Example conceptual token groups:

--pixel-unit
--pixel-block-sm
--pixel-block-md
--pixel-block-lg

--motion-micro
--motion-gameplay
--motion-event
--motion-impact

--shake-sm
--shake-md

--glitch-sm
--glitch-md

Do not hardcode different values everywhere.

---

# 42. Animation Timing Guidance

Micro:
60–180ms

Gameplay:
120–500ms

Event:
250–900ms

Impact:
400–1500ms total sequence

Animations should usually be shorter than typical marketing websites.

Poker interaction must remain responsive.

---

# 43. Easing

Avoid excessive smooth spring animation.

Preferred:

steps()
linear for deliberate scan behavior
short custom cubic-bezier for physical snap
minimal overshoot

For pixel-native events, discrete frames often matter more than easing.

---

# 44. Table Idle State

The table should not constantly move.

Idle state should be mostly still.

Allowed:

- tiny signal pulse
- timer activity
- subtle scanline
- status cursor
- small ambient pixel noise

The player should be able to focus.

---

# 45. Responsive Behavior

Design mobile-first.

The poker table must remain usable in a Telegram Mini App viewport.

Animation effects must adapt to screen size.

Do not let:

- announcements cover hole cards for too long
- effects block action buttons
- player labels overlap
- screen shake move controls outside safe touch area

Respect safe areas.

---

# 46. Poker UX Priority

Visual priority order:

1. own cards
2. action controls
3. active player
4. pot
5. community cards
6. bet values
7. player stack
8. timer
9. status
10. decoration

Never reverse this hierarchy for visual spectacle.

---

# 47. Interaction Principle

Every interaction should answer:

What happened?
Who caused it?
What changed?
What can I do now?

Animation exists to reinforce those answers.

If an animation makes the answer less clear, simplify it.

---

# 48. Implementation Workflow for Codex

Before modifying UI:

1. inspect existing project structure
2. identify current design system
3. identify poker state architecture
4. identify reusable components
5. preserve existing business logic
6. create or extend Resistance motion primitives
7. redesign components structurally when needed
8. do not simply recolor old UI
9. run the application
10. inspect the rendered result
11. test desktop and mobile dimensions
12. verify poker controls remain usable
13. verify animation performance
14. verify reduced-motion behavior
15. fix visual inconsistencies

---

# 49. Visual Verification

After any significant UI change:

- render the real screen
- capture screenshot when tooling allows
- inspect spacing
- inspect hierarchy
- inspect pixel consistency
- inspect clipping
- inspect mobile viewport
- inspect animation entry/exit states

Do not consider a task complete based only on code correctness.

---

# 50. Refactoring Rule

When an effect appears more than once:

extract it.

Do not create:

GameStartPixelEffect
WinnerPixelEffect2
ModalPixelEffectNew
RandomPixelTransition

Instead build shared primitives and compose them.

---

# 51. Naming

Prefer semantic names.

Good:

PixelBuild
PixelDissolve
BlackPixelWipe
ArcadeAnnouncement
PlayerSignalState
GameStartSequence

Bad:

CoolEffect
Glitch2
AnimNew
PixelThing
TransitionFinal

---

# 52. Final Quality Check

Before completing a UI task, verify:

- Does this still look like poker?
- Is gameplay immediately understandable?
- Does it avoid generic casino aesthetics?
- Does it avoid generic SaaS aesthetics?
- Is pixel motion part of the system, not decoration?
- Are important animations visually stepped?
- Are major effects reserved for major events?
- Is glitch used sparingly?
- Is the lobby calmer than the table?
- Are GAME START and GAME OVER memorable?
- Does GAME OVER use black-pixel closure?
- Does ALL IN feel exceptional?
- Do player states communicate clearly?
- Does the UI remain performant on mobile?
- Does reduced motion work?
- Are reusable primitives used?
- Was the rendered UI visually verified?

If the answer to any important item is no, continue iterating.

---

# 53. Core Creative Rule

The user should feel that:

the poker application is not decorated with pixels.

The poker world itself is made of pixels.

Every object can be assembled.
Every signal can break.
Every player can disappear.
Every scene can be swallowed by black pixels.
Every major moment can temporarily transform the entire screen into an old arcade event.

That is the defining motion identity of Resistance Poker.


---

# 54. Resistance Hood + Live Telegram Avatar System

## Concept

Poker players must NOT use fixed pre-designed faces as the default multiplayer identity.

The core Resistance player identity is:

HOOD / CLOAK FRAME + LIVE TELEGRAM PROFILE AVATAR

The character itself is intentionally visually absent.

The hood represents the Resistance.
The avatar represents the real player.

This makes every Telegram user automatically become a Resistance character while preserving their personal identity.

---

## 54.1 Required Visual Layering

Implement the player portrait as composited layers, not as one baked image.

Recommended stack:

Layer 4 — optional status / turn / glitch effects
Layer 3 — hood foreground highlights and rim details
Layer 2 — transparent Resistance hood asset
Layer 1 — Telegram profile avatar
Layer 0 — player frame / seat UI

The Telegram avatar must sit behind the hood opening.

Do NOT place a simple square/circle avatar on top of the hood.

The avatar must appear physically inside the hood.

---

## 54.2 Hood Asset

Use one canonical faceless Resistance hood asset as the base.

Requirements:

- transparent background
- front-facing
- centered
- symmetrical enough for UI reuse
- no built-in face
- dark interior opening
- readable silhouette at small sizes
- pixel-art / pixel-textured visual language
- must work on mobile at approximately 64–160px visual size

Preferred asset location:

assets/resistance-hood.png

or, if SVG is used:

assets/resistance-hood.svg

Do not regenerate a different hood for every player.

Consistency of the hood is part of the brand.

---

## 54.3 Avatar Masking

The Telegram avatar must be clipped/masked to the visible face opening of the hood.

Preferred implementation options:

1. CSS mask-image
2. SVG mask
3. clip-path
4. canvas compositing only if required

Use a reusable mask rather than manually positioning each avatar.

Create one component such as:

ResistanceAvatar

Conceptual props:

telegramPhotoUrl
fallback
state
active
eliminated
disconnected
size
pixelation

The component must remain independent from poker business logic.

---

## 54.4 Telegram Avatar Treatment

The avatar should remain recognizable.

Do NOT run AI restyling on every user's avatar.

Instead use realtime visual treatment where appropriate:

- controlled downscale/upscale pixelation
- nearest-neighbor rendering
- subtle dark grading
- limited contrast adjustment
- optional pixel-grid overlay
- optional monochrome treatment for inactive states

Avoid making all avatars identical.

Personal identity must remain visible.

---

## 54.5 Pixelation Technique

Preferred lightweight approach:

render avatar to a lower logical resolution and scale it back using:

image-rendering: pixelated

or equivalent canvas logic.

Pixelation strength should depend on rendered size.

Do not pixelate so strongly that profile photos become unrecognizable.

---

## 54.6 Avatar Fallback

Telegram photo availability must never be assumed.

Always provide a fallback.

Fallback order:

1. Telegram avatar/photo URL when available
2. project-defined player/NFT avatar when explicitly available
3. generated initials/symbol
4. dark anonymous silhouette inside hood

Never break the seat layout when no profile photo exists.

---

## 54.7 Join Animation

When a player joins:

1. empty hood is visible
2. signal activates
3. avatar pixels begin assembling inside the hood
4. avatar stabilizes
5. player metadata appears
6. seat becomes active

Use PixelBuild.

Do not fade the avatar in normally.

---

## 54.8 Active Turn State

When the player becomes active:

- hood remains stable
- avatar stays readable
- seat perimeter builds in pixels
- optional subtle highlight appears around inner hood edge
- timer is attached to the seat/perimeter

Do not constantly animate the avatar itself.

---

## 54.9 Fold State

When player folds:

- avatar contrast decreases
- hood becomes slightly darker
- active signal shuts down
- cards withdraw/dissolve
- seat remains present

Do not remove the avatar entirely for a normal fold.

---

## 54.10 ALL IN State

ALL IN may briefly affect the portrait.

Allowed:

- 1–3 frame block displacement
- short RGB split
- hood edge flash
- avatar pixel tearing

Return immediately to stable rendering.

---

## 54.11 Disconnect State

Disconnect should feel like signal loss.

Sequence:

1. small signal instability
2. avatar loses pixel blocks
3. avatar becomes partially corrupted
4. face area becomes darker
5. seat changes to disconnected status

The hood remains.

This communicates that the Resistance identity/seat still exists while the user's signal is gone.

---

## 54.12 Reconnect State

Reconnect is the inverse:

1. signal returns
2. avatar pixels rebuild
3. profile image stabilizes
4. player status restores

Use the shared PixelBuild primitive.

---

## 54.13 Elimination State

For permanent elimination from the current match:

1. avatar fragments
2. pixel pieces disappear
3. face opening becomes completely black
4. hood remains as an empty shell
5. seat receives ELIMINATED/OFFLINE visual treatment

This empty hood is a signature visual.

It should feel like the player disappeared from the system.

---

## 54.14 Winner State

Winner portrait:

- avatar sharpens/stabilizes
- hood rim receives a controlled highlight
- pixel lock-on frame may assemble around portrait
- avoid confetti
- avoid golden casino treatment

The player's real Telegram identity should remain clearly visible.

---

## 54.15 Privacy / Data Handling

Treat Telegram profile image URLs and user identity data as application data.

Do not log profile image URLs unnecessarily.

Do not persist user photos beyond what the application actually requires.

Do not attempt to scrape profile images outside the data legitimately available to the Mini App/backend.

Use the existing Telegram authentication/init-data flow already present in the project.

---

## 54.16 Component Architecture

Recommended structure:

components/
  resistance-avatar/
    ResistanceAvatar.tsx
    ResistanceAvatar.css
    AvatarMask.tsx
    avatar.types.ts

assets/
  resistance/
    resistance-hood.png
    resistance-hood-mask.svg

motion/
  pixel/
    PixelBuild.tsx
    PixelDissolve.tsx
    SignalGlitch.tsx

Keep hood presentation reusable outside poker seats, for example:

- lobby profile
- tournament bracket
- winner screen
- matchmaking
- spectator list

---

## 54.17 Performance

Do not create particle DOM nodes for every avatar pixel.

Prefer:

- CSS mask
- CSS transforms
- sprite/mask layers
- canvas only for temporary dissolve/build effects
- one composited effect layer per avatar when possible

The poker table may contain multiple players simultaneously.

The avatar system must remain performant on iPhone-class mobile devices.

---

## 54.18 Responsive Rules

The hood must keep its proportions across all player seat sizes.

Never stretch the hood independently in X/Y.

The face opening mask must scale from the same coordinate system as the hood.

Test at:

- smallest opponent seat
- normal opponent seat
- local player's larger seat
- winner presentation

---

## 54.19 Design Rule

The hood is the universal Resistance body.

The Telegram avatar is the player's face.

The player must appear to be INSIDE the hood, not pasted onto it.

This distinction is mandatory.

---

# 55. Updated Player Identity Rule

Previous fixed-character examples in this document are illustrative only.

For live multiplayer poker, default player identity should use:

Resistance Hood + Telegram Avatar.

Fixed characters may still be used for:

- NPCs
- tutorials
- promotional art
- special branded events
- explicit collectible/NFT avatar modes

But they must not replace live Telegram profile identity by default.

---

# 56. Reference Asset Rule

When a canonical Resistance hood image is supplied to the project:

- treat it as the source of truth
- do not redraw it with CSS
- do not replace it with an emoji/icon
- do not generate alternatives automatically
- preserve its silhouette and proportions
- build masks and effects around that asset

If the supplied hood asset changes, update the mask to match the new asset rather than altering the user's artwork.

---

# 57. Final Avatar Quality Check

Before completing any player-seat redesign, verify:

- Is the hood faceless by itself?
- Is the real avatar visibly inside the opening?
- Is masking aligned at every responsive size?
- Is the avatar still recognizable?
- Does missing photo data fall back safely?
- Does join use PixelBuild?
- Does disconnect visually corrupt/remove the avatar while preserving the hood?
- Does elimination leave the empty hood?
- Does ALL IN use only a brief glitch?
- Does winner state remain restrained?
- Is the implementation performant with all seats occupied?
- Is the hood reused consistently across the product?

If any answer is no, continue iterating.
