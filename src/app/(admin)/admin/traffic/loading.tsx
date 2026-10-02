import s from "@/components/v3/admin-traffic/traffic.module.css";

export default function TrafficLoading() {
  return <div className={s.root} aria-busy="true">
    <header className={s.header}><h1>Traffic<span>.</span></h1><div className={s.headerMeta}><span className={s.updated}>Querying PostHog…</span></div></header>
    <div className={s.card}><div className={s.empty} role="status">Loading live visitors, signups and reports…</div></div>
  </div>;
}
