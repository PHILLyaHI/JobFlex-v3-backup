// DEV GALLERY — every trade hero of landing-d on one page.
//
// Dev-only, like /dev/emails: a production build 404s it. No auth on purpose
// (dev.db has no seeded account for a gated gallery to be reachable). The
// owner reviews the heroes here rather than by typing twenty `?industry=`
// URLs; a key whose LandingVariant is still null shows a TODO plate, so the
// gap between "written" and "not yet" is visible at a glance.
//
// Each hero is the REAL <Hero> with the real register link the variant page
// would carry, wrapped in the landing's `.jf-lp` scope so the stylesheet
// applies. The default hero is first, as the reference.

import { notFound } from "next/navigation";
import { Hero } from "@/components/v3/landing-d/hero";
import {
  DEFAULT_LANDING,
  LANDING_VARIANTS,
  VARIANT_KEYS,
  VARIANT_TRADE,
  signupHref,
} from "@/components/v3/landing-d/landing-variants";
import { REGISTER } from "@/components/v3/landing-d/routes";
import "@/components/v3/landing-d/landing-d.css";

export const dynamic = "force-dynamic";

export default function LandingVariantsGallery() {
  if (process.env.NODE_ENV === "production") notFound();

  const ready = VARIANT_KEYS.filter((k) => LANDING_VARIANTS[k] !== null);
  const todo = VARIANT_KEYS.filter((k) => LANDING_VARIANTS[k] === null);

  return (
    <main style={{ background: "#ebe8e1", minHeight: "100vh", padding: "32px 0 64px" }}>
      <div style={{ padding: "0 24px 24px", fontFamily: "ui-monospace, monospace", fontSize: 13, color: "#444" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "#0a0a0a", margin: 0 }}>landing-d · trade heroes</h1>
        <p style={{ margin: "6px 0 0" }}>
          {ready.length} written · {todo.length} TODO · open any as <code>/?industry=&lt;key&gt;</code>
        </p>
      </div>

      <Block title="default" meta="no parameter · the production hero">
        <div className="jf-lp">
          <Hero variant={DEFAULT_LANDING} registerHref={REGISTER} />
        </div>
      </Block>

      {ready.map((key) => {
        const v = LANDING_VARIANTS[key]!;
        return (
          <Block key={key} title={key} meta={`${VARIANT_TRADE[key]} · visual ${v.visual}${v.scenario ? ` / ${v.scenario}` : ""} · showcase → ${v.showcaseSlide}`}>
            <div className="jf-lp">
              <Hero variant={v} registerHref={signupHref(REGISTER, { industry: key })} />
            </div>
          </Block>
        );
      })}

      {todo.length > 0 && (
      <div style={{ padding: "8px 24px", fontFamily: "ui-monospace, monospace", fontSize: 13, color: "#444" }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: "#0a0a0a", margin: "24px 0 12px" }}>TODO — default hero until written</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
          {todo.map((key) => (
            <div
              key={key}
              style={{
                border: "2px dashed #b8b2a6",
                borderRadius: 3,
                padding: "14px 16px",
                background: "#f2f0eb",
              }}
            >
              <div style={{ fontWeight: 800, color: "#0a0a0a" }}>{key}</div>
              <div style={{ marginTop: 4 }}>{VARIANT_TRADE[key]}</div>
              <div style={{ marginTop: 8, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#9a6b00" }}>TODO · shows default</div>
            </div>
          ))}
        </div>
      </div>
      )}
    </main>
  );
}

function Block({ title, meta, children }: { title: string; meta: string; children: React.ReactNode }) {
  return (
    <section style={{ margin: "0 0 40px" }}>
      <div style={{ padding: "0 24px 10px", fontFamily: "ui-monospace, monospace", fontSize: 13, color: "#444" }}>
        <span style={{ fontWeight: 800, color: "#0a0a0a", fontSize: 15 }}>{title}</span>
        <span style={{ marginLeft: 12 }}>{meta}</span>
      </div>
      {children}
    </section>
  );
}
