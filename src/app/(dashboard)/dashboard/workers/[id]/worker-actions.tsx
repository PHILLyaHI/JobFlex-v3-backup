"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { revokeWorker } from "@/actions/workers";

export function WorkerActions({ workerId, token }: { workerId: string; token: string }) {
  const router = useRouter();
  const [copied, setCopied] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const link =
    typeof window !== "undefined" ? `${window.location.origin}/w/${token}` : `/w/${token}`;

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        onClick={() => {
          navigator.clipboard.writeText(link);
          setCopied(true);
          toast.success("Magic link copied");
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        Copy magic link
      </Button>
      <Button
        size="sm"
        variant="ghost"
        loading={busy}
        icon={<RotateCcw className="h-3.5 w-3.5" />}
        onClick={async () => {
          setBusy(true);
          try {
            await revokeWorker(workerId);
            router.refresh();
            toast.success("Token rotated — old link revoked");
          } catch (err: any) {
            toast.error("Couldn't revoke", err?.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Revoke & rotate
      </Button>
    </div>
  );
}
