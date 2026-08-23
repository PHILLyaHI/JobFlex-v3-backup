// The overview's honest answer when the signed-in account has no organization.
//
// WHY THIS EXISTS. /dashboard used to answer a NoOrgError by redirecting to
// "/dashboard?error=forbidden" — itself. The redirected request threw the same
// error, redirected again, and the page never resolved: the layout's chrome
// (sidebar and topbar) painted, the content area stayed empty, and the server
// re-rendered in a loop. Every other blueprint page redirects here on the same
// error, so this one page had to become a destination rather than a bounce.
//
// It deliberately offers no "create a company" button: nothing in the app lets
// an already-signed-in user mint an organization for themselves (registration
// creates the account and the org together, atomically), so a button here could
// only fail. The two exits offered are the two that actually work.

import Link from "next/link";
import type { Route } from "next";

export function NoOrgNotice({ email }: { email?: string | null }) {
  return (
    <div className="page-head">
      <div className="card" role="status">
        <div className="card-head">
          <div className="card-titles">
            <h1 className="card-title">This account has no workspace</h1>
          </div>
        </div>
        <p>
          {email ? <strong>{email}</strong> : "This login"} is signed in, but it is not a
          member of any company on JobFlex — so there is nothing for the overview to show.
        </p>
        <p>
          That usually means one of two things: you signed in with a different address than
          the one you registered, or an invite to your company was never accepted. Ask
          whoever runs your JobFlex account to re-send the invite, or sign in with the
          address you registered.
        </p>
        <p>
          <Link className="btn btn-primary" href={"/auth/login" as Route}>
            Sign in with another account
          </Link>
        </p>
      </div>
    </div>
  );
}
