JobFlex roofing ads — shot list and narration

Four files, all 50 s, 30 fps, H.264 MP4:
  jobflex-roof-v1-916.mp4  1080x1920 vertical, captions only, silent track  → Instagram / Facebook Reels + Stories; for the Higgsfield talking head
  jobflex-roof-v1-169.mp4  1920x1080 wide, captions only, silent track      → YouTube / Google Ads (in-stream); for the Higgsfield talking head
  jobflex-roof-v2-916.mp4  1080x1920 vertical, subtitles + woman's narration → Instagram / Facebook feed + Reels
  jobflex-roof-v2-169.mp4  1920x1080 wide, subtitles + woman's narration     → YouTube / Google Ads

Scenes (same timing in every file):
     0.0–4.0 s  Roof estimator: the address is typed into the real form, cursor presses Measure this roof
    4.0–13.2 s  Aerial: zoom to the house, the roof outline draws itself, pin drops, the numbers count in (area, squares, pitch, facets, ridge, hips, valleys)
   13.2–17.2 s  The measurement report as JobFlex shows it, with the aerial in the page
   17.2–25.6 s  Proposal builder: roof type switched from shingles to standing-seam metal, flashings/vents/tear-off rows highlighted, total counts 12,066 → 26,222
   25.6–31.2 s  The 27 line items, every one editable
   31.2–37.8 s  Cost adjustment: the real Materials / Labor sliders, +12% materials and +5% labor, every line follows proportionally
   37.8–46.2 s  The client's copy: desktop proposal with the roof picture, then the phone slides in and Accept proposal pulses
   46.2–50.0 s  End card: JobFlex — Estimate faster. Win more roofs. — jobflex.app

Narration (V2), start time and words — reuse these for the talking-head script if you like:
    0.4 s  Type the address.
    4.0 s  JobFlex finds the roof from the air, and measures it in seconds. Squares, ridge, hips, valleys. The whole house.
   13.2 s  Your estimate is ready before you finish your coffee.
   17.2 s  Switch shingles to metal with one click. Flashings, vents and tear-off are already in. Change anything you like.
   25.6 s  Twenty-seven lines, every one of them editable.
   31.2 s  Need more labor, or more materials? Slide it, and every line follows, proportionally.
   37.8 s  One click makes the proposal, with the roof picture. Your client accepts right on their phone.
   46.2 s  JobFlex. Estimate faster. Win more roofs.

Notes:
  • Every screen is the real JobFlex app (roof estimator, proposal builder, client portal, desktop and phone) captured from a local copy, not a mock-up.
  • The aerial is Esri World Imagery (credit shown in the film: 'Imagery © Esri, Maxar').
  • The narration voice is the Mac 'Samantha' voice for now. The OpenAI project on the account has no speech-model access (same block as 'Listen to the proposal'); once speech models are allowed, the same lines can be re-voiced with OpenAI's 'marin' voice and the clips re-rendered in a few minutes.

Re-rendering (source/):
  The film is source/film.html — every frame is a function of time, so a change re-renders in about four minutes per clip.
    cd advertisement/source
    NODE_PATH=<a node_modules with playwright-core> node render.js v2 916     # v1|v2, 916|169 → out/jobflex-roof-<version>-<format>.mp4
    node preview.js "2,9,20,33,40,44"                                          # stills at those seconds → frames/pv-*.png
  Narration: n1..n8.wav with start times in narration-cues.json. To re-voice, replace the wav files (same names) and render v2 again.
  Screens: source/assets/*.png were captured from a local JobFlex with ad-capture*.js (the seeded roof is ad-seed.cjs); the aerial tiles are Esri World Imagery.
