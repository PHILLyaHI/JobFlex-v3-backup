"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { closeTradePost } from "@/actions/tradePosts";

export function ClosePostButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  async function go() {
    setBusy(true);
    try {
      await closeTradePost(id);
      toast.success("Closed");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't close", err?.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button
      size="sm"
      variant="outline"
      icon={<Lock className="h-3 w-3" />}
      loading={busy}
      onClick={go}
    >
      Close post
    </Button>
  );
}
