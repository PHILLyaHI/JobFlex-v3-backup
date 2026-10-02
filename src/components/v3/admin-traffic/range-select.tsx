// One compact range dropdown, used by the Visitor sources card and the
// Signups ledger (2026-10-01) so both pick a span the same way.
import s from "./traffic.module.css";

export function RangeSelect<T extends string | number>({ label, value, options, onChange, disabled }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void; disabled?: boolean }) {
  // `bp-sel-in` is load-bearing: the wrapper draws the chevron, and only that class removes the native one.
  return (
    <div className={`bp-sel ${s.selectWrap} ${s.rangeSelect}`}>
      <select className="bp-sel-in" aria-label={label} value={String(value)} disabled={disabled} onChange={(e) => {
        const hit = options.find(([v]) => String(v) === e.target.value);
        if (hit) onChange(hit[0]);
      }}>
        {options.map(([v, text]) => <option key={String(v)} value={String(v)}>{text}</option>)}
      </select>
    </div>
  );
}
