export function WorkerPortalHeader({
  workerName,
  orgName,
}: {
  workerName: string;
  orgName?: string | null;
}) {
  return (
    <header className="border-b border-[color:var(--ink-line)] bg-[color:var(--paper)]/85 backdrop-blur sticky top-0 z-20">
      <div className="max-w-[720px] mx-auto flex items-center justify-between h-16 px-5">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-[6px] bg-[color:var(--ink)] text-[color:var(--paper)] grid place-items-center font-display text-[13px] leading-none">
            J
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-display text-[15px] tracking-[-0.01em]">{workerName}</span>
            {orgName && (
              <span className="text-[10px] text-[color:var(--ink-muted)] tracking-[0.1em] uppercase">
                {orgName}
              </span>
            )}
          </div>
        </div>
        <span className="quiet-caps">Worker portal</span>
      </div>
    </header>
  );
}
