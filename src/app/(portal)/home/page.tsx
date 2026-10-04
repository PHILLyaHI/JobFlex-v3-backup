// /home — "lost the link?" (2026-10-03). The home dashboard has no password:
// the homeowner types their email and the link goes there, never on screen
// (lib/home/portal says why). The answer is the same whether or not a home
// exists for the address.
import type { Metadata } from "next";
import Link from "next/link";
import { FindHome } from "./find-home";
import s from "./[key]/home.module.css";

export const metadata: Metadata = {
  title: "Your home dashboard — JobFlex",
  description: "Get the link to your JobFlex home dashboard by email.",
  robots: { index: false, follow: false },
};

export default function FindHomePage() {
  return (
    <main className={s.page}>
      <div className={s.wrap}>
        <header className={s.top}>
          <Link href="/" className={s.brand}>
            <span className={s.mark} aria-hidden="true">J</span>
            <span className={s.brandText}>JobFlex <em>Home</em></span>
          </Link>
        </header>
        <section className={s.hero} aria-labelledby="find-title">
          <div className={s.kicker}>Your home dashboard</div>
          <h1 id="find-title" className={s.title}>Lost the link?</h1>
          <p className={s.lede}>
            Your home dashboard has no password — the link is the key. Type the email you used for your project and we&apos;ll send it there.
          </p>
          <div style={{ marginTop: 18 }}>
            <FindHome />
          </div>
        </section>
        <footer className={s.foot}>
          <p>
            New here? <Link href="/homeowner">Submit your first project</Link> — your home dashboard comes with it.
          </p>
        </footer>
      </div>
    </main>
  );
}
