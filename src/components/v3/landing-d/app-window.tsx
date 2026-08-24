/* Stripe-classic app chrome for mobile product screenshots */
export function AppWindow({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 shadow-[0_1px_2px_rgb(15_23_42/0.05),0_14px_36px_-14px_rgb(15_23_42/0.16)] ${className}`}
    >
      <div className="flex items-center gap-1.5 border-b border-slate-100 bg-lp-paper px-3.5 py-2.5">
        <span className="h-2 w-2 rounded-full bg-slate-300" />
        <span className="h-2 w-2 rounded-full bg-slate-300" />
        <span className="h-2 w-2 rounded-full bg-slate-300" />
        {title && (
          <span className="ml-2 flex-1 truncate rounded-md bg-white px-2.5 py-[3px] text-center text-[10.5px] font-medium text-slate-400 ring-1 ring-slate-100">
            {title}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-[1.2px] text-slate-400">
      {children}
    </div>
  );
}
