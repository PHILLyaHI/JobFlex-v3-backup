import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ ok: true, note: "Square webhook scaffolded — full handling next session." });
}
