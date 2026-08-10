# JobFlex — 10 Meta ad creatives

Acquisition campaign for JobFlex. Audience: owner-operators of 1–10 person
contractor shops. Offer: 14-day free trial, no card, plans from $29/mo.

Every ad ships in three files: a 1:1 feed static, a 9:16 story/Reels static, and
a 9:16 video with burned-in captions and a brand end-card.

---

## The ten angles

Each ad runs a different motivation, so the set tests ten hypotheses rather than
ten dressings of one. Hook archetypes follow the pattern-interrupt / result /
question / contrarian split that Meta creative testing converges on.

| # | Angle | Hook archetype | The claim it tests |
|---|-------|----------------|--------------------|
| 01 | Speed to quote | Direct statement | Winning is about being first, not cheapest |
| 02 | Before/after split | Visual contrast | Presentation closes the job |
| 03 | Price ladder | Number stack | Category pricing is wrong for small shops |
| 04 | Product demo | Show the thing | The screen sells itself |
| 05 | Fence Studio | Curiosity gap | A capability nobody else has |
| 06 | Material margin | Contrarian reframe | The loss is margin, not bids |
| 07 | Unpaid hours | Stop doing X | Estimating is unpaid labour |
| 08 | Shop size | Identity call-out | Enterprise software is a bad fit |
| 09 | Cash flow | Result-first | Get paid on the porch |
| 10 | Weekend cost | Emotional | Admin is eating your Saturday |

---

## Files

```
marketing/ads/
  ads.json                  source of truth — copy, angles, prompts, caption beats
  ads-upload.csv            30 rows (10 ads × 3 placements) for Ads Manager
  static/                   20 PNGs — *-1080x1080.png (feed), *-1080x1920.png (story)
  video/final/              10 MP4s — 1080×1920, 9.8s, H.264 + AAC, faststart
  video/                    raw 8s Veo clips before caption/end-card burn-in
  plates/                   photographic plates used inside the statics
  scripts/                  the generators (all re-runnable)
```

## How it was built

**Statics are rendered HTML, not diffusion output.** The blueprint system is
Inter 900 caps, exact `#1854a0`, 2px ink frames and `3px 3px 0` hard shadows —
image models land text around 90% of the time and would visibly miss those
specs. `scripts/templates.mjs` builds the layouts from the DESIGN.md tokens and
Playwright screenshots them. Costs nothing and re-renders infinitely, so new
headline variants are a data edit, not a regeneration.

Borders and shadows are scaled ~2× from the UI spec (4px rather than 2px)
because a 1080px canvas renders at roughly half size in-feed. That preserves the
character of the hard-frame language rather than its literal pixel value.

**Photography comes from fal.ai** (`flux-pro/v1.1-ultra`) for the three plates
that genuinely need a photograph — the legal-pad estimate, the aerial backyard,
the porch payment. Everything else is drawn from brand tokens.

**Video is fal.ai Veo3 Fast**, 8s 9:16 with native audio, then composited with
ffmpeg: upscaled to 1080×1920, brand captions burned in over the first two
beats, last frame held, and a 1.8s blueprint end-card landed on the tail.

Captions are non-negotiable — most of this inventory is watched on mute, and the
caption plates are rendered from the same brand stack as the statics rather than
ffmpeg `drawtext`, so the typography matches exactly.

## Brand rules held

The anti-references in DESIGN.md were treated as hard constraints, not
preferences. No hi-vis yellow, no hard hats, no hammer mascots, no orange CTAs,
no purple gradients, no glassmorphism, no stock-photo grinning. The video prompts
carry an explicit negative prompt for all of it, and the contractor wardrobe is
plain navy work shirt throughout.

Copy voice is plain and specific — "3.2 hrs", "212 LF", "$14.38" rather than
round marketing numbers. Nothing says "AI"; the feature is Smart Proposal.

Distribution across the statics holds roughly 80% paper/ink, 15% blueprint, 5%
sky and status — blueprint stays an accent.

## Copy limits

All 30 rows are inside Meta's limits: primary text ≤125 characters (the point
where "… See more" truncates), headline ≤40, description ≤30. Six drafts
originally ran long and were tightened rather than allowed to truncate.

---

## Before you spend money on these

1. **Verify the ad 03 price claim.** The creative deliberately names no
   competitor — it says "category leader — mid tier, $149/mo" — which keeps it
   clear of Meta's comparative-claims policy. That $149 figure came from
   published pricing found during research and needs re-checking against the
   live page before launch. If it has moved, edit `ads.json` and re-render; no
   regeneration cost.
2. **Point the CTAs somewhere.** Every ad promises a 14-day trial with no card.
   Confirm that is what the signup flow actually does.
3. **Test hooks first.** Hooks drive most of the performance variance. The ten
   angles are the real experiment; run them at equal budget to one audience
   before optimising anything else.
4. **AD-05 is the differentiator.** Fence Studio is the only claim here that no
   competitor can copy. If budget is tight, weight it.

## Re-running

```bash
node scripts/render-static.mjs     # statics — free, no API calls
node scripts/render-overlays.mjs   # caption plates + end cards — free
node scripts/compose-video.mjs     # burn-in — free, needs raw clips present
node scripts/gen-video.mjs 03      # re-render one clip — BILLS fal.ai (~$1.20)
node scripts/gen-plates.mjs        # photographic plates — BILLS fal.ai (~$0.20)
```

`gen-video.mjs` skips any ad whose MP4 already exists, records job handles to
`video/_jobs.json` before polling, and `collect-video.mjs` recovers a crashed run
without re-submitting. fal's queue status URLs drop the model sub-path
(`fal-ai/veo3/fast` → `fal-ai/veo3/requests/...`), so always use the `status_url`
returned by the submit call rather than building the path.
