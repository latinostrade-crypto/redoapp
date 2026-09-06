# Pixel chip system

Implemented 2026-09-04. Scope: poker chip presentation and its settlement payload; story, wallet and ticket payouts remain separate.

## Behaviour

- One shared side-profile, three-layer pixel stack logo replaces the former single-chip currency glyph.
- Exact integer decomposition: 1 / 5 / 25 / 100 / 500 / 2500 / 10000. Artwork uses bounded, overlapping pile symbols, not one DOM element per actual chip. The exact amount remains in the player's frame or the bank label.
- Player bankroll stays in the frame. Unframed physical piles sit on the table, facing the player. A monetary action separates only its incremental contribution, pauses in front of the player, then travels into a bank.
- CHECK and FOLD create no money movement. Previously invested chips stay in the pot. Raises track the difference in cumulative investment, so a street reset cannot swallow the last action.
- The visible bank excludes chips still in transit. Payout leaves a bank at launch and reaches the recipient's displayed balance at arrival. Counters replace digits atomically, with a brief stepped highlight.
- Main/side pots and uncalled returns use exact `chipAwards` records. No recipient is shown receiving the full pot unless that is the actual award. Offline practice and the ambience engine use the existing integer side-pot allocator, including odd chips.
- A table-owned layer measures the shared symmetric seat rail. Every bankroll pile remains on its owner's vertical axis with a fixed gap; no collision search relocates it towards another player. Three top seats have equal spacing, the side rows are mirrored, and the local avatar is centered. Main/side pots sit below their total and above the card rail, with centered partial rows. More than three banks gets extra central space.
- Table bankroll artwork is capped at 30 px wide. Mixed denominations use one column per denomination, wrapping after four; single denominations can build up to three columns. Cards adapt to the actual space between the side seats, including desktop scrollbars. Balance numbers stay inside each player's frame.
- Initial/recovered states snap to current values. Repeated/stale snapshots do not duplicate contributions; visibility/network recovery cancels obsolete presentation. An in-progress payout finishes before a queued new-hand presentation replaces it.
- Pixel assembly, stepped transfer, merge, denomination change and digit replacement are finite effects. ALL IN has a compact announcement and does not lock chip controls. Winner presentation waits for transfer completion.
- Reduced motion resolves immediately: no chip flights, no delayed balances. The layer has no pointer targets and cannot intercept game actions.

## Implementation

- `src/components/poker/chips/chipModel.ts`: pure presentation ledger and denomination decomposition.
- `useChipTimeline.ts`: snapshot synchronization and boundary timers; no per-frame React updates.
- `ChipField.tsx` / `chip-field.css`: measured anchors, pile placement and stepped choreography.
- `PokerTable.tsx`: shared stack logo, values and bounded artwork.
- `PokerChipAward` / server perspective: chip units only, never TON/TKT payouts.

## Verification

- `npm run test:poker-chips`: denomination totals, incremental bets, duplicates, stale state, street changes, recovery, reduced motion, payout conservation, split/side pots, return, odd chips, engine payload and next-hand reset.
- Existing side-pot, resilience, pre-action, routing and persistent-table checks.
- TypeScript lint, production build and traffic budget.
- Real Chromium with the actual `PokerGame` component: 320 / 360 / 390 / 430 / 768 / 1024 / 1440 px, normal and stress states (ten players, ten banks, 9999-chip balances). Checks cover pile/seat/card collisions, owner-axis alignment, mirrored seat pairs, bounded piles, overflow, rapid transfers and reduced motion. See `output/playwright/check-symmetric-layout.cjs`.
- Local-only harness and screenshots: `output/playwright/`. Not imported into the production entry. Profile API is stubbed only in the QA browser, not application code.

Device limitation: these are desktop-browser mobile viewports, not a physical iPhone/Telegram WebView or a live multi-client PVP session. Those remain useful deployment smoke checks. Build reports the existing Lottie `eval` and large-chunk warnings.
