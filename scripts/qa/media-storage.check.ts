// MEDIA STORAGE (stages B–C, 2026-09-30): the crew's photos, videos and
// receipts are private files. Checked here, on the local fallback (no Blob
// store in development — the same code paths as the private store, less the
// store's own calls, which wait for a real store):
//
//   · read rights — a file is read only through a short signed link a page
//     mints after it checked the reader; a tampered or expired link is
//     refused; the job page will not load for a worker who is not on it,
//     through either door;
//   · deletion — deleting a photo, deleting a receipt and replacing a
//     receipt's picture remove the file from the store, not only the row;
//   · 100 MB — the upload ticket refuses a bigger file, the local upload
//     cuts a body past its ceiling;
//   · a foreign job — a worker cannot get an upload ticket for a job they are
//     not on, nor for another company's job.
//
//   npx tsx --tsconfig tsconfig.json scripts/qa/media-storage.check.ts
import "./_server-only";
import { db, makeCrewWorld } from "./_crewWorld";

// The local fallback, whatever the shell carries: no private store, not Vercel.
delete process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;
delete process.env.VERCEL;
if (!process.env.NEXTAUTH_SECRET && !process.env.AUTH_SECRET) process.env.NEXTAUTH_SECRET = "qa-media-storage-secret";

let passes = 0;
let failures = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passes++;
  else failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};
const head = (s: string) => console.log(`\n── ${s}`);
const throws = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e instanceof Error ? e.message : String(e); } };
const MB = 1024 * 1024;

async function main() {
  const { storageMode, putPrivate, storedExists, isPrivateJobFile } = await import("../../src/lib/media/privateStore");
  const { mediaHref, verifyMediaLink, uploadTicket } = await import("../../src/lib/media/signedLink");
  const { recordJobMedia, authorizeJobMediaFor, deleteJobMediaFor } = await import("../../src/lib/jobMedia");
  const { createJobExpense, editJobExpense, deleteJobExpense } = await import("../../src/lib/jobExpenses");
  const { POST: ticketRoute } = await import("../../src/app/api/crew/upload-ticket/route");
  const { PUT: localUpload } = await import("../../src/app/api/crew/upload-local/route");
  const { GET: readRoute } = await import("../../src/app/api/media/f/route");
  const { loadJobDetail, loadJobDetailForPortal } = await import("../../src/components/v3/job-detail-blueprint/job-detail-load");
  const { MAX_FILE_BYTES } = await import("../../src/lib/jobMediaShared");

  ok("development runs on the local fallback without a store", storageMode() === "local");

  const w = await makeCrewWorld("media");
  const [A, B] = w.workers;
  const made: string[] = [];
  try {
    const ticket = (token: string, jobId: string, bytes: number, contentType = "image/jpeg", folder = "jobs") =>
      ticketRoute(new Request("http://qa/api/crew/upload-ticket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, token, folder, name: "qa.jpg", contentType, bytes }) }));

    head("1 · 100 MB and file types");
    const at = await ticket(A.token, w.jobId, MAX_FILE_BYTES);
    const atBody = (await at.json()) as { mode?: string; pathname?: string; uploadUrl?: string };
    ok("exactly 100 MB is accepted, into this job's folder", at.status === 200 && atBody.mode === "local" && !!atBody.pathname?.startsWith(`jobs/${w.jobId}/`) && !!atBody.uploadUrl, JSON.stringify(atBody).slice(0, 120));
    const over = await ticket(A.token, w.jobId, MAX_FILE_BYTES + 1);
    const overBody = (await over.json()) as { error?: string };
    ok("100 MB + 1 byte is refused with 413, in words", over.status === 413 && /larger than 100 MB/.test(overBody.error ?? ""), overBody.error);
    ok("a HEIC is not accepted", (await ticket(A.token, w.jobId, MB, "image/heic")).status === 415);
    ok("a PDF is a receipt, not a job photo", (await ticket(A.token, w.jobId, MB, "application/pdf", "jobs")).status === 415 && (await ticket(A.token, w.jobId, MB, "application/pdf", "receipts")).status === 200);
    // The local upload cuts a body past the ticket's ceiling.
    const small = uploadTicket(`jobs/${w.jobId}/qa-ceiling.jpg`, "image/jpeg", 1000);
    const cut = await localUpload(new Request(`http://qa/api/crew/upload-local?ticket=${encodeURIComponent(small)}`, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: new Uint8Array(5000) }));
    ok("the local upload refuses a body past its ceiling (413)", cut.status === 413);

    head("2 · a foreign job");
    ok("the outsider gets no ticket for a job they are not on (403)", (await ticket(w.outsider.token, w.jobId, MB)).status === 403);
    const foreign = await db.job.findFirst({ where: { organizationId: { not: w.orgId } }, select: { id: true } });
    ok("nor for another company's job (403)", foreign ? (await ticket(A.token, foreign.id, MB)).status === 403 : true, foreign ? "" : "no other company's job to try");
    ok("a receipt path is only good for its own job", isPrivateJobFile(`local:receipts/${w.jobId}/x.jpg`, "receipts", w.jobId) && !isPrivateJobFile(`local:receipts/${w.jobId}/x.jpg`, "receipts", foreign?.id ?? "other") && !isPrivateJobFile(`local:jobs/${w.jobId}/x.jpg`, "receipts", w.jobId));

    head("3 · read rights");
    const up = await localUpload(new Request(`http://qa${atBody.uploadUrl}`, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: new Uint8Array(4096).fill(7) }));
    const upBody = (await up.json()) as { url?: string; bytes?: number };
    ok("A's picture lands in the private store", up.status === 200 && !!upBody.url?.startsWith("local:jobs/") && upBody.bytes === 4096);
    const href = mediaHref(upBody.url!)!;
    ok("a page shows it through a short signed link, never the stored path", href.startsWith("/api/media/f?") && !href.includes("jobs%2F") && !href.includes("jobs/"));
    const read = await readRoute(new Request(`http://qa${href}`));
    ok("the link reads the file", read.status === 200 && (await read.arrayBuffer()).byteLength === 4096);
    const ranged = await readRoute(new Request(`http://qa${href}`, { headers: { Range: "bytes=0-99" } }));
    ok("with byte ranges (a video seeks)", ranged.status === 206 && ranged.headers.get("content-range") === "bytes 0-99/4096");
    const u = new URL(`http://qa${href}`);
    const forged = new URL(u);
    forged.searchParams.set("u", Buffer.from(`local:jobs/${w.jobId}/someone-else.jpg`).toString("base64url"));
    ok("a link edited to name another file is refused", !verifyMediaLink(forged.searchParams).ok && (await readRoute(new Request(forged.toString()))).status === 404);
    ok("a link past its 15 minutes is refused (410, in words)", verifyMediaLink(u.searchParams, Date.now() + 16 * 60_000).ok === false && (verifyMediaLink(u.searchParams, Date.now() + 16 * 60_000) as { reason: string }).reason === "expired");
    ok("the job page does not load for a worker who is not on it — dashboard door", (await loadJobDetail(w.jobId, w.orgId, "INSTALLER", w.outsider.userId)) === null);
    const aAssign = await db.jobAssignment.findFirst({ where: { jobId: w.jobId, workerId: A.workerId }, select: { id: true } });
    ok("… nor through the portal with another worker's assignment", (await loadJobDetailForPortal(w.outsider.token, aAssign!.id)) === null);
    const onJob = await loadJobDetailForPortal(A.token, aAssign!.id);
    ok("A's own portal page loads, on the token door, in the portal frame", !!onJob && onJob.door.kind === "token" && onJob.chrome === "portal");

    head("4 · deletion takes the file out of the store");
    const callerA = await authorizeJobMediaFor({ organizationId: w.orgId, userId: A.userId, role: "INSTALLER" }, w.jobId);
    const photo = await recordJobMedia({ caller: callerA!, url: upBody.url!, kind: "PROGRESS", meta: { media: "photo", contentType: "image/jpeg", bytes: 4096 }, via: "worker-portal" });
    ok("B cannot delete A's photo", (await throws(() => deleteJobMediaFor({ organizationId: w.orgId, userId: B.userId, role: "INSTALLER" } as never, photo.id))) !== null && (await storedExists(upBody.url!)));
    await deleteJobMediaFor({ organizationId: w.orgId, userId: A.userId, role: "INSTALLER" } as never, photo.id);
    ok("A deletes their photo: the row and the file are gone", (await db.jobPhoto.findUnique({ where: { id: photo.id } })) === null && !(await storedExists(upBody.url!)));

    const r1 = await putPrivate(`receipts/${w.jobId}/qa-r1.jpg`, Buffer.alloc(900, 1), "image/jpeg");
    const r2 = await putPrivate(`receipts/${w.jobId}/qa-r2.jpg`, Buffer.alloc(900, 2), "image/jpeg");
    const worker = { organizationId: w.orgId, userId: A.userId, role: "WORKER_TOKEN", workerId: A.workerId, name: A.name };
    const ex = await createJobExpense(worker, { jobId: w.jobId, category: "Materials", amount: 12, receiptUrl: r1.url, via: "worker-portal" });
    made.push(ex.id);
    await editJobExpense(worker, ex.id, { receiptUrl: r2.url });
    ok("replacing a receipt's picture removes the old file", !(await storedExists(r1.url)) && (await storedExists(r2.url)));
    await deleteJobExpense(worker, ex.id);
    ok("deleting the receipt removes its file", (await db.jobExpense.findUnique({ where: { id: ex.id } })) === null && !(await storedExists(r2.url)));
  } finally {
    await db.jobExpense.deleteMany({ where: { id: { in: made } } });
    await w.cleanup();
  }
  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
