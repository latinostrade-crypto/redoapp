# Main menu redesign — implementation and verification

Updated: 2026-09-06. Scope: ME, Events, Shop and PVP lobbies; no production deployment or financial transactions.

## Delivered

- Reference-led dark pixel menu, icon navigation, real account values, XP progress, TKT and chip stacks. Existing wallet, rules and energy actions remain available through Account menu.
- Poker and Blackjack: common banner/mode/filter/table-row hierarchy. Occupancy, capacity and buy-in use actual catalogue fields; unavailable occupancy is not invented. Refresh, affordability/availability filters and invitations preserve existing handlers.
- UNO: same visual hierarchy with its existing public queue, private rooms and practice workflow, not fabricated permanent tables.
- ME, Events and Shop: readable framed modules, consistent spacing and touch controls. ME/Shop default buttons now use the same dark gradient and selected red border/inset illumination as game selectors.
- Per user's final choice, only the lower game banner remains in PVP. ME/Events/Shop retain the original four-character upper banner. Account tools move with the visible banner.
- Pixel transfer animates upper-to-lower, reverse and game-to-game. One visible canvas; one small offscreen frozen raster protects against React reusing an image element. Uses real image tiles, not a field of DOM particles.

## Motion budget and fallback

- 280 tiles normally; 160 when reported CPU/memory capability is low. 620 / 480 ms respectively.
- Canvas capped at 720 × 900, independent of devicePixelRatio. Frozen outgoing raster capped at 560 px wide.
- No React updates per animation frame, no blur, no ongoing particle loop or extra library.
- Three slow frames (>50 ms) end the effect and restore the finished image. Reduced motion, offscreen sources and hidden documents skip it. Scroll/resize/navigation/unmount cancel it. A 1.8-second watchdog also cleans up delayed image loads.
- Navigation does not wait for animation or image decode. Failed/unready images cannot leave controls blocked.
- Blackjack next-round UI timer uses a stable action ref and a deadline instead of restarting on callback identity; the action runs outside a state updater and once per deadline.

## Assets and generation

Built-in image generation was used (not CLI). Selected PNGs are saved inside the repository; source originals remain in Codex generated_images. All reference images and final outputs were visually inspected. The original public/banner.png is unchanged.

| Asset | Repository path |
| --- | --- |
| Poker | src/assets/resistance/poker-network-banner.png |
| UNO, four hooded heroes | src/assets/resistance/uno-network-banner.png |
| Blackjack variant | src/assets/resistance/blackjack-network-banner.png |

Poker generation specification: standalone 3:1 pixel-art banner based on the circled upper part of the user's reference; REDOapp / RESISTANCE POKER, three hooded operatives, spade/heart/cross faces, dark blue-black alley and red rim lighting. Remove annotation/UI and screenshot margins. Replace the crossed lower banner with this composition.

### Final UNO prompt

Use case: compositing / precise-object-edit. Asset: final standalone 3:1 wide pixel-art UNO banner for the app. Image 1 is the EDIT TARGET banner at the top of an otherwise white screenshot. Image 2 is the CHARACTER IDENTITY reference. Extract and rebuild ONLY the dark banner from image 1, no white canvas. Preserve gritty black and blue-gray Resistance pixel alley, hood shapes and subtle red edge lighting. Remove everything marked with red pencil: remove both crown graffiti, remove PLAY RESIST WIN and A SMALL GAME A BIGGER FREEDOM slogans, remove the word POKER. Remove ALL red annotations and handwriting. Keep left brand REDOapp (REDO red, app pale blue), subtitle exactly RESISTANCE UNO, crisp pixel type. Replace three anonymous suit/heart faces with FOUR recognizable heroes from image 2, each inside a separate dark Resistance hood: blue-haired girl with red eyes, green Pepe frog with red lips, fierce badger with cream papakha fur hat, and the REDO mascot dog (the distinctive black creature with large single white eye in image 2; preserve this exact identity, do not substitute a generic dog). Show all four faces distinctly, arranged across the banner with good separation, balanced shoulders, no tiny extra characters. Brand area at upper left must not overlap faces. Translate their faces into the restrained chunky pixel style of image 1, not smooth vector or glossy 3D. No extra heart prop, symbols, cards, text, crowns, UI controls, pencil marks, white margins or watermarks. Final artwork fills the entire wide canvas.

### Final Blackjack prompt

Use case: text-localization. Edit this existing REDOapp Resistance UNO banner into the BLACKJACK tab variant. Change ONLY the subtitle RESISTANCE UNO to exact text RESISTANCE BLACKJACK, in the same pale blue-gray chunky pixel font. Keep the REDOapp logo and all FOUR character identities, their dark hoods, pixel textures, poses, arrangement, red rim lighting and dark alley background unchanged. Do not add crowns, slogans, symbols, cards, UI or extra artwork. Output standalone wide 3:1 banner, no borders or margins. Ensure all subtitle letters fit legibly under the logo.

## Verification

- npm run lint; npm run build; npm run test:traffic; npm run test:game-routing; npm run test:private-room-client; npm run test:blackjack-rules.
- Earlier isolated integration runs: test:pvp-handoff and test:multiplayer-rooms passed without using production balances.
- Browser matrix: 320, 390, 430, 768 px; all four main tabs and three modes of all three games. No horizontal overflow, checked visible form/button geometry, banners loaded.
- ME expanded XP/referrals; Events tournaments; manual refresh/filter reset; captured invitation URL without sending a message; account dropdown/Escape; reduced motion.
- Entered practice and returned to the menu in Poker, Blackjack and UNO (including UNO's existing exit confirmation). After stabilizing the Blackjack timer, the repeated smoke run captured no application console errors; the menu was present and the banner canvas count was zero.
- Motion checks: forward/reverse, game changes, rapid navigation, image visibility and canvas cleanup. Chromium 4× CPU throttling also completed and cleaned up correctly. This is not a measured FPS guarantee for every physical smartphone.
- Local game URL checked HTTP 200: http://192.168.1.101:3000/?play=1 . Frontend and isolated local backend remain running.
- Scripts/screenshots: output/playwright/check-menu-redesign.cjs, check-banner-motion.cjs, check-banner-budget.cjs, check-menu-practice.cjs, menu-dark-me.png, menu-dark-shop.png, menu-single-banner-pvp.png and banner-particles-mid.png.

## Limits

No real wallet transfer/payment, production room mutation, physical iPhone or weak Android hardware test was performed. Existing build warnings remain for the large game bundle and lottie-web eval. test:traffic checks source-level polling/routing budgets; it is not a raster download or FPS benchmark. Comic/story content and routing were not redesigned.
