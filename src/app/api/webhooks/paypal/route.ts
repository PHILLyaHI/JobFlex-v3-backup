import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ ok: true, note: "PayPal webhook scaffolded — full handling next session." });
}
