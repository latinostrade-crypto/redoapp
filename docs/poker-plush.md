# Poker community-card crew

Five face-down cards rest in a row above five aligned characters: beast, Pepe, blue-haired girl, hooded dog and Durov. There are no dashed placeholders or central decorative deck. Each character raises its hands and pulls its own card straight down onto itself. The card lands in the character's rectangle, covers it completely, then flips there. Revealed cards remain in the lower row; unrevealed cards stay above their characters. The board reserves both rows so the turn signal does not jump.

## Choreography and ownership

`CommunityCards` renders the five backs and authoritative card faces. `PlushCard` renders registered three-pose sprites. `PepeHeart` in `PepeCard.tsx` owns only Pepe's decorative heart. CSS transforms animate the card descent and sprite-frame changes; characters never rotate, stretch or slide around the table. The actor hides only once its card covers it. Generic `PixelCardFlip` face/pseudo-element animations are disabled inside the board to prevent a second delayed flip.

The existing `PokerPresentation` deadlines are unchanged: arms begin rising at 81 ms, reach overhead at 405 ms, pull starts at 450 ms, hands lower through the middle pose at 594 ms and the down pose at 716 ms, card lands at 783 ms, actor is hidden under it by 797 ms, face reveals at 900 ms, flip completes at 1140 ms, delivery cleanup at 1350 ms. Flop starts are staggered by 140 ms. Game state, turn deadlines and payout ordering remain authoritative. Duplicate snapshots do not replay deliveries; recovery and reduced motion reveal cards directly in their final lower positions.

During the pull, two small clipped copies of the raised pose show exactly one moving pair of hands in front of the card. The hands move continuously with CSS transforms. At 81 ms the idle hands are masked out of the fixed body at exactly the same moment the moving pair appears; whole armed poses are never cross-faded, preventing duplicate limbs. Pepe's vacated chest uses a central crop from his heart-free pose. The body remains behind the card. Temporary crops reuse the same decoded WebP, disappear on landing and unmount on delivery cleanup; they introduce no additional image assets or requests. Reduced motion omits the layers.

Each moving wrist is connected to a fixed shoulder by a two-segment dark sleeve. Tiny SVG paths interpolate the elbow and wrist on the same normalized clock as the hand crops; the shoulder never moves. Sleeves stay behind the card while fingers remain in front. This avoids floating hands without additional raster assets, animation loops, or React frame updates.

Pepe's heart separates as his hands rise, floats upward, and scatters into sampled pixel blocks when he starts pulling at 450 ms. It finishes by 810 ms. The heart loop stops on document hiding or unmount/reset and uses no per-frame React state.

## Assets and performance

Previously generated built-in ImageGen artwork is reused. Each actor has a 240 × 104, three-frame, 64-color lossless WebP atlas in `public/poker-plush/`:

- `beast-poses.webp`: 13,228 bytes
- `pepe-heart-poses.webp`: 12,334 bytes
- `girl-poses.webp`: 12,952 bytes
- `dog-v2-poses.webp`: 13,098 bytes
- `durov-poses.webp`: 12,360 bytes
- `pepe-heart.webp`: 32 × 28, 1,176 bytes

Total new runtime art: 65,148 bytes. Existing `/cards/poker-back-redo.png` supplies all five backs. No 3D models, new dependencies, continuous animation or per-particle DOM elements. Only Pepe uses a small canvas, capped at 2× device pixel ratio and 56 blocks. All animation work ends after delivery. Missing pose images fall back to the original character WebPs. The game remains independently lazy-loaded from the public story.

Local source artwork and prompts are retained under ignored `output/imagegen/`: `crew-poses-source.png`, `crew-poses-prompt.md`, `pepe-heart-source.png`, `pepe-heart-prompt.md`. Re-export with `node scripts/export-crew-poses.mjs` and `node scripts/export-pepe-heart.mjs`; Sharp removes export backgrounds, registers frames, limits palettes without dithering, then encodes WebP. Runtime assets are stored in the repository.

## Validation

Run `npm run lint`, `npm run build`, `npm run test:traffic`, `npm run test:poker-motion`.

`plush-preview.html` is a local Vite development entry using real `CommunityCards` and `PokerPresentation`; it is not a production build entry. `output/playwright/check-crew.cjs` checks five initial backs above actors, flop/turn/river, exact final card/actor rectangle alignment, covered actors, absence of running animations/canvas after completion, reset, reduced motion, 1440/390/320 px viewports and successful asset requests. Screenshots are in `output/playwright/crew-*.png`. Desktop browser testing does not replace profiling on physical phone hardware.
