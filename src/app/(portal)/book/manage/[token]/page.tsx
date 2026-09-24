import type { Metadata } from "next";
import { bookingForManage } from "@/actions/booking";
import { ManageVisit } from "./manage-visit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your visit", description: "Move or cancel your booked visit." };

export default async function ManageBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const b = await bookingForManage(token);
  return (
    <main className="min-h-screen bg-[color:var(--paper,#f4f2ec)] px-4 py-10">
      <div className="mx-auto w-full max-w-lg rounded-[14px] border border-[color:var(--ink-line,#ddd)] bg-white overflow-hidden">
        <div className="p-6 border-b border-[color:var(--ink-line,#ddd)]">
          <div className="quiet-caps mb-2">{b.ok ? b.orgName : "Your visit"} · your visit</div>
          <h1 className="text-[24px] font-semibold leading-tight">{b.ok ? b.serviceLabel : "This link is not active"}</h1>
          {b.ok && <p className="mt-1 text-[13px] text-[color:var(--ink-muted,#666)]">for {b.name}</p>}
        </div>
        <div className="p-6">
          {b.ok ? <ManageVisit token={token} status={b.status} when={b.when} /> : <p className="text-[14px]">Please contact the company for a fresh link.</p>}
          {b.ok && (
            <p className="mt-6 text-[12px] text-[color:var(--ink-muted,#666)]">
              Need something else? <a className="underline" href={`/book/${b.slug}`}>Book another visit</a>.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
