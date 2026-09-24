# Listen to this proposal (2026-09-23)

A client can listen to the summary of a proposal and its totals while driving.
The same play sits on the contractor's proposal line, so the office hears what
went out. Works for every estimator: roof, fence, HVAC, and the Smart Proposal.

## What the client hears

The words are a fixed template, never a model — a proposal is a money document
and the audio must say exactly the numbers on the page. `src/lib/proposalSpeech.ts`
(pure) writes them, in the order a driver needs:

1. Who it is from and how long it takes: "Hi Rick. Here's your roofing proposal
   from Ridgeline Roofing, in about a minute, so you can keep driving."
2. Which house (the street line only) and what the job is: the title, then the
   scope's opening sentences (the fence package's "Please note" block stays on
   the page). A scope hidden by "Show to client" is not read; the description
   stands in.
3. The three biggest items with quantity, unit and price ("Architectural
   shingles, 24 squares, at $6,480"). Three items or fewer are all read.
4. The total on its own, then the tax, a discount, and the contract total with
   approved change orders when it differs.
5. The payment stages as dollars ("Payment is in 2 steps: Deposit, $3,391.96;
   and Final payment, $7,914.56"), what has been paid and what is still due,
   and how long the price holds (an expired price asks for a call).
6. The company's phone dictated in digit groups, then what to do: open the
   link when parked and accept, or — for an accepted, paid or declined
   proposal — the matching line.

Typography meant for the eye is rewritten for a voice: `2"×4"` → "2 by 4 inch",
`6'` → "6 foot", `24 sq ft` → "24 square feet", `#1` → "number 1", `&` → "and",
dashes become pauses.

## How it is made and kept

`src/lib/proposalAudio.ts` (server) reads the script with OpenAI's speech
model (`gpt-4o-mini-tts` with a voice instruction, falling back to `tts-1`),
keeps the MP3 in Vercel Blob (`proposal-audio/<proposalId>/<hash>.mp3`) and
stores the file's URL with the hash of the script on the proposal row:

- `Proposal.audioUrl`, `Proposal.audioScriptHash` — two nullable text columns
  (additive; applied to production by hand before the deploy).

The hash is the cache key: a price edit, a discount or an approved change
order moves it, and the next play is read again with the new numbers. The
old file is deleted best-effort.

- `sendProposal` warms the audio after the response (`afterResponse`), so the
  client's first tap plays at once. It never blocks or fails the send.
- `GET /api/public-quote/[publicId]/audio` serves it and makes it on demand:
  a cache hit is one read; a miss is rate-limited per client IP (12/hour) and
  per proposal (6/hour). Without an OpenAI key or a Blob token — or when the
  limit is hit or the model fails — the route answers with the script and
  `mode: "device"`, and the browser reads it with the device's own voice.
- A client's play writes a `LISTENED` activity event to the feed once every
  twelve hours ("Rick listened to …"). The company's own members are not
  counted, like their own opens.

## Where it plays

- Client portal, desktop and handheld trees: the card under the total in the
  intro card (`src/components/portal/listen-card.tsx`). Play, pause, a
  progress bar (seekable on a file), the time, "read by your device" when the
  device voice is used. The proposal email's link opened with `?listen=1`
  scrolls the card into view and lights it — never autoplay. Media Session
  metadata puts the play on the lock screen and the car's display.
- Contractor: the proposals list's row menu ("Listen to the proposal") and the
  accepted card's Listen button open a small panel at the bottom right
  (`src/components/v3/proposals-blueprint/listen-panel.ts`), same engine,
  same file.
- The engine (`src/components/portal/listen-engine.ts`) is framework-free and
  shared by both. The device voice reads sentence by sentence (long
  utterances get cut off by some browsers); pause on the device path stops
  and resumes at the current sentence.
- The proposal email says the link can be listened to.

## Checks

`scripts/qa/proposal-speech.check.ts` — roof, fence, HVAC and Smart scripts,
the helpers, the hash and the cap. Stand walk: `adshoot/listen.js`
(speechSynthesis mocked; the stand has no voice model).

## Open

- The handheld contractor list (mobile-proposals-v2) has no Listen yet.
- A Spanish reading for a Spanish-speaking client.
