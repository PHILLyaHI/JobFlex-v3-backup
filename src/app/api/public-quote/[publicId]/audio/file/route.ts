// Retired feature: stale clients must not generate or retrieve proposal audio.
export function GET() {
  return Response.json({ error: "Proposal audio is no longer available." }, {
    status: 410,
    headers: { "Cache-Control": "no-store" },
  });
}
