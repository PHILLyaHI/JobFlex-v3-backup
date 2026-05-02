"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { JobTabsNav } from "@/components/jobs/JobTabsNav";
import { AssignmentList } from "@/components/jobs/AssignmentList";
import { PhotoUploadDrawer, type PhotoDraft } from "@/components/jobs/PhotoUploadDrawer";
import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";
import { ChangeOrderList } from "@/components/changeOrders/ChangeOrderList";
import { PhotoAnalysisPanel, type PhotoAnalysis } from "@/components/vision/PhotoAnalysisPanel";
import { ReceiptOcrDialog } from "@/components/vision/ReceiptOcrDialog";
import { ScanLine } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { money, longDate, shortDate, relative } from "@/lib/format";
import { isBlobEnabled } from "@/lib/sdk/blob";
import {
  updateJob,
  createJobEvent,
  deleteJobEvent,
} from "@/actions/jobs";
import {
  assignWorker,
  unassignWorker,
} from "@/actions/workers";
import {
  addJobExpense,
  deleteJobExpense,
  postJobMessage,
  uploadJobPhoto,
  deleteJobPhoto,
} from "@/actions/jobMedia";
import { Plus, Send, Trash2, Upload, Phone, Mail } from "lucide-react";

interface JobCore {
  id: string;
  title: string;
  status: string;
  notes: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  proposalId: string | null;
}

interface JobEventDTO {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
}

interface AssignmentDTO {
  id: string;
  workerId: string;
  workerName: string;
  workerEmail: string | null;
  status: string;
  assignedAt: Date;
}

interface ExpenseDTO {
  id: string;
  category: string;
  amount: number;
  note: string | null;
  createdAt: Date;
}

interface MessageDTO {
  id: string;
  authorId: string | null;
  body: string;
  createdAt: Date;
}

interface WorkerOption {
  id: string;
  displayName: string;
  email: string | null;
  specialties: string[];
}

interface JobDetailProps {
  job: JobCore;
  events: JobEventDTO[];
  assignments: AssignmentDTO[];
  photos: PhotoDraft[];
  expenses: ExpenseDTO[];
  expenseTotal: number;
  messages: MessageDTO[];
  availableWorkers: WorkerOption[];
  changeOrders: import("@/components/changeOrders/ChangeOrderList").ChangeOrderRow[];
  aiEnabled: boolean;
}

export function JobDetail(props: JobDetailProps) {
  const {
    job,
    events,
    assignments,
    photos,
    expenses,
    expenseTotal,
    messages,
    availableWorkers,
    changeOrders,
    aiEnabled,
  } = props;
  const [receiptOpen, setReceiptOpen] = React.useState(false);
  const router = useRouter();
  const [tab, setTab] = React.useState("overview");
  const [photoDrawer, setPhotoDrawer] = React.useState(false);
  const [photoBusy, setPhotoBusy] = React.useState(false);

  const assignedIds = new Set(assignments.map((a) => a.workerId));
  const selectable = availableWorkers.filter((w) => !assignedIds.has(w.id));

  return (
    <>
      <JobTabsNav
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "schedule", label: "Schedule", count: events.length },
          { key: "crew", label: "Crew", count: assignments.length },
          { key: "changes", label: "Changes", count: changeOrders.length },
          { key: "photos", label: "Photos", count: photos.length },
          { key: "expenses", label: "Expenses", count: expenses.length },
          { key: "messages", label: "Messages", count: messages.length },
        ]}
      />

      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Overview</CardTitle>
                <CardSubtitle>Status, client, and notes in one place.</CardSubtitle>
              </div>
              <StatusPicker
                current={job.status}
                onChange={async (status) => {
                  await updateJob(job.id, { status: status as any });
                  router.refresh();
                  toast.success("Status updated");
                }}
              />
            </CardHeader>
            <div className="grid grid-cols-2 gap-5 text-[13px]">
              <Field label="Client" value={job.clientName ?? "—"} />
              <Field
                label="When"
                value={
                  job.startsAt
                    ? `${longDate(job.startsAt)}${job.endsAt ? ` → ${shortDate(job.endsAt)}` : ""}`
                    : "Unscheduled"
                }
              />
              <Field label="Assigned" value={`${assignments.length} on crew`} />
              <Field
                label="Expenses"
                value={`${money(expenseTotal)} across ${expenses.length}`}
              />
            </div>
            {job.notes && (
              <div className="mt-5 pt-4 border-t border-[color:var(--ink-line)]">
                <div className="quiet-caps mb-2">Notes</div>
                <p className="text-[13px] leading-relaxed text-[color:var(--ink-soft)] whitespace-pre-wrap">
                  {job.notes}
                </p>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Client contact</CardTitle>
                <CardSubtitle>Quick-reach details.</CardSubtitle>
              </div>
            </CardHeader>
            <div className="space-y-3 text-[13px]">
              {job.clientEmail && (
                <a
                  href={`mailto:${job.clientEmail}`}
                  className="flex items-center gap-2 text-[color:var(--ink-soft)] hover:text-[color:var(--accent)]"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {job.clientEmail}
                </a>
              )}
              {job.clientPhone && (
                <a
                  href={`tel:${job.clientPhone}`}
                  className="flex items-center gap-2 text-[color:var(--ink-soft)] hover:text-[color:var(--accent)]"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {job.clientPhone}
                </a>
              )}
              {!job.clientEmail && !job.clientPhone && (
                <p className="text-[color:var(--ink-muted)]">No contact details on file.</p>
              )}
            </div>
          </Card>
        </div>
      )}

      {tab === "schedule" && (
        <ScheduleTab
          jobId={job.id}
          events={events}
          onChange={() => router.refresh()}
        />
      )}

      {tab === "crew" && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Crew</CardTitle>
              <CardSubtitle>Assign workers — they confirm via their portal link.</CardSubtitle>
            </div>
            {selectable.length > 0 && (
              <div className="flex items-center gap-2">
                <Select
                  onChange={async (e) => {
                    const workerId = e.target.value;
                    if (!workerId) return;
                    await assignWorker(job.id, workerId);
                    e.target.value = "";
                    router.refresh();
                    toast.success("Assigned");
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>
                    + Add worker…
                  </option>
                  {selectable.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.displayName}
                      {w.specialties.length > 0 ? ` — ${w.specialties.slice(0, 2).join(", ")}` : ""}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </CardHeader>
          <AssignmentList
            rows={assignments.map((a) => ({
              id: a.id,
              workerId: a.workerId,
              workerName: a.workerName,
              workerEmail: a.workerEmail,
              status: a.status,
              assignedAt: a.assignedAt,
            }))}
            onRemove={async (id) => {
              await unassignWorker(id);
              router.refresh();
              toast.success("Removed");
            }}
          />
        </Card>
      )}

      {tab === "photos" && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Photos</CardTitle>
              <CardSubtitle>Before · Progress · After — documented on site.</CardSubtitle>
            </div>
            <Button
              size="sm"
              onClick={() => setPhotoDrawer(true)}
              icon={<Upload className="h-3.5 w-3.5" />}
            >
              Upload
            </Button>
          </CardHeader>
          {photos.length === 0 ? (
            <p className="text-[12px] text-[color:var(--ink-muted)]">
              No photos yet. Upload before/after shots to build a record.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {photos.map((p) => (
                <div key={p.id}>
                  <div className="relative aspect-[4/3] rounded-[var(--r-md)] overflow-hidden hairline bg-black/[0.03]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.kind} className="w-full h-full object-cover" />
                    <div className="absolute top-2 left-2 text-[9px] uppercase tracking-[0.1em] bg-black/60 text-white rounded px-1.5 py-0.5">
                      {p.kind.toLowerCase()}
                    </div>
                  </div>
                  <PhotoAnalysisPanel
                    photoId={p.id}
                    aiEnabled={aiEnabled}
                    analysis={parsePhotoAnalysis(p.analysis)}
                  />
                </div>
              ))}
            </div>
          )}
          <PhotoUploadDrawer
            open={photoDrawer}
            onClose={() => setPhotoDrawer(false)}
            existing={photos}
            busy={photoBusy}
            blobDisabled={!isBlobEnabled()}
            onUpload={async (file, kind) => {
              setPhotoBusy(true);
              try {
                const reader = new FileReader();
                const dataUrl = await new Promise<string>((resolve, reject) => {
                  reader.onload = () => resolve(String(reader.result));
                  reader.onerror = reject;
                  reader.readAsDataURL(file);
                });
                await uploadJobPhoto(job.id, dataUrl, file.name, kind);
                router.refresh();
                toast.success("Uploaded");
              } catch (err: any) {
                toast.error("Upload failed", err?.message);
              } finally {
                setPhotoBusy(false);
              }
            }}
            onDelete={async (id) => {
              await deleteJobPhoto(id);
              router.refresh();
            }}
          />
        </Card>
      )}

      {tab === "expenses" && (
        <ExpensesTab
          jobId={job.id}
          expenses={expenses}
          total={expenseTotal}
          onChange={() => router.refresh()}
          onScan={() => setReceiptOpen(true)}
        />
      )}
      <ReceiptOcrDialog
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        jobId={job.id}
        aiEnabled={aiEnabled}
      />

      {tab === "changes" && (
        <ChangeOrderList jobId={job.id} orders={changeOrders} />
      )}

      {tab === "messages" && (
        <MessagesTab
          jobId={job.id}
          messages={messages}
          onChange={() => router.refresh()}
        />
      )}
    </>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="quiet-caps mb-1">{label}</div>
      <div className="text-[color:var(--ink)]">{value}</div>
    </div>
  );
}

function StatusPicker({
  current,
  onChange,
}: {
  current: string;
  onChange: (s: string) => void | Promise<void>;
}) {
  return (
    <Select defaultValue={current} onChange={(e) => onChange(e.target.value)}>
      <option value="SCHEDULED">Scheduled</option>
      <option value="IN_PROGRESS">In progress</option>
      <option value="COMPLETED">Completed</option>
      <option value="CANCELED">Canceled</option>
    </Select>
  );
}

function ScheduleTab({
  jobId,
  events,
  onChange,
}: {
  jobId: string;
  events: JobEventDTO[];
  onChange: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const inOneDay = new Date();
  inOneDay.setDate(inOneDay.getDate() + 1);
  inOneDay.setHours(9, 0, 0, 0);
  const end = new Date(inOneDay);
  end.setHours(12, 0, 0, 0);
  const [startsAt, setStartsAt] = React.useState(toLocalInput(inOneDay));
  const [endsAt, setEndsAt] = React.useState(toLocalInput(end));
  const [busy, setBusy] = React.useState(false);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div>
            <CardTitle>Events</CardTitle>
            <CardSubtitle>Install dates, walkthroughs, delivery windows.</CardSubtitle>
          </div>
        </CardHeader>
        {events.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-muted)]">
            No events yet. Add the first on the right.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-3">
                <div className="h-10 w-10 rounded-[var(--r-sm)] bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)] grid place-items-center font-display text-[14px] tabular">
                  {shortDate(e.startsAt).split(" ")[1]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
                    {e.title}
                  </div>
                  <div className="text-[11px] text-[color:var(--ink-muted)]">
                    {longDate(e.startsAt)} ·{" "}
                    {new Intl.DateTimeFormat("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(new Date(e.startsAt))}
                    –
                    {new Intl.DateTimeFormat("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(new Date(e.endsAt))}
                  </div>
                  {e.notes && (
                    <div className="text-[11px] text-[color:var(--ink-faint)] mt-0.5 line-clamp-1">
                      {e.notes}
                    </div>
                  )}
                </div>
                <button
                  onClick={async () => {
                    await deleteJobEvent(e.id);
                    onChange();
                    toast.success("Event removed");
                  }}
                  className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-rose-700"
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Add event</CardTitle>
            <CardSubtitle>Lands on the calendar immediately.</CardSubtitle>
          </div>
        </CardHeader>
        <div className="space-y-3">
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Material delivery"
          />
          <Input
            label="Starts"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
          <Input
            label="Ends"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
          <Textarea
            label="Notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Button
            className="w-full"
            loading={busy}
            onClick={async () => {
              if (!title.trim()) return;
              setBusy(true);
              try {
                await createJobEvent({
                  title: title.trim(),
                  jobId,
                  startsAt: new Date(startsAt),
                  endsAt: new Date(endsAt),
                  notes: notes || null,
                });
                setTitle("");
                setNotes("");
                onChange();
                toast.success("Event added");
              } catch (err: any) {
                toast.error("Couldn't add", err?.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Add event
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ExpensesTab({
  jobId,
  expenses,
  total,
  onChange,
  onScan,
}: {
  jobId: string;
  expenses: ExpenseDTO[];
  total: number;
  onChange: () => void;
  onScan?: () => void;
}) {
  const [category, setCategory] = React.useState("Materials");
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div>
            <CardTitle>Expenses</CardTitle>
            <CardSubtitle>
              {money(total)} across {expenses.length}
            </CardSubtitle>
          </div>
          {onScan && (
            <Button
              size="sm"
              variant="outline"
              icon={<ScanLine className="h-3.5 w-3.5" />}
              onClick={onScan}
            >
              Scan receipt
            </Button>
          )}
        </CardHeader>
        {expenses.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-muted)]">
            No expenses recorded. Add one on the right.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-[color:var(--ink)]">{e.category}</div>
                  {e.note && (
                    <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
                      {e.note}
                    </div>
                  )}
                  <div className="text-[10px] text-[color:var(--ink-faint)] mt-0.5">
                    {relative(e.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-display tabular text-[15px]">{money(e.amount)}</span>
                  <button
                    onClick={async () => {
                      await deleteJobExpense(e.id);
                      onChange();
                    }}
                    className="h-6 w-6 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Log expense</CardTitle>
            <CardSubtitle>Materials, fuel, subcontractor, tools…</CardSubtitle>
          </div>
        </CardHeader>
        <div className="space-y-3">
          <Select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {["Materials", "Labor", "Fuel", "Tools", "Subcontractor", "Other"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Input
            label="Amount"
            type="number"
            step="0.01"
            prefix={<span className="text-[11px]">$</span>}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Input
            label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Home Depot, invoice #1234"
          />
          <Button
            className="w-full"
            loading={busy}
            onClick={async () => {
              const n = Number(amount);
              if (!(n > 0)) {
                toast.error("Enter an amount");
                return;
              }
              setBusy(true);
              try {
                await addJobExpense(jobId, {
                  category,
                  amount: n,
                  note: note || null,
                });
                setAmount("");
                setNote("");
                onChange();
                toast.success("Expense added");
              } catch (err: any) {
                toast.error("Couldn't add", err?.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save expense
          </Button>
        </div>
      </Card>
    </div>
  );
}

function MessagesTab({
  jobId,
  messages,
  onChange,
}: {
  jobId: string;
  messages: MessageDTO[];
  onChange: () => void;
}) {
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Messages</CardTitle>
          <CardSubtitle>Internal thread for this job.</CardSubtitle>
        </div>
      </CardHeader>
      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="text-[12px] text-[color:var(--ink-muted)]">
            No messages yet. Start the thread below.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="flex gap-3">
            <Avatar name={m.authorId ? "Team" : "Client"} size={28} />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-[color:var(--ink-muted)] tabular">
                {relative(m.createdAt)}
              </div>
              <div className="text-[13px] text-[color:var(--ink-soft)] whitespace-pre-wrap leading-relaxed mt-0.5">
                {m.body}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 pt-5 border-t border-[color:var(--ink-line)]">
        <Textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type a message — visible to everyone on this job."
        />
        <div className="flex justify-end mt-3">
          <Button
            loading={busy}
            icon={<Send className="h-3.5 w-3.5" />}
            onClick={async () => {
              if (!body.trim()) return;
              setBusy(true);
              try {
                await postJobMessage(jobId, body.trim());
                setBody("");
                onChange();
              } catch (err: any) {
                toast.error("Couldn't post", err?.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Post
          </Button>
        </div>
      </div>
    </Card>
  );
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parsePhotoAnalysis(raw: string | null | undefined): PhotoAnalysis | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return typeof v === "object" && v ? (v as PhotoAnalysis) : null;
  } catch {
    return null;
  }
}
