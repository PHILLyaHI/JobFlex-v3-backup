"use client";
import * as React from "react";
import { motion } from "framer-motion";
import {
  CreditCard,
  MessageSquare,
  Mail,
  Image as ImageIcon,
  Sparkles,
  Cloud,
  Webhook,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";

const ICON: Record<string, React.ReactNode> = {
  openai: <Sparkles className="h-5 w-5" />,
  stripe: <CreditCard className="h-5 w-5" />,
  square: <Wallet className="h-5 w-5" />,
  paypal: <Wallet className="h-5 w-5" />,
  resend: <Mail className="h-5 w-5" />,
  twilio: <MessageSquare className="h-5 w-5" />,
  gmail: <Mail className="h-5 w-5" />,
  fal: <ImageIcon className="h-5 w-5" />,
  blob: <Cloud className="h-5 w-5" />,
};

const ACCENT: Record<string, string> = {
  openai: "rgba(79,70,229,0.10)",
  stripe: "rgba(79,70,229,0.10)",
  square: "rgba(5,150,105,0.10)",
  paypal: "rgba(0,128,255,0.10)",
  resend: "rgba(225,29,72,0.10)",
  twilio: "rgba(225,29,72,0.10)",
  gmail: "rgba(217,119,6,0.10)",
  fal: "rgba(124,58,237,0.10)",
  blob: "rgba(100,116,139,0.10)",
};

export interface IntegrationCard {
  key: string;
  name: string;
  enabled: boolean;
  envKeys: string[];
  purpose: string;
}

export function IntegrationsGrid({ items }: { items: IntegrationCard[] }) {
  const connected = items.filter((i) => i.enabled).length;
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Integrations</CardTitle>
            <CardSubtitle>
              {connected} of {items.length} services connected. Add the env vars below to enable
              the rest.
            </CardSubtitle>
          </div>
          <Webhook className="h-4 w-4 text-[color:var(--ink-muted)]" />
        </CardHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((it, i) => (
            <motion.div
              key={it.key}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
              className="paper-card !shadow-none p-4 relative overflow-hidden"
            >
              <div
                aria-hidden
                className="absolute -top-12 -right-12 h-28 w-28 rounded-full pointer-events-none"
                style={{ background: ACCENT[it.key] ?? "rgba(17,17,19,0.04)", filter: "blur(20px)" }}
              />
              <div className="relative">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div
                    className="h-9 w-9 rounded-[var(--r-md)] hairline grid place-items-center bg-white"
                    style={{ color: it.enabled ? "var(--ink)" : "var(--ink-muted)" }}
                  >
                    {ICON[it.key] ?? <Webhook className="h-5 w-5" />}
                  </div>
                  {it.enabled ? (
                    <Badge tone="success" dot>
                      Connected
                    </Badge>
                  ) : (
                    <Badge tone="neutral">Setup required</Badge>
                  )}
                </div>
                <div className="font-display text-[16px] tracking-[-0.01em]">{it.name}</div>
                <p className="text-[11px] text-[color:var(--ink-muted)] leading-relaxed mt-1.5 min-h-[32px]">
                  {it.purpose}
                </p>
                <div className="mt-3 pt-3 border-t border-[color:var(--ink-line)] flex items-center justify-between gap-2">
                  <span className="text-[10px] tabular text-[color:var(--ink-muted)] truncate">
                    {it.envKeys.join(" · ")}
                  </span>
                  {!it.enabled && (
                    <Button size="sm" variant="ghost">
                      Set up
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </Card>
    </div>
  );
}
