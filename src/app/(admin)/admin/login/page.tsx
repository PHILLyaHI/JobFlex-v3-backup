// PLATFORM ADMIN — SIGN IN. Route: /admin/login.
//
// Standalone chrome: the (admin) layout renders this path bare (no shell, no
// guard — see its header), and the wrapper <div> in ./admin-login-form.tsx
// wears the literal global class `jf-admin-login` that every rule in
// ./admin-login.module.css hangs off.
//
// A server component so it can carry the document title and bounce an admin
// who is already signed in straight to the console; the form itself is the
// client piece beside it.

import type { Metadata } from "next";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { readAdminCookie } from "@/lib/adminAuth";
import { AdminLoginForm } from "./admin-login-form";

export const metadata: Metadata = {
  title: "JobFlex · Platform admin",
};

export default async function AdminLoginPage() {
  if (await readAdminCookie()) redirect("/admin" as Route);
  return <AdminLoginForm />;
}
