# JobFlex — v2 ad batch: real product UI

Five Meta (Facebook/Instagram) ads. Unlike the v1 batch, **every frame of
product content is the actual JobFlex app**, screen-recorded from the local
dev build with Playwright — no AI-generated screens, no mockups. Hook cards,
captions and the end card are rendered HTML in the blueprint brand language
(Inter 900 caps, `#1854a0`, ink frames, hard shadows).

## The five ads

| # | Slug | Feature | Video | Static |
|---|------|---------|-------|--------|
| 1 | `smart-proposal` | Smart Proposal AI estimator — wizard → brief → live generation → $5,576 estimate | 29.7s | 1080×1080 |
| 2 | `materials-prices` | Materials Request — shoppable list, live retail prices, Home Depot/Lowe's/Ace buy links, $9,944 total | 24.5s | 1080×1080 |
| 3 | `fence-studio` | Fence Studio — trace on satellite, 226 ft live measure, material/height swap → $15,187 | 26.2s | 1080×1080 |
| 4 | `proposal-pipeline` | Proposals — $297,395 pipeline masthead → open the live document editor | 25.9s | 1080×1080 |
| 5 | `crew-calendar` | Scheduling — month board → day detail (crew, client, scope) → quick-add | 25.2s | 1080×1080 |

Every video: 1080×1920 9:16, 30fps, H.264 + silent AAC, faststart,
structure `1.6s hook card → real UI flow → 3.2s end card` (25–30s total).

## Files

```
v2-real-ui/
  final/          5 MP4s + 5 static PNGs — the deliverables
  ads-upload.csv  copy per ad for Ads Manager
  rec/            raw Playwright screen recordings + mark timelines
  shots/          hi-res money screenshots (DPR2) used by the statics
  assets/         rendered hook/bg/caption/endcard PNGs
  scripts/        the pipeline (all re-runnable)
  probe/ debug/ check/   working artifacts
```

## Pipeline (re-runnable)

1. `node scripts/record.mjs <smart|materials|fence|proposals|calendar>` —
   logs in as the seed owner (`owner@acme.test`), drives the real flow at
   390×844 (mobile) or 1440×900 (desktop), records webm + mark timeline.
   Requires `npm run dev` on :3000. Tap ripples are injected so touches are
   visible; the Next.js dev badge is hidden.
2. `node scripts/assets.mjs` — renders hook/bg/captions/end card from
   `scripts/ads-v2.mjs` (copy + timing source of truth).
3. `node scripts/compose.mjs [slug…]` — ffmpeg: trims/speeds segments, crops
   the native content region (Playwright screencasts land at CSS resolution
   top-left on a grey canvas), lanczos-upscales into the canvas window,
   burns timed captions, concats hook + main + end card.
4. `node scripts/statics.mjs` — brand frame + real screenshot crops.

## Gotchas learned

- Playwright `recordVideo.size` does NOT upscale: frames arrive at CSS
  resolution (390×844 / 1440×900) top-left on grey. Compose must
  `crop=390:844:0:0` first.
- Seed data leaks: avoid the Crew Inbox (test junk names) and the
  `Roof Replacement Proposal` detail (real client name + address). The
  proposals ad uses the unassigned Cedar Pergola document instead.
- The generated estimate price changes per AI run — captions quoting the
  number (`$5,576`) must be re-checked after any re-record of `smart`.
- Meta specs: primary text front-loads at 125 chars; headlines ≤40; both in
  `ads-upload.csv`.
