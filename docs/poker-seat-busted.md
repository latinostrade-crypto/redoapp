# Zero-stack seat marker

`isPokerSeatBusted` uses authoritative chips and hand stage, not the animated display balance. Zero during preflop/flop/turn/river/showdown remains a live all-in. At ended/match_ended the marker waits for presentation results and chip settlement to complete. Previously eliminated zero-stack players remain marked; positive chips immediately clear it, including after a rebuy.

Both local and opponent `ResistancePlayerSeat` components use the same effect. Two red SVG strokes draw over the avatar in 500 ms; a dark overlay dims the block. The mark persists without looping, while the avatar remains visible underneath rather than dissolving. Renders with the same busted state do not restart the marker. Reduced motion displays the final cross and dimming immediately. No raster assets, dependencies, timers or animation-frame loops were added.

Validation: `npm run test:poker-seat-busted`, `npm run lint`, `npm run build`, `npm run test:traffic`. Local `seat-preview.html` and `output/playwright/check-seat-marker.cjs` cover both seat sizes, all-in, zero-stack loss, rebuy and explicit/system reduced motion. The preview is a Vite development entry and is not included in the production HTML entry.
