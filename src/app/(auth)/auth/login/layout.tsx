// Document title for /auth/login.
//
// page.tsx is a client component (NextAuth's signIn + useSearchParams), so it
// cannot export `metadata` itself. This layout exists for one reason: to carry
// the source mockup's <title> verbatim. It renders no DOM of its own.
import type { Metadata } from "next";

export const metadata: Metadata = {
  // Verbatim from the source's <title>. The mockup ships no <meta
  // name="description">, so none is invented here.
  title: "JobFlex · Sign in",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
