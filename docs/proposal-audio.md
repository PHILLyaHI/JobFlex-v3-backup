# Listen to this proposal (2026-09-23)

A client can listen to the summary of a proposal and its totals while driving.
The same play sits on the contractor's proposal line, so the office hears what
went out. Works for every estimator: roof, fence, HVAC, and the Smart Proposal.

## What the client hears

The words are a fixed template, never a model — a proposal is a money document
and the audio must say exactly the numbers on the page. `src/lib/proposalSpeech.ts`
(pure) writes them as a forty-second brief in six short paragraphs, and the
voice pauses between them (owner, 2026-09-24: "just brief about the estimate
and totals"):

1. Who it is from and what this is: "Hi Rick, this is Ridgeline Roofing with a
   quick summary of your roofing proposal."
2. The job in one breath: the street, the title, one sentence of the scope
   (cut at a clause when it runs long; the fence package's "Please note" block
   stays on the page). A scope hidden by "Show to client" is not read; the
   description stands in.
3. The main items, named — the three biggest, short names, no prices.
4. The total with the tax ("Your total comes to $11,306.52, including
   $1,046.52 in sales tax"), then a discount and the contract total with
   approved change orders when they apply.
5. The payment stages as dollars ("Payment is in two steps: deposit, $3,391.96,
   then final payment, $7,914.56"), what has been paid and what is still due,
   and how long the price holds (an expired price asks for a call).
6. The company's phone dictated in digit groups, then what to do: open the
   link when parked and accept, or — for an accepted, paid or declined
   proposal — the matching line.

Typography meant for the eye is rewritten for a voice: `2"×4"` → "2 by 4 inch",
`6'` → "6 foot", `24 sq ft` → "24 square feet", `#1` → "number 1", `&` → "and",
dashes become pauses.

## How it is made and kept

`src/lib/proposalAudio.ts` (server) reads the script with OpenAI's steerable
speech model `gpt-4o-mini-tts` — the `marin` voice (then `coral`) with a
delivery brief: a warm, friendly woman from the front office, unhurried, a
clear pause at every paragraph, dollar amounts slow and clear — and falls back
to `tts-1-hd`, then `tts-1`, with `nova`. It keeps the MP3 in the database
and the file's address with the hash of the script on the proposal row:

- `ProposalAudio` — one row per proposal: `hash`, `model`, `voice` (so the
  database says which voice a client heard), `bytes` (a forty-second MP3 is a
  few hundred kilobytes). Production has no Blob store — before this table
  (2026-09-24) every play there was the phone's own voice.
- `Proposal.audioUrl`, `Proposal.audioScriptHash` — the served path
  (`/api/public-quote/<publicId>/audio/file?v=<hash>`) and the cache key.
- Both additive; applied to production by hand before the deploy.
- `GET …/audio/file?v=<hash>` streams the bytes with byte ranges (iPhones
  ask for them) and a one-year immutable cache; a stale hash answers 404.

The hash is the cache key: a price edit, a discount or an approved change
order moves it, and the next play is read again with the new numbers. The
old file is deleted best-effort.

- `sendProposal` warms the audio after the response (`afterResponse`), so the
  client's first tap plays at once. It never blocks or fails the send.
- `GET /api/public-quote/[publicId]/audio` serves it and makes it on demand:
  a cache hit is one read; a miss is rate-limited per client IP (12/hour) and
  per proposal (6/hour). Without an OpenAI key or a Blob token — or when the
  limit is hit or the model fails — the route answers with the script and
  `mode: "device"` plus `why` (`no-openai`, `limited`, `failed`),
  and the browser reads it with the device's own voice. `?probe=1` is a check
  that writes no feed line. Production needs `OPENAI_API_KEY` for the recorded voice (and the key's
  project must be entitled to a speech model).
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
