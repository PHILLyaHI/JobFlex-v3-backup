// Renders one ad from film2.html at 2x (2160 px wide) and a 1080 px web copy.
//   node render2.js <ad 1-5> <916|45> [fps]
const { chromium } = require("playwright-core");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const HERE = __dirname;
const ad = process.argv[2] || "1";
const fmt = process.argv[3] || "916";
const fps = Number(process.argv[4] || 30);
const W = 1080, H = fmt === "916" ? 1920 : 1350;
const name = `jobflex-roof-ad${ad}-${fmt}`;
const dir = path.join(HERE, "frames", name);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(path.join(HERE, "out2"), { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const page = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => console.log("PAGE ERROR", e.message.split("\n")[0]));
  await page.goto(`file://${HERE}/film2.html?w=${W}&h=${H}&ad=${ad}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  const seconds = await page.evaluate(() => window.__duration);
  const frames = Math.round(seconds * fps);
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate((tt) => window.__seek(tt), i / fps);
    await page.screenshot({ path: path.join(dir, `f${String(i).padStart(5, "0")}.png`), type: "png" });
    if (i % 150 === 0) console.log(`${name}: frame ${i}/${frames} (${Math.round((Date.now() - t0) / 1000)}s)`);
  }
  await b.close();
  const master = path.join(HERE, "out2", `${name}-2160.mp4`);
  const web = path.join(HERE, "out2", `${name}.mp4`);
  // 4K master + a silent stereo track (uploaders want an audio stream); -t not -shortest (ffmpeg 7 quirk)
  execSync(`ffmpeg -v error -y -framerate ${fps} -i "${dir}/f%05d.png" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -map 0:v -map 1:a -c:v libx264 -preset medium -crf 17 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 96k -t ${seconds} "${master}"`, { stdio: "inherit" });
  execSync(`ffmpeg -v error -y -i "${master}" -vf "scale=${W}:${H}:flags=lanczos" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -movflags +faststart -c:a copy "${web}"`, { stdio: "inherit" });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("wrote", master, "and", web);
  process.exit(0); // a lingering browser handle otherwise keeps node alive after the files are written
})().catch((e) => { console.error("RENDER ERROR", e.message.split("\n")[0]); process.exit(1); });
