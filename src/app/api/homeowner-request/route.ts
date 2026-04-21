import { NextResponse } from "next/server";
import { submitHomeownerRequest } from "@/actions/homeowner";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const res = await submitHomeownerRequest(body);
    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Invalid" }, { status: 400 });
  }
}
