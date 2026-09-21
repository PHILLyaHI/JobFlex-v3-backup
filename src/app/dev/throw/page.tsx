// DEV ONLY — throws on purpose, to watch the error reporting work. Like the
// other /dev pages, a production build 404s it.
//   /dev/throw             a button that throws during a client render
//                          → app/error.tsx → `$exception` (lib/traffic-client)
//   /dev/throw?server=1    throws in the server render
//                          → instrumentation.ts → `server_error`, then the same boundary

import { notFound } from "next/navigation";
import { ThrowButton } from "./throw-button";

export const dynamic = "force-dynamic";

export default async function ThrowPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production" && process.env.DEV_THROW_PAGE !== "1") notFound();
  if ((await searchParams).server) throw new Error("dev/throw: server render, reach me at qa@acme.test 5551234567");
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, fontFamily: "ui-monospace, monospace" }}>
      <ThrowButton />
    </main>
  );
}
