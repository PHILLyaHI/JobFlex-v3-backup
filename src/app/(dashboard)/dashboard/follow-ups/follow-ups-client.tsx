"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FollowUpRulesTable, type FollowUpRuleRow, type PendingFollowUp } from "@/components/comms/FollowUpRulesTable";
import { NewFollowUpRuleSheet } from "@/components/comms/NewFollowUpRuleSheet";
import { upsertFollowUpRule } from "@/actions/followUps";

interface Props {
  rules: (FollowUpRuleRow & { templateId: string | null })[];
  pending: PendingFollowUp[];
  templates: { id: string; name: string; subject: string; body: string }[];
}

export function FollowUpsClient({ rules, pending, templates }: Props) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const existing = editingId ? rules.find((r) => r.id === editingId) : null;

  return (
    <>
      <div className="flex items-center justify-end mb-3">
        <Button
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => {
            setEditingId(null);
            setSheetOpen(true);
          }}
        >
          New rule
        </Button>
      </div>

      <FollowUpRulesTable
        rules={rules}
        pending={pending}
        onEdit={(id) => {
          setEditingId(id);
          setSheetOpen(true);
        }}
      />

      <NewFollowUpRuleSheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setEditingId(null);
        }}
        templates={templates}
        existing={
          existing
            ? {
                id: existing.id,
                name: existing.name,
                triggerStatus: existing.triggerStatus,
                delayMinutes: existing.delayMinutes,
                enabled: existing.enabled,
                templateId: existing.templateId,
              }
            : null
        }
        onSubmit={async (values) => {
          await upsertFollowUpRule(values);
          router.refresh();
        }}
      />
    </>
  );
}
