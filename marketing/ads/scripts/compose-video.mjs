// Composite raw Veo clips into finished Meta ads:
//   upscale 720x1280 -> 1080x1920, burn brand captions, hold last frame,
//   land a 1.8s blueprint end-card, pad audio to match.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const run = promisify(execFile);
const FF = "C:/joblfex-v3/node_modules/ffmpeg-static/ffmpeg.exe";
const ROOT = "c:/joblfex-v3/marketing/ads";
const RAW = path.join(ROOT, "video");
const OUT = path.join(ROOT, "video", "final");
fs.mkdirSync(OUT, { recursive: true });

const END_DUR = 1.8;
const SRC_DUR = 8.0;
const TOTAL = SRC_DUR + END_DUR;

const manifest = JSON.parse(fs.readFileSync(path.join(RAW, "_overlays", "_manifest.json"), "utf8"));

for (const m of manifest) {
  const src = path.join(RAW, `jobflex-${m.id}-${m.slug}-9x16.mp4`);
  const dst = path.join(OUT, `jobflex-${m.id}-${m.slug}-9x16-final.mp4`);
  if (!fs.existsSync(src)) { console.log("MISSING raw", m.id); continue; }

  const inputs = ["-i", src];
  for (const c of m.caps) inputs.push("-loop", "1", "-i", c.file);
  inputs.push("-loop", "1", "-i", m.end);

  // base: upscale, then clone the final frame to make room for the end card
  const parts = [
    `[0:v]scale=1080:1920:flags=lanczos,fps=24,` +
      `tpad=stop_mode=clone:stop_duration=${END_DUR},setsar=1[base]`,
  ];
  let cur = "base";
  m.caps.forEach((c, i) => {
    const idx = i + 1;
    parts.push(`[${idx}:v]format=rgba,fps=24[c${idx}]`);
    // fade the caption in/out so it doesn't snap
    parts.push(
      `[${cur}][c${idx}]overlay=0:0:eof_action=pass:` +
        `enable='between(t,${c.from + 0.2},${c.to})'[v${idx}]`
    );
    cur = `v${idx}`;
  });
  const endIdx = m.caps.length + 1;
  parts.push(`[${endIdx}:v]scale=1080:1920,fps=24[end]`);
  parts.push(`[${cur}][end]overlay=0:0:eof_action=pass:enable='gte(t,${SRC_DUR})'[vout]`);
  parts.push(`[0:a]apad=pad_dur=${END_DUR},aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[aout]`);

  const args = [
    "-y", "-hide_banner", "-loglevel", "error",
    ...inputs,
    "-filter_complex", parts.join(";"),
    "-map", "[vout]", "-map", "[aout]",
    "-t", String(TOTAL),
    "-c:v", "libx264", "-preset", "medium", "-crf", "20",
    "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.0",
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
    "-movflags", "+faststart",
    dst,
  ];

  try {
    await run(FF, args, { maxBuffer: 1 << 26 });
    const kb = (fs.statSync(dst).size / 1e6).toFixed(1);
    console.log(`OK ${m.id} ${m.slug}  ${kb} MB`);
  } catch (e) {
    console.log(`FAIL ${m.id} ${m.slug}: ${(e.stderr || e.message).toString().slice(0, 400)}`);
  }
}
console.log("done");
