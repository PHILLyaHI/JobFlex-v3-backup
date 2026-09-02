"use client";

// Root error boundary: catches errors thrown by the root layout itself, where
// app/error.tsx cannot help. Must render its own <html>/<body> because the
// root layout is what failed. Plain inline styles on purpose — globals.css may
// not have loaded either.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error.digest ?? "", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#f6f5f1",
          color: "#111",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <section
          role="alert"
          style={{
            width: "min(100%, 420px)",
            border: "2px solid #111",
            padding: "24px",
            boxShadow: "4px 4px 0 #111",
            background: "#fff",
          }}
        >
          <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            JobFlex
          </p>
          <h1 style={{ margin: "8px 0 12px", fontSize: 22, lineHeight: 1.2 }}>
            Something went wrong.
          </h1>
          <p style={{ margin: "0 0 20px", fontSize: 14, lineHeight: 1.5 }}>
            The app hit an unexpected error. Reload to continue.
            {error.digest ? <span style={{ opacity: 0.6 }}> Reference {error.digest}</span> : null}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 44,
              padding: "0 18px",
              border: "2px solid #111",
              background: "#1854a0",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </section>
      </body>
    </html>
  );
}
