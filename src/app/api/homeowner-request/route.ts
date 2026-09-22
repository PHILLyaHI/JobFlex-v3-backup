import { NextResponse } from "next/server";
import { submitHomeownerRequest } from "@/actions/homeowner";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const res = await submitHomeownerRequest(body);
    // A refused request (a roof or fence without its street address) is a
    // plain answer from the action; the route says 400 so API callers notice.
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid" }, { status: 400 });
  }
}
