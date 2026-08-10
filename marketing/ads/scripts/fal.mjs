// Shared fal.ai queue helpers.
// IMPORTANT: fal's queue status/result URLs drop the model sub-path
// (fal-ai/veo3/fast -> fal-ai/veo3/requests/...). Never build these by hand —
// always use the status_url / response_url returned by the submit call.
import fs from "node:fs";

export const KEY = fs
  .readFileSync("c:/joblfex-v3/.env.local", "utf8")
  .match(/^FAL_KEY=(.*)$/m)[1]
  .trim()
  .replace(/^["']|["']$/g, "");

export const authHeaders = { Authorization: `Key ${KEY}`, "Content-Type": "application/json" };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function submit(model, body) {
  const r = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.request_id) {
    throw new Error(`submit ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  }
  return {
    request_id: j.request_id,
    status_url: j.status_url,
    response_url: j.response_url,
  };
}

export async function poll(job) {
  const r = await fetch(job.status_url, { headers: { Authorization: `Key ${KEY}` } });
  return r.json().catch(() => ({}));
}

export async function result(job) {
  const r = await fetch(job.response_url, { headers: { Authorization: `Key ${KEY}` } });
  return r.json();
}

export async function download(url, file) {
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  fs.writeFileSync(file, buf);
  return buf.length;
}
