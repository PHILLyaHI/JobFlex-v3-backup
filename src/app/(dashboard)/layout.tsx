import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { CommandK } from "@/components/layout/CommandK";
import { SessionProvider } from "@/components/providers/SessionProvider";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  return (
    <SessionProvider>
      <div className="flex">
        <Sidebar />
        <main className="flex-1 min-w-0 min-h-dvh">
          <Topbar
            user={{ name: session.user.name, email: session.user.email ?? "" }}
            orgName={session.user.orgName ?? undefined}
          />
          <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto">{children}</div>
        </main>
        <CommandK />
      </div>
    </SessionProvider>
  );
}
