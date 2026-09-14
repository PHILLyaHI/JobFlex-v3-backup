// PUBLIC REVIEWS — /r/<org slug>. No session, no token: this is the page the
// portal badge, the thank-you screen and the contractor's "your public page"
// link all point at. It shows only what lib/reviews/publicSummary calls
// public — completed, rated, not hidden — and never a client's full name.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { parseTradeTypes } from "@/lib/tradeTypes";
import {
  formatAvg,
  orgPublicRating,
  orgPublicReviews,
  orgPublicSpread,
} from "@/lib/reviews/publicSummary";
import { PublicReviews } from "./public-reviews";

export const dynamic = "force-dynamic";

async function loadOrg(slug: string) {
  return db.organization.findFirst({
    where: { slug, deletedAt: null },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      phone: true,
      address: true,
      tradeTypesJson: true,
      otherTrade: true,
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const org = await loadOrg(slug);
  if (!org) return { title: "Reviews · JobFlex" };
  const rating = await orgPublicRating(org.id);
  const avg = formatAvg(rating.avg);
  const title = avg
    ? `${org.name} reviews · ${avg}★ (${rating.count})`
    : `${org.name} reviews`;
  return {
    title,
    description: `Verified client reviews of ${org.name}, collected after completed work through JobFlex.`,
    robots: { index: true, follow: true },
  };
}

export default async function PublicReviewsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await loadOrg(slug);
  if (!org) notFound();

  const [rating, spread, reviews] = await Promise.all([
    orgPublicRating(org.id),
    orgPublicSpread(org.id),
    orgPublicReviews(org.id, 100),
  ]);

  const trades = parseTradeTypes(org.tradeTypesJson).map(String);
  if (org.otherTrade?.trim()) trades.push(org.otherTrade.trim());
  // The address is the org's own — a city-level line is all a public page needs.
  const place = org.address?.split(",").slice(-2).join(",").trim() || null;

  return (
    <PublicReviews
      org={{
        name: org.name,
        monogram: (org.name.trim()[0] ?? "J").toUpperCase(),
        logoUrl: org.logoUrl,
        phone: org.phone,
        trades,
        place,
      }}
      avg={formatAvg(rating.avg)}
      avgNumber={rating.avg}
      count={rating.count}
      spread={spread}
      reviews={reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        photos: r.photos,
        reviewer: r.reviewer,
        when: r.when,
        title: r.title,
      }))}
    />
  );
}
