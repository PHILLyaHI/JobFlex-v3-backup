// Generate the presenter: portrait -> TTS voiceovers -> talking-head videos.
// Usage: node gen-presenter.mjs [portrait|tts|talk|all]
import fs from "node:fs";
import path from "node:path";
import { submit, poll, result, download, sleep } from "../../scripts/fal.mjs";

const ROOT = "c:/joblfex-v3/marketing/ads/v2-real-ui";
const P = path.join(ROOT, "presenter");
fs.mkdirSync(P, { recursive: true });

const PORTRAIT_PROMPT =
  "Professional headshot video-call style portrait of a friendly American woman in her early 30s, " +
  "light brown hair pulled back, wearing a navy blue work shirt, warm confident smile, looking " +
  "directly into the camera, head and shoulders centered, plain warm light-grey studio background, " +
  "soft natural lighting, photorealistic, sharp focus";

const VO = {
  "smart-proposal":
    "This is JobFlex. Watch this. I type the job in plain words, and the A I builds the whole " +
    "estimate. Real materials, real labor, a real price. Five thousand five hundred seventy six " +
    "dollars, ready for the client. No spreadsheets. No late nights. You send it before the other " +
    "guy even measures. Try JobFlex free for fourteen days. No card needed.",
  "fence-studio":
    "Okay, this is crazy. This is the actual yard, from a satellite. I trace the fence line, and " +
    "JobFlex measures it. Two hundred twenty six feet. Swap the material, pick the height, and the " +
    "price updates live. Fifteen thousand dollars, one tap to proposal. Your client gets the quote " +
    "while you are still standing in the yard. JobFlex. Free for fourteen days.",
};

async function runJob(model, body, label) {
  const job = await submit(model, body);
  console.log(label, "submitted", job.request_id);
  for (let i = 0; i < 240; i++) {
    await sleep(5000);
    const s = await poll(job);
    if (s.status === "COMPLETED") return result(job);
    if (s.status === "FAILED" || s.error) throw new Error(label + " failed: " + JSON.stringify(s).slice(0, 300));
    if (i % 6 === 0) console.log(label, s.status ?? "…");
  }
  throw new Error(label + " timeout");
}

const step = process.argv[2] ?? "all";

// 1 · portrait
if (step === "portrait" || step === "all") {
  const r = await runJob(
    "fal-ai/flux-pro/v1.1-ultra",
    { prompt: PORTRAIT_PROMPT, aspect_ratio: "1:1", output_format: "jpeg", safety_tolerance: "5" },
    "portrait"
  );
  const url = r.images?.[0]?.url;
  if (!url) throw new Error("no portrait url: " + JSON.stringify(r).slice(0, 300));
  await download(url, path.join(P, "portrait.jpg"));
  console.log("portrait saved");
}

// 2 · voiceovers
if (step === "tts" || step === "all") {
  for (const [slug, text] of Object.entries(VO)) {
    const r = await runJob(
      "fal-ai/kokoro/american-english",
      { prompt: text, voice: "af_heart", speed: 1.0 },
      "tts:" + slug
    );
    const url = r.audio?.url;
    if (!url) throw new Error("no audio url: " + JSON.stringify(r).slice(0, 300));
    await download(url, path.join(P, `vo-${slug}.wav`));
    console.log("vo saved", slug);
  }
}

// 3 · talking heads (image + audio -> video)
if (step === "talk" || step === "all") {
  // upload local files to fal storage
  async function upload(file, mime) {
    const { KEY } = await import("../../scripts/fal.mjs");
    const r = await fetch("https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3", {
      method: "POST",
      headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ file_name: path.basename(file), content_type: mime }),
    });
    const j = await r.json();
    if (!j.upload_url || !j.file_url) throw new Error("upload init failed: " + JSON.stringify(j).slice(0, 200));
    const put = await fetch(j.upload_url, { method: "PUT", headers: { "Content-Type": mime }, body: fs.readFileSync(file) });
    if (!put.ok) throw new Error("upload put " + put.status);
    return j.file_url;
  }
  const imgUrl = await upload(path.join(P, "portrait.jpg"), "image/jpeg");
  console.log("portrait uploaded", imgUrl);
  for (const slug of Object.keys(VO)) {
    const audUrl = await upload(path.join(P, `vo-${slug}.wav`), "audio/wav");
    const r = await runJob(
      "fal-ai/omnihuman",
      { image_url: imgUrl, audio_url: audUrl },
      "talk:" + slug
    );
    const url = r.video?.url;
    if (!url) throw new Error("no video url: " + JSON.stringify(r).slice(0, 400));
    await download(url, path.join(P, `talk-${slug}.mp4`));
    console.log("talking head saved", slug);
  }
}
console.log("done");
