import { NextResponse } from "next/server";
import { isSquareEnabled } from "@/lib/sdk/square";

export async function POST() {
  if (!isSquareEnabled()) return NextResponse.json({ disabled: true });
  return NextResponse.json({
    disabled: true,
    error: "Square checkout scaffolded — full implementation next session.",
  });
}
