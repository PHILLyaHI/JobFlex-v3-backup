JobFlex roofing — five ads for a split test (same offer line on all five, so the concept is what gets measured)

Each ad comes in two files:
  jobflex-roof-adN-916.mp4   1080x1920  9:16  → Instagram Reels / Stories, Facebook Reels / Stories
  jobflex-roof-adN-45.mp4    1080x1350  4:5   → Instagram feed, Facebook feed
All are 28–29 s, 30 fps, H.264, with a silent stereo track (uploaders want an audio stream). 4K masters (2160 px wide,
same names with -2160) are on the Desktop in jobflex-ads/five-ads-4k — upload those where the platform accepts them;
Meta downsizes to 1080 anyway, but from a cleaner source.

Ad 1 · Coffee Clock (yellow, stopwatch)      "Your coffee's still hot."
  Speed. A timer runs across the whole flow: address typed → house found from the air → measured (16.8 squares) →
  priced (27 lines, $12,066) → proposal on the client's phone. Ends at 00:24.0. CTA: Time it yourself.
Ad 2 · Five Sheets (cream blueprint, numbered)  "Address to signature."
  The whole job in five numbered sheets: address, measured from the air, priced (shingles/metal switch), one-click proposal
  with the roof picture, accepted on the phone. CTA: Run your next roof.
Ad 3 · Receipt Roll (black, receipt printing)  "Stop chasing the deposit."
  Getting paid: accept on the phone → 30% deposit due now → deposit paid → the dashboard shows "$8,377.81 received" →
  every job shows paid/due. A receipt prints down the right edge as it happens. CTA: Get paid by stage.
Ad 4 · Metal Switch (blue, toggle)             "Same roof. Two prices."
  Options: shingles $12,066, flip the switch, metal $26,222; the Materials/Labor sliders spread through every line;
  any line editable; sent to the phone. CTA: Price it both ways.
Ad 5 · First Bid (pale blue, serif, notifications)  "The first bid wins."
  The homeowner's side: notification → their roof with a pin → the price line by line → "Listen to this proposal" →
  type a name, accepted → the contractor gets the ping. CTA: Be their first bid.

Every screen is the real JobFlex app captured from a local copy (roof estimator, measurement report, proposal builder,
client proposal on desktop and phone, payment schedule, dashboard activity). The aerial is Bing Maps imagery at zoom 20
with a pin; the payment states were staged on the local copy (accepted by "Sarah Mitchell", deposit marked paid).
Numbers on screen: 1,681 sq ft · 16.8 squares · 6/12 · 8 facets · 27 lines · shingles $12,066 · metal $26,222 ·
proposal total $27,926.05 · deposit 30% $8,377.82.

Re-rendering: source is advertisement/source/film2.html (one page, ?ad=1..5&w=1080&h=1920|1350);
  node render2.js <ad> <916|45>   → out2/…-2160.mp4 (4K master) and out2/….mp4 (1080)
  node preview2.js <ad> "1,5,10"  → stills
Sound: silent by design (feed autoplay is muted); a narration can be added to any of them on request.
