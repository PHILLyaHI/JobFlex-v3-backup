import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminLayout } from "@/components/admin/AdminRail";

export default async function AdminShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login?next=/admin");

  // Gate: at least one membership at OWNER or ADMIN level on any org.
  const elevated = await db.membership.findFirst({
    where: { userId: session.user.id, role: { in: ["OWNER", "ADMIN"] } },
    select: { id: true },
  });
  if (!elevated) redirect("/dashboard" as any);

  return (
    <div>
      <header className="border-b border-[color:var(--ink-line)] bg-[color:var(--paper)]/85 backdrop-blur sticky top-0 z-20">
        <div className="max-w-[1400px] mx-auto h-14 px-6 lg:px-10 flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-[6px] bg-[color:var(--ink)] text-[color:var(--paper)] grid place-items-center font-display text-[13px] leading-none">
              J
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[15px] tracking-[-0.015em]">JobFlex</span>
              <span className="quiet-caps">Admin</span>
            </div>
          </Link>
          <Link
            href={"/dashboard" as any}
            className="text-[12px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]"
          >
            ← Back to dashboard
          </Link>
        </div>
      </header>
      <AdminLayout>{children}</AdminLayout>
    </div>
  );
}
