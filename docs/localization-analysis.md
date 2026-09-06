# EN/RU localization analysis

Analysis date: 2026-09-06. Status: analysis complete; implementation and local release preparation recorded in localization-release.md.

Final user scope: game web app only. The public website/comic is excluded; any
earlier discussion of story localization below is superseded by that scope.

## Requested outcome

One language selection changes the entire app between English and Russian without
reloading or resetting a match. Standard card-action labels such as Call, Fold,
Check, Bet, Raise and All-in remain English. Translate instructions describing
those actions. Preserve brand names, token symbols, player-generated text,
wallet addresses, room codes, URLs and protocol identifiers.

## Evidence from this repository

- React 19, TypeScript and Vite 6; no established localization library in package.json.
- The first implementation adds a Context provider, persistent `redoapp_language`,
  a switch in MenuProfile, and partial translations in three lobby components.
  It is a prototype, not app-wide localization. The root imports the Russian
  dictionary eagerly; keys are arbitrary strings with silent English fallback.
- AST inspection found 465 occurrences of static JSX text containing English
  letters across 39 TSX files. This is not a translation-key count: it excludes
  expressions, attributes, configuration, server messages and text inside images,
  and includes repeated text and intentionally untranslated labels.
- Web3Dashboard alone contains 225 of those occurrences. Other major surfaces
  are App, PokerGame, BlackjackGame, RuleModal and TutorialModal.
- CasinoConfirmDialog receives preassembled title/message/detail strings;
  CasinoNoticeToast receives message strings. Merely translating at event time
  would leave already-open dialogs and notices in the previous language.
- server.ts emits English errors and game-log messages. Some client behavior in
  utils/api.ts identifies transient errors by matching English message text.
  Translation must happen after classification, at the presentation boundary.
- Web3Dashboard formats dates without an explicit selected locale.
- The installed TonConnect UI types explicitly support `en` and `ru` via the
  language option. Its embedded UI needs to follow the app language separately.
  The app cannot control text inside an external wallet application.
- Story copy and alt text live in data/comicScenes.ts. RootApp independently
  lazy-loads the story and game; localization must preserve that split.
- Story motion samples HTML geometry for particle transitions. Language changes
  require refreshing translated text geometry and scene-owned particle data,
  without resetting scroll position or globally destroying ScrollTriggers.

## Current approaches and assessment

| Approach | Strength | Tradeoff for this app |
| --- | --- | --- |
| Custom Context + typed catalogs + Intl | Few dependencies; complete control | Must implement interpolation, plural handling, catalog checks, extraction and loading ourselves. The present dictionary does not supply them. |
| i18next + react-i18next | Reactive switching, namespaces, interpolation, plurals, rich text and TypeScript integration | Adds runtime dependencies and requires disciplined keys and resource loading. Best fit for incremental migration of this existing app. |
| Lingui | Extraction/compilation workflow, ICU messages, dynamic catalogs | Introduces extraction and compilation tooling. A strong alternative if that workflow is preferred. |
| FormatJS / react-intl | ICU messages and integrated number/date formatting | Suitable, but needs catalog/extraction setup too. No repository-specific advantage over i18next was established. |
| Paraglide JS | Typed compiled message functions and tree-shaking | Adds a compiler; its no-reload path requires an explicitly reactive client shell. Possible here, but more integration work around an active game. |
| Translation platform / Tolgee | Useful for collaborative translation management and visual editing; static production resources supported | Optional workflow layer. An external service is unnecessary for delivering these two locales. |
| Browser/DOM replacement or live machine translation | Can preview rough translations | Does not provide the required controlled terminology, dynamic coverage and React-state guarantees. Do not use as the production architecture. AI may draft catalog content for review. |

This comparison covers the relevant implementation families, not every package
on the market. No comparative bundle-size or speed benchmark has been run here.

Primary sources checked:

- https://react.i18next.com/latest/usetranslation-hook
- https://react.i18next.com/latest/trans-component
- https://www.i18next.com/translation-function/plurals
- https://www.i18next.com/translation-function/formatting
- https://www.i18next.com/overview/typescript
- https://lingui.dev/guides/dynamic-loading-catalogs
- https://formatjs.github.io/docs/react-intl/
- https://formatjs.github.io/docs/react-intl/api/
- https://paraglidejs.com/
- https://paraglidejs.com/strategy
- https://docs.tolgee.io/js-sdk/5.x.x/providing-static-data

## Recommended implementation

1. Replace the prototype translation internals with i18next/react-i18next, retaining
   the existing storage key and switch. Use stable semantic keys, typed resources
   and separate catalogs for common, lobby, wallet, quests, rooms, games and story.
   Keep the initial English default and always honor a saved user selection.
   Automatic Telegram/browser detection can be added independently; it is not
   necessary for the requested explicit EN/RU switch.
2. Keep the provider above the existing lazy surface boundary. Load catalogs with
   their surface, load the target language before activation, handle load failure,
   and keep the current game visible. Do not add locale-based React keys or reload
   the page. Memoized translations must depend on locale without restarting game
   subscriptions, timers, matchmaking or wallet sessions.
3. Offer the same switch in the story header and game account settings. Ensure it
   is reachable during a match through the game's controls/settings. Use language
   names or EN/RU, a descriptive accessible label, visible focus and 44px targets.
4. Translate full messages with named parameters, rather than English sentence
   fragments. Use Russian plural forms (1 игрок, 2 игрока, 5 игроков, 21 игрок).
   Format displayed dates and amounts using the chosen locale; preserve numeric
   values and machine-formatted transaction/API payloads.
5. Store notification/confirmation descriptors as key + parameters, translating
   during rendering. Add stable error codes and structured log events where
   necessary, preserving legacy English fields for compatibility. Do not translate
   user names by dictionary lookup or change strings before error classification.
6. Cover all menus, filters, account/settings, wallet/deposit/withdrawal/history,
   tickets/energy/quests/XP/referrals, rooms/queue/tournaments, game HUD/results,
   rules/tutorial, loading/error/empty states, placeholders, titles and alt/ARIA
   text. Include app-owned administrative UI if exposed in this web app.
7. Synchronize TonConnect UI language. Localize story configuration at its
   presentation boundary, preserving IDs, routes, imagery and timeline ownership.
   Audit images with English copy separately: dictionaries cannot change pixels.
   Keep existing assets and provide localized HTML equivalents for meaningful
   copy; do not silently claim raster text was translated.
8. Check Cyrillic font coverage and layout. Allow labels to wrap or expand;
   do not solve longer Russian text by making it illegible.

## Verification required before completion

- Catalog parity and valid interpolation/plural parameters; a source audit for
  remaining app-owned English with explicit exceptions for card actions/brands.
  Catalog parity alone cannot prove screen coverage.
- EN → RU → EN on every surface, already-open dialogs/notices and new dynamic
  events. Reload persists selection; unavailable storage does not crash startup.
- Switching during an active hand preserves cards, turn, timers, room, balance,
  wallet connection and active network subscriptions. Use controlled local test
  fixtures for server-derived cases and distinguish them from live-service QA.
- Mobile/desktop, 200% zoom, keyboard access, Cyrillic rendering and overflow.
- Story forward/reverse scrolling, reduced motion, console and image requests;
  refresh particle geometry after language changes.
- Root/story/game routes, canonical Telegram CTA, room/referral launches, and
  independent lazy-loading remain intact.
- Run npm run lint, npm run build, npm run test:traffic and routing tests; add
  focused localization tests for plurals, fallback and switching-state invariants.

No claim of full implementation or runtime verification is made by this analysis.
