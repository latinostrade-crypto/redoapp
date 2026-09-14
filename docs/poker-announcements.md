# Readable table announcements

`TableAnnouncement` renders the existing presentation cue with a high-contrast title, player/detail and a thin lifetime bar. ALL IN uses a red border, dark red background and a 21 px title. The entrance slides down from above over 240 ms; there is no looping shake or flash.

`PokerTable` reserves a constant 48 px strip above its playfield. The 38 px announcement sits in that strip, in a single horizontal row. Seats, bank, community cards, turn text and chip coordinates all belong to the playfield below it; neither cue arrival nor departure changes their positions. Reduced motion removes the slide and lifetime animation.

ALL IN stays for 2200 ms, ordinary player actions for 1400 ms, street/showdown and presence messages for 1600 ms, and pot capture for 1800 ms. READY/GAME START keep their original introductory durations. Cue scheduling never changes board delivery, payout, server state or turn deadlines.

The presentation queues messages behind the current one instead of interrupting it. It keeps at most three outstanding messages at an enqueue time; when full, a newer message replaces the last pending one, while pending impact messages are protected from ordinary messages. New hands, recovery and reduced motion clear cues as before. The queue is presentation-only and is not an action log.

Validation: `npm run test:poker-motion`, `npm run lint`, `npm run build`, `npm run test:traffic`. Local `cue-preview.html` uses the real presentation and announcement components; `output/playwright/check-cues.cjs` checks sustained visibility, two queued all-ins, regular actions, reset and mobile overflow. It is a development preview, not a production HTML entry.
