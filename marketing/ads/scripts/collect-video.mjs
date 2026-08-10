// Resume-safe collector: reads video/_jobs.json and downloads any request that
// has since COMPLETED on fal. Safe to re-run; never re-submits, never re-bills.
import fs from "node:fs";
import path from "node:path";

const ROOT = "c:/joblfex-v3/marketing/ads";
const OUT = path.join(ROOT, "video");
const MODEL = "fal-ai/veo3/fast";

const env = fs.readFileSync("c:/joblfex-v3/.env.local", "utf8");
const KEY = env.match(/^FAL_KEY=(.*)$/m)[1].trim().replace(/^["']|["']$/g, "");
const auth = { Authorization: `Key ${KEY}` };

const jobs = JSON.parse(fs.readFileSync(path.join(OUT, "_jobs.json"), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pending = new Map();
for (const job of jobs) {
  const file = path.join(OUT, `jobflex-${job.id}-${job.slug}-9x16.mp4`);
  if (fs.existsSync(file) && fs.statSync(file).size > 10000) {
    console.log(`have  ${job.id} ${job.slug}`);
    continue;
  }
  pending.set(job.request_id, { ...job, file });
}

const deadline = Date.now() + 14 * 60 * 1000;
let first = true;
while (pending.size && Date.now() < deadline) {
  if (!first) await sleep(15000);
  first = false;
  for (const [id, job] of [...pending]) {
    const s = await fetch(`https://queue.fal.run/${MODEL}/requests/${id}/status`, { headers: auth })
      .then((r) => r.json()).catch(() => ({}));
    if (s.status === "COMPLETED") {
      const res = await fetch(`https://queue.fal.run/${MODEL}/requests/${id}`, { headers: auth }).then((r) => r.json());
      const url = res?.video?.url;
      if (url) {
        const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
        fs.writeFileSync(job.file, buf);
        console.log(`SAVED ${job.id} ${job.slug}  ${(buf.length / 1e6).toFixed(1)} MB`);
      } else {
        console.log(`NOURL ${job.id} :: ${JSON.stringify(res).slice(0, 200)}`);
      }
      pending.delete(id);
    } else if (s.status === "FAILED") {
      console.log(`FAIL  ${job.id} ${job.slug} :: ${JSON.stringify(s).slice(0, 200)}`);
      pending.delete(id);
    }
  }
  if (pending.size) console.log(`  ...${pending.size} still rendering`);
}
console.log(pending.size ? `TIMEOUT: ${pending.size} still pending` : "all collected");
