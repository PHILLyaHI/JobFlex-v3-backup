import { SettingsRail } from "@/components/settings/SettingsRail";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8 items-start">
      <SettingsRail />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
