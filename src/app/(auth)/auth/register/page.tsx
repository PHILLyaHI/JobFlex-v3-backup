import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { UserPlus } from "lucide-react";

export default function RegisterPage() {
  return (
    <main className="mx-auto max-w-xl p-10">
      <PageHeader
        eyebrow="New account"
        title="Create your JobFlex workspace"
        description="We'll set you up with a clean slate — organization, first user, and a seeded demo proposal to learn from."
      />
      <EmptyState
        icon={<UserPlus className="h-5 w-5" />}
        title="Registration is opening next session"
        description="Demo access is available — sign in with the seeded owner@acme.test / password123 credentials."
        action={
          <Link href="/auth/login">
            <Button>Go to sign in</Button>
          </Link>
        }
      />
    </main>
  );
}
