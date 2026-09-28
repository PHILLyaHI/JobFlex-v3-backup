# The crew on site (2026-09-27)

Owner: "at the workers' installer dashboard make an option to upload videos
and pics of how the job was done, and they go to the job's proposal folder;
make Job started, Continue job (a few days of work) and Complete job buttons;
an SMS note comes to the owner and the manager; make Twilio settings at the
owner's side to set who receives SMS — look at how SmartSpace Pro did it."

## Start · Back on site · Complete

One rule, `src/lib/jobProgress.ts` (`recordJobProgress`), behind both doors:
the worker portal's token route `POST /api/worker/job/[jobId]/status`
(`IN_PROGRESS` · `CONTINUE` · `COMPLETED`) and the dashboard's server actions
`setJobProgress` / `continueJobDay` (`src/actions/jobs.ts`). It moves the
status, writes the trail row the bell and the job page read (`STARTED` with
the day in `meta`, or `COMPLETED`), promotes the ACCEPTED proposal and sends
the review request on completion, and — after the response — texts the
owner and the manager (`notifyJobProgress`).

A job's days on site are the distinct local days with a Start or a Back on
site (`src/lib/jobProgressShared.ts`, `siteDays` / `nextDay`). "Back on
site" is offered once per day on an IN_PROGRESS job; a Start pressed on a
later day counts as a day back. The buttons live on the worker portal's job
page and its Today cards (`w/[token]`), and on the dashboard job page for
the crew (desk and phone). Completing with no After photo asks for one first
and never blocks.

## Photos and videos of the work

A video is a `JobPhoto` row like a photo (no schema change): its `analysis`
column carries `{"media":"video",…}` (`src/lib/jobMediaShared.ts`,
`mediaOf`). Browser side (`src/lib/media/uploadJobMedia.ts`): a photo is
shrunk to 1800 px JPEG first; with the company's file store on
(`BLOB_READ_WRITE_TOKEN`) every file goes straight from the phone to Vercel
Blob — a token from `POST /api/jobs/media/token` (`handleUpload`, images and
videos only, under `jobs/<jobId>/`, 25 MB / 300 MB), then `POST
/api/jobs/media` records it (the URL must be the store's, under the job's
folder). Without the store a photo travels inline through the older routes
(`/api/worker/upload`, `uploadJobPhoto`), and a video is refused with a
sentence. `src/lib/jobMedia.ts` (`authorizeJobMedia`, `recordJobMedia`)
is the one record behind every path: the row, the PHOTO trail row naming
who, and `notifyJobMedia` — a MEDIA bell row and a text on the first file of
a batch (one member, one job, twenty minutes).

Where they show: the job page's Photos tab (desk and phone, a player for a
video), the proposal's Files card "From the crew" (the manual builder), the
overview and the job trail with the uploader's mark.

**Production needs a Blob store** (Vercel → Storage → Blob → connect to the
project; the token lands in the env by itself) for videos and for photos
over 4 MB; today the app has none, so photos work inline and videos say so.

## Texts, and who gets them

New preference rows (`src/lib/notificationPrefsShared.ts`): `job-started`
(Crew on site), `job-completed` (now textable), `job-photos` (Photos &
videos from the crew) — texts on by default for the office. Lines in
`src/lib/sms/format.ts` (`jobStartedLine`, `jobBackLine`,
`jobCompletedLine`, `jobMediaLine`), sent through `textOffice` (owner,
admin, manager; the actor excluded; quiet hours held).

Settings → **Texting** (desk `panes/texting-pane.tsx`, phone
`mobile-settings.tsx`), modelled on SmartSpace Pro's SMS section: *Who gets
texted* — every office member with their verified mobile and three switches
(Crew on site · Sales & leads · Money; `SMS_GROUPS`), each writing the Text
cells of that member's stored matrix (`setMemberTextGroups`, manager-only) —
*Your mobile* (the six-digit verification), and *The company* (client
texts, the own number, extra office numbers). The Notifications page keeps
In-app · Email only, as the owner asked on 2026-09-26.

QA: `scripts/qa/crew-onsite.check.ts`. Stand walk: `$SP/crew/walk.js`.
