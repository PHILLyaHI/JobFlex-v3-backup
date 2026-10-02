import { Suspense } from "react";
import { VerifyEmail } from "./verify-email";
export const metadata = { title: "Verify your email — JobFlex", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default function VerifyEmailPage() { return <Suspense><VerifyEmail /></Suspense>; }
