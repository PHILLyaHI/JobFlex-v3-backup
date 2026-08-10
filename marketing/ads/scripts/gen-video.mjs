// Generate vertical (9:16) video ads via fal.ai Veo3 Fast.
//   node gen-video.mjs            -> all ten
//   node gen-video.mjs 02 03 04   -> only those ids
// Submits, records job handles to video/_jobs.json immediately (so a crash is
// recoverable via collect-video.mjs), then polls and downloads.
import fs from "node:fs";
import path from "node:path";
import { authHeaders, submit, poll, result, download, sleep } from "./fal.mjs";

const ROOT = "c:/joblfex-v3/marketing/ads";
const OUT = path.join(ROOT, "video");
const MODEL = "fal-ai/veo3/fast";

let { ads } = JSON.parse(fs.readFileSync(path.join(ROOT, "ads.json"), "utf8"));
const only = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
if (only.length) ads = ads.filter((a) => only.includes(a.id));

const NEGATIVE =
  "text overlays, captions, subtitles, watermarks, logos, brand names, " +
  "hi-vis safety yellow clothing, hard hats, cartoon, illustration, 3d render, " +
  "oversaturated, stock-photo smiling, staged poses, purple lighting, lens flare";

const log = (m) => {
  console.log(m);
  fs.appendFileSync(path.join(OUT, "_run.log"), m + "\n");
};

// Merge with any existing job handles so re-runs don't lose earlier submissions.
const jobsFile = path.join(OUT, "_jobs.json");
const existing = fs.existsSync(jobsFile) ? JSON.parse(fs.readFileSync(jobsFile, "utf8")) : [];
const byId = new Map(existing.map((j) => [j.id, j]));

for (const ad of ads) {
  const file = path.join(OUT, `jobflex-${ad.id}-${ad.slug}-9x16.mp4`);
  if (fs.existsSync(file) && fs.statSync(file).size > 10000) {
    log(`skip (already have) ${ad.id} ${ad.slug}`);
    continue;
  }
  try {
    const handle = await submit(MODEL, {
      prompt: ad.video_prompt,
      aspect_ratio: "9:16",
      duration: "8s",
      resolution: "720p",
      generate_audio: true,
      negative_prompt: NEGATIVE,
    });
    byId.set(ad.id, { id: ad.id, slug: ad.slug, ...handle });
    fs.writeFileSync(jobsFile, JSON.stringify([...byId.values()], null, 2));
    log(`submitted ${ad.id} ${ad.slug} -> ${handle.request_id}`);
  } catch (e) {
    log(`SUBMIT FAIL ${ad.id} ${ad.slug} :: ${e.message}`);
  }
}

// ---- poll ---------------------------------------------------------------
const pending = new Map();
for (const j of byId.values()) {
  const file = path.join(OUT, `jobflex-${j.id}-${j.slug}-9x16.mp4`);
  if (!(fs.existsSync(file) && fs.statSync(file).size > 10000)) pending.set(j.request_id, { ...j, file });
}
log(`\npolling ${pending.size} job(s)...\n`);

let done = 0, failed = 0, first = true;
const deadline = Date.now() + 25 * 60 * 1000;
while (pending.size && Date.now() < deadline) {
  if (!first) await sleep(15000);
  first = false;
  for (const [id, job] of [...pending]) {
    const s = await poll(job).catch(() => ({}));
    if (s.status === "COMPLETED") {
      const res = await result(job);
      const url = res?.video?.url;
      if (url) {
        const bytes = await download(url, job.file);
        log(`DONE  ${job.id} ${job.slug}  ${(bytes / 1e6).toFixed(1)} MB`);
        done++;
      } else {
        log(`NO URL ${job.id} :: ${JSON.stringify(res).slice(0, 200)}`);
        failed++;
      }
      pending.delete(id);
    } else if (s.status === "FAILED") {
      log(`FAILED ${job.id} ${job.slug} :: ${JSON.stringify(s).slice(0, 200)}`);
      failed++;
      pending.delete(id);
    }
  }
  if (pending.size) log(`  ...${pending.size} still rendering`);
}
log(`\n=== ${done} rendered, ${failed} failed, ${pending.size} timed out ===`);
