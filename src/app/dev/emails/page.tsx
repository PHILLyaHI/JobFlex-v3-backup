import { notFound } from "next/navigation";
import { FIXTURES } from "@/lib/email/fixtures";
import { renderEmail } from "@/lib/email/renderEmail";

// Dev-only. No auth guard on purpose: dev.db has no seeded account, so an
// auth-gated gallery would be unreachable locally.
export const dynamic = "force-dynamic";

export default function EmailGalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const rendered = FIXTURES.map((f) => ({ ...f, html: renderEmail(f.doc).html }));

  return (
    <main style={{ background: "#ebe8e1", minHeight: "100vh", padding: "32px 24px" }}>
      <h1
        style={{
          fontFamily: "Inter,sans-serif",
          fontSize: 30,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "-.03em",
          margin: "0 0 6px",
        }}
      >
        Email gallery
      </h1>
      <p style={{ fontFamily: "monospace", fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: "#555", margin: "0 0 32px" }}>
        {rendered.length} fixtures · 560px and 375px
      </p>

      {rendered.map((f) => (
        <section key={f.id} style={{ marginBottom: 48 }}>
          <h2 style={{ fontFamily: "Inter,sans-serif", fontSize: 17, fontWeight: 800, margin: "0 0 4px" }}>{f.label}</h2>
          {f.note ? (
            <p style={{ fontFamily: "Inter,sans-serif", fontSize: 13, color: "#555", margin: "0 0 12px", maxWidth: "80ch" }}>{f.note}</p>
          ) : null}
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
            <iframe title={`${f.id}-wide`} srcDoc={f.html} style={{ width: 620, height: 900, border: "2px solid #0a0a0a", borderRadius: 2, background: "#fff" }} />
            <iframe title={`${f.id}-narrow`} srcDoc={f.html} style={{ width: 375, height: 900, border: "2px solid #0a0a0a", borderRadius: 2, background: "#fff" }} />
          </div>
        </section>
      ))}
    </main>
  );
}
