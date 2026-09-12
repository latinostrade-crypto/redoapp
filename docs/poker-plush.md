# Poker plush community cards

Five transparent, full-body pixel plush assets replace unopened community-card backs: beast, frog, blue-haired girl, hooded dog, Durov. The dog follows the supplied reference with concealed eyes, white muzzle and purple nose; no ears or patch. Assets were generated with built-in image_gen. Source images and exact generation prompts are retained in `output/imagegen/` locally.

Runtime assets: `public/poker-plush/*.webp`, 80 × 104 each, lossless alpha, approximately 52 KB combined (active cast). No new runtime dependency. CSS transforms animate the generated characters and existing card back; these are lightweight cutout animations, not frame-by-frame limb animation or 3D models.

`PokerPresentation` owns delivery start, pixel dissolution on arrival (445–745 ms), face reveal (900 ms), and delivery cleanup (1350 ms). Flop arrivals are staggered by 140 ms. Existing payout choreography waits until the board is ready. Financial state and server turn deadlines are unchanged. Recovery and reduced motion immediately reveal cards; late snapshots do not replay old deliveries. Missing character images fall back to card backs. Actors do not animate continuously.

`PlushCard` measures the small board deck once per delivery and applies a negative animation delay for elapsed time. It does not update React every animation frame. PokerGame keys the board by hand identity. Existing board deal/flip CSS is suppressed so it cannot duplicate this animation.

Local visual test: `http://192.168.1.102:3000/plush-preview.html`. This Vite development entry uses the real CommunityCards and presentation code, supports flop/turn/river/all-five/reset/reduced-motion controls, and is not part of the production build entry. Actual game: `/?play=1`, PVP → Poker → practice.

Validation: TypeScript lint, production build, traffic budget, extended poker motion tests; Playwright desktop 1440 px and mobile 390/320 px; real practice table; flop/turn/river, rapid reset, system and explicit reduced motion, successful HTTP 200 for all five character images. No application console errors in the tested flows. Screenshots and browser check script are in `output/playwright/`. Physical phone performance remains for user testing.

Revision 2: dog-v2.webp uses the same symmetrical front stance, short limbs and lowered paws as the cast. No patch or visible ears. Delivery no longer rotates, stretches or bounces actors: flight, catch hold, edge-to-face reveal, pixel dissolution on arrival, completed before the face is revealed. Final prompt: output/imagegen/dog-v2-prompt.md.

Pixel dissolution samples the actual sprite into 4-pixel blocks on one small canvas per active character. No per-particle DOM elements. Animation frames stop after the 300 ms dissolution and are cancelled on reset/unmount; reduced motion skips the effect.
