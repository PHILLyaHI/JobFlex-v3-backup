"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { WorkerInviteDrawer } from "@/components/workers/WorkerInviteDrawer";
import { createWorkerInvite } from "@/actions/workers";
import { toast } from "@/components/ui/Toast";

export function InviteButton({ variant }: { variant?: "primary" | "outline" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        icon={<Plus className="h-3.5 w-3.5" />}
        onClick={() => setOpen(true)}
        variant={variant}
      >
        Invite worker
      </Button>
      <WorkerInviteDrawer
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={async (values) => {
          try {
            const res = await createWorkerInvite(values);
            router.refresh();
            return { token: res.token };
          } catch (err: any) {
            toast.error("Invite failed", err?.message);
            return null;
          }
        }}
      />
    </>
  );
}
