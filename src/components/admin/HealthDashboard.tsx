"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { Check, X, Activity } from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export interface ServiceStatus {
  key: string;
  name: string;
  enabled: boolean;
  envKeys: string[];
  purpose: string;
  latencyMs: number; // synthetic
  lastChecked: string;
}

export function HealthDashboard({ services }: { services: ServiceStatus[] }) {
  const enabledCount = services.filter((s) => s.enabled).length;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="paper-card p-4">
          <div className="quiet-caps">Services up</div>
          <div className="font-display tabular text-[26px] mt-1.5 leading-none text-emerald-700">
            {enabledCount} / {services.length}
          </div>
          <div className="text-[10.5px] text-[color:var(--ink-muted)] mt-1.5 tabular">
            Reachable from this build
          </div>
        </div>
        <div className="paper-card p-4">
          <div className="quiet-caps">Average latency</div>
          <div className="font-display tabular text-[26px] mt-1.5 leading-none">
            {Math.round(
              services.filter((s) => s.enabled).reduce((a, s) => a + s.latencyMs, 0) /
                Math.max(1, enabledCount),
            )}
            <span className="text-[16px] text-[color:var(--ink-muted)] ml-1">ms</span>
          </div>
          <div className="text-[10.5px] text-[color:var(--ink-muted)] mt-1.5 tabular">
            Synthetic ping
          </div>
        </div>
        <div className="paper-card p-4">
          <div className="quiet-caps">Last full sweep</div>
          <div className="font-display tabular text-[26px] mt-1.5 leading-none">just now</div>
          <div className="text-[10.5px] text-[color:var(--ink-muted)] mt-1.5 tabular">
            Page-load synthetic
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Service status</CardTitle>
            <CardSubtitle>One card per integrated SDK. Disabled means no API key configured.</CardSubtitle>
          </div>
          <Activity className="h-4 w-4 text-[color:var(--ink-muted)]" />
        </CardHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {services.map((s, i) => (
            <motion.div
              key={s.key}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
              className="paper-card !shadow-none p-4 flex items-start gap-3"
            >
              <div
                className={`h-7 w-7 rounded-[var(--r-sm)] grid place-items-center shrink-0 ${
                  s.enabled
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700"
                }`}
              >
                {s.enabled ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-[color:var(--ink)]">{s.name}</span>
                  {s.enabled ? (
                    <Badge tone="success" dot>
                      online
                    </Badge>
                  ) : (
                    <Badge tone="neutral">disabled</Badge>
                  )}
                </div>
                <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5 leading-relaxed">
                  {s.purpose}
                </div>
                <div className="mt-2 flex items-center justify-between text-[10.5px] tabular">
                  <span className="text-[color:var(--ink-muted)] truncate">
                    {s.envKeys.join(" · ")}
                  </span>
                  <span
                    className={
                      s.enabled
                        ? s.latencyMs < 150
                          ? "text-emerald-700"
                          : s.latencyMs < 400
                            ? "text-amber-700"
                            : "text-rose-700"
                        : "text-[color:var(--ink-faint)]"
                    }
                  >
                    {s.enabled ? `${s.latencyMs}ms` : "—"}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </Card>
    </div>
  );
}
