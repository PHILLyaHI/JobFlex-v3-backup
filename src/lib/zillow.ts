interface ZillowAddress {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

export function zillowSearchUrl(c: ZillowAddress): string | null {
  const parts = [c.address, c.city, c.state, c.zip].map((p) => (p ?? "").trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const slug = parts.join(", ").replace(/\s+/g, "-");
  return `https://www.zillow.com/homes/${encodeURIComponent(slug)}_rb/`;
}

export function describeAddress(c: ZillowAddress): string {
  return [c.address, c.city, c.state, c.zip].filter(Boolean).join(", ");
}
