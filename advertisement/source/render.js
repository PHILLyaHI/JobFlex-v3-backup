// Renders film.html frame by frame (every frame is a pure function of t) and
// assembles the MP4s with ffmpeg; V2 gets the narration mixed in.
//   node render.js <version:v1|v2> <format:916|169> [fps] [seconds]
const { chromium } = require("playwright-core");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const HERE = __dirname;
const version = process.argv[2] || "v2";
const format = process.argv[3] || "916";
const fps = Number(process.argv[4] || 30);
const seconds = Number(process.argv[5] || 50);
const W = format === "916" ? 1080 : 1920;
const H = format === "916" ? 1920 : 1080;
const name = `jobflex-roof-${version}-${format}`;
const dir = path.join(HERE, "frames", name);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(path.join(HERE, "out"), { recursive: true });

(async () => {
  const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const page = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(`file://${HERE}/film.html?w=${W}&h=${H}&version=${version}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  const frames = Math.round(seconds * fps);
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    const t = i / fps;
    await page.evaluate((tt) => window.__seek(tt), t);
    await page.screenshot({ path: path.join(dir, `f${String(i).padStart(5, "0")}.png`), type: "png" });
    if (i % 150 === 0) console.log(`${name}: frame ${i}/${frames} (${Math.round((Date.now() - t0) / 1000)}s)`);
  }
  await b.close();
  const video = path.join(HERE, "out", `${name}.mp4`);
  const silent = path.join(HERE, "out", `${name}-silent.mp4`);
  execSync(`ffmpeg -v error -y -framerate ${fps} -i "${dir}/f%05d.png" -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -movflags +faststart "${silent}"`, { stdio: "inherit" });
  if (version === "v2") {
    const cue = JSON.parse(fs.readFileSync(path.join(HERE, "narration-cues.json"), "utf8"));
    const inputs = cue.map((c) => `-i "${path.join(HERE, c.file)}"`).join(" ");
    const delays = cue.map((c, i) => `[${i + 1}:a]adelay=${Math.round(c.at * 1000)}|${Math.round(c.at * 1000)}[a${i}]`).join(";");
    const mix = cue.map((_, i) => `[a${i}]`).join("");
    execSync(`ffmpeg -v error -y -i "${silent}" ${inputs} -filter_complex "${delays};${mix}amix=inputs=${cue.length}:normalize=0[voice];[voice]apad[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -shortest "${video}"`, { stdio: "inherit" });
    fs.rmSync(silent);
  } else {
    // a silent stereo track keeps every platform's uploader happy
    execSync(`ffmpeg -v error -y -i "${silent}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -c:v copy -c:a aac -b:a 96k -shortest "${video}"`, { stdio: "inherit" });
    fs.rmSync(silent);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("wrote", video);
})().catch((e) => { console.error("RENDER ERROR", e.message.split("\n")[0]); process.exit(1); });
