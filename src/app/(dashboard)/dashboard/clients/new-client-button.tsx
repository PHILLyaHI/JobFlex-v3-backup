"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ClientFormSheet } from "@/components/v3/proposal-builder-a/ClientFormSheet";

// Client-side host for the "New client" header action: the clients list is a
// server component, so the button + create sheet live here. Reuses the existing
// ClientFormSheet (createClient action); router.refresh() re-runs the server
// query so the new client shows up in the table immediately.
export function NewClientButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>
        New client
      </Button>
      <ClientFormSheet
        open={open}
        onClose={() => setOpen(false)}
        mode="create"
        onSaved={() => router.refresh()}
      />
    </>
  );
}
