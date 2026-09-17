/* Auth lives under the (auth) route group at /auth/*, so a bare /login or
   /register is a 404. Every CTA on this page points here rather than writing
   the path out, so the pair can move in one edit. */
export const LOGIN = "/auth/login";
export const REGISTER = "/auth/register";
