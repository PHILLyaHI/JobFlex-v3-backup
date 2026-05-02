"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { NewAnnouncementSheet } from "@/components/comms/NewAnnouncementSheet";
import { createAnnouncement } from "@/actions/announcements";

export function NewAnnouncementButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>
        New announcement
      </Button>
      <NewAnnouncementSheet
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={async (values) => {
          await createAnnouncement({
            title: values.title,
            body: values.body,
            priority: values.priority,
            expiresAt: values.expiresAt,
          });
          router.refresh();
        }}
      />
    </>
  );
}
