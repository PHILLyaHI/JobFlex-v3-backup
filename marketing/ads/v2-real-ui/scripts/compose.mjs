// Compose the v2 real-UI ads: hook card + real screen recording + end card,
// 1080x1920 H.264 with silent AAC. Usage: node compose.mjs [slug ...]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ADS, HOOK_S, END_S, WIN } from "./ads-v2.mjs";

const FF = "c:/joblfex-v3/node_modules/ffmpeg-static/ffmpeg.exe";
const ROOT = "c:/joblfex-v3/marketing/ads/v2-real-ui";
const A = path.join(ROOT, "assets");
const OUT = path.join(ROOT, "final");
fs.mkdirSync(OUT, { recursive: true });

const RECS = {
  "smart-proposal": "smart.webm",
  "materials-prices": "materials.webm",
  "fence-studio": "fence.webm",
  "proposal-pipeline": "proposals.webm",
  "crew-calendar": "calendar.webm",
};

const only = process.argv.slice(2);

for (const ad of ADS) {
  if (only.length && !only.includes(ad.slug)) continue;
  const win = WIN[ad.kind];
  const rec = path.join(ROOT, "rec", RECS[ad.slug]);
  const bg = path.join(A, `${ad.slug}-bg.png`);
  const hook = path.join(A, `${ad.slug}-hook.png`);
  const end = path.join(A, "endcard.png");
  const out = path.join(OUT, `jobflex-${ad.slug}-9x16.mp4`);

  const mainDur = ad.segments.reduce((s, g) => s + (g.to - g.ss) / g.speed, 0);
  const total = HOOK_S + mainDur + END_S;

  // ---- filtergraph
  const f = [];
  // segments from the recording
  const segNames = [];
  // Playwright screencasts land at CSS resolution top-left on a grey canvas —
  // crop the native content region first, then scale.
  const native = ad.kind === "mobile" ? "crop=390:844:0:0" : "crop=1440:900:0:0";
  ad.segments.forEach((g, i) => {
    const crop = g.cropRight ? `,crop=iw/2:ih:iw/2:0` : "";
    f.push(
      `[0:v]trim=start=${g.ss}:end=${g.to},setpts=(PTS-STARTPTS)/${g.speed},${native}${crop},` +
      `scale=${win.w}:${win.h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${win.w}:${win.h},setsar=1[seg${i}]`
    );
    segNames.push(`[seg${i}]`);
  });
  f.push(`${segNames.join("")}concat=n=${ad.segments.length}:v=1:a=0[screen]`);
  // main = bg + screen + captions
  f.push(`[1:v]loop=loop=-1:size=1[bgl];[bgl]trim=duration=${mainDur.toFixed(3)}[bgd]`);
  f.push(`[bgd][screen]overlay=${win.x}:${win.y}:shortest=0[m0]`);
  let cur = "m0";
  ad.captions.forEach((c, i) => {
    const from = Math.max(0, c.from - HOOK_S).toFixed(2);
    const to = Math.max(0, c.to - HOOK_S).toFixed(2);
    const capY = ad.kind === "mobile" ? 1600 : 1330;
    f.push(`[${cur}][${4 + i}:v]overlay=0:${capY}:enable='between(t,${from},${to})'[m${i + 1}]`);
    cur = `m${i + 1}`;
  });
  // hook + main + end
  f.push(`[2:v]loop=loop=-1:size=1[hl];[hl]trim=duration=${HOOK_S}[hook]`);
  f.push(`[3:v]loop=loop=-1:size=1[el];[el]trim=duration=${END_S}[endc]`);
  f.push(`[hook][${cur}][endc]concat=n=3:v=1:a=0,fps=30,format=yuv420p[v]`);

  const args = [
    "-y",
    "-i", rec,
    "-i", bg,
    "-i", hook,
    "-i", end,
    ...ad.captions.flatMap((c, i) => ["-i", path.join(A, `${ad.slug}-cap${i}.png`)]),
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-filter_complex", f.join(";"),
    "-map", "[v]",
    "-map", `${4 + ad.captions.length}:a`,
    "-t", total.toFixed(2),
    "-c:v", "libx264", "-preset", "medium", "-crf", "19",
    "-c:a", "aac", "-b:a", "96k",
    "-movflags", "+faststart",
    out,
  ];
  console.log(`compose ${ad.slug} — main ${mainDur.toFixed(1)}s, total ${total.toFixed(1)}s`);
  execFileSync(FF, args, { stdio: ["ignore", "ignore", "inherit"] });
  console.log("wrote", out);
}
