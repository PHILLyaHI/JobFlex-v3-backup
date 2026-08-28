/* The one .env loader for harnesses.
 *
 * There were fifteen copies of this, and every one had the same bug: the guard
 * `process.env[k] === undefined` treats an EMPTY value as already set. This
 * repo's `.env` ships 32 blank keys (it is a filled-in copy of `.env.example`,
 * with the real values in `.env.local`), and Prisma loads `.env` at import
 * time — so any harness that imports something touching the database inherited
 * GOOGLE_MAPS_API_KEY="" and could not overwrite it. Every Solar call then came
 * back 403 "Method doesn't allow unregistered callers", which reads like a key
 * problem rather than a loading problem.
 *
 * That is the SECOND time this trap has fired: sdk/openai.ts already documents
 * it for OPENAI_MODEL, where module-level constants are captured before a
 * harness's loader runs.
 *
 * Two rules here, and both matter:
 *   - EMPTY COUNTS AS UNSET. `""` is not a configured value.
 *   - `.env.local` wins over `.env`, matching how Next.js resolves them, so a
 *     harness and the server never disagree about which key is live.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Load .env.local then .env, filling anything not already set to a non-empty value. */
export function loadHarnessEnv(files: string[] = [".env.local", ".env"]): void {
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(resolve(process.cwd(), file), "utf8");
    } catch {
      continue; // optional
    }
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const value = m[2].trim().replace(/^["']|["']$/g, "");
      // `!process.env[k]` — undefined AND "" both mean "not configured".
      if (!process.env[m[1]] && value) process.env[m[1]] = value;
    }
  }
}

/**
 * Read a variable that the harness cannot run without. Throws with the name
 * rather than letting the call fail later as an opaque 403.
 */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (checked .env.local then .env; an empty value counts as unset)`);
  return v;
}
