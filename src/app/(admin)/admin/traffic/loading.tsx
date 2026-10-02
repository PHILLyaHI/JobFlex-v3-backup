import s from "@/components/v3/admin-traffic/traffic.module.css";

export default function TrafficLoading() {
  return <div className={s.root} aria-busy="true">
    <header className={s.header}><div><div className={s.eyebrow}>Platform intelligence / 01</div><h1>Traffic<span>.</span></h1></div></header>
    <section className={s.card}><div className={s.cardHead}><h2>Loading traffic</h2><span className={s.stamp}>PostHog</span></div><div className={s.empty} role="status">Fetching audience, page and conversion reports...</div></section>
  </div>;
}
