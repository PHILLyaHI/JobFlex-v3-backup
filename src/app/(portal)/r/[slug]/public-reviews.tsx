// The public reviews sheet — a server component, no hooks, plain stylesheet
// (./public-reviews.css, root class `.jf-public-reviews`). Handheld first:
// one column that reads at 390px and centres itself at 640px on a desk.
import Link from "next/link";
import { StarsInline } from "@/components/reviews/StarsInline";
import type { SpreadRow } from "@/lib/reviews/publicSummary";
import "./public-reviews.css";

export type PublicReviewCard = {
  id: string;
  rating: number;
  comment: string | null;
  photos: string[];
  reviewer: string;
  when: string;
  title: string | null;
};

type Props = {
  org: {
    name: string;
    monogram: string;
    logoUrl: string | null;
    phone: string | null;
    trades: string[];
    place: string | null;
  };
  /** "4.8", or null with no reviews. */
  avg: string | null;
  avgNumber: number | null;
  count: number;
  spread: SpreadRow[];
  reviews: PublicReviewCard[];
};

export function PublicReviews({ org, avg, avgNumber, count, spread, reviews }: Props) {
  const meta = [org.trades.slice(0, 3).join(" · "), org.place].filter(Boolean).join(" · ");
  const reviewsWord = count === 1 ? "review" : "reviews";

  return (
    <main className="jf-public-reviews">
      <div className="pr-wrap">
        <header className="pr-head">
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="pr-logo" src={org.logoUrl} alt="" />
          ) : (
            <span className="pr-mark" aria-hidden="true">
              {org.monogram}
            </span>
          )}
          <div className="pr-org">
            <b>{org.name}</b>
            {meta ? <span>{meta}</span> : null}
          </div>
          {org.phone ? (
            <a className="pr-call" href={`tel:${org.phone.replace(/\s+/g, "")}`}>
              Call
            </a>
          ) : null}
        </header>

        <section className="pr-score" aria-label="Rating summary">
          <div className="pr-avg">
            <span className="pr-kicker">Client rating</span>
            <b>{avg ?? "—"}</b>
            <StarsInline value={avgNumber} size={22} color="var(--amber)" emptyColor="rgba(242,240,235,0.25)" />
            <span className="pr-count">
              {count} verified {reviewsWord}
            </span>
          </div>
          <div className="pr-spread" aria-label="Reviews per star">
            {spread.map((row) => (
              <div className="pr-sp-row" key={row.star}>
                <span className="pr-sp-k">{row.star}★</span>
                <span className="pr-sp-track">
                  <span className="pr-sp-fill" style={{ width: `${row.pct}%` }} />
                </span>
                <span className="pr-sp-n">{row.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="pr-list" aria-label="Reviews">
          {reviews.length === 0 ? (
            <div className="pr-empty">
              <b>No reviews yet.</b>
              <span>Reviews appear here after a client rates completed work.</span>
            </div>
          ) : (
            reviews.map((r) => (
              <article className="pr-card" key={r.id}>
                <div className="pr-card-top">
                  <StarsInline value={r.rating} size={16} title={`${r.rating} out of 5`} />
                  <span className="pr-when">{r.when}</span>
                </div>
                <div className="pr-who">
                  <b>{r.reviewer}</b>
                  <span className="pr-verified">Verified · completed job</span>
                </div>
                {r.title ? <div className="pr-title">{r.title}</div> : null}
                {r.comment ? <p className="pr-quote">{r.comment}</p> : null}
                {r.photos.length ? (
                  <div className="pr-photos" data-n={Math.min(r.photos.length, 3)}>
                    {r.photos.map((u, i) => (
                      <a key={u} href={u} target="_blank" rel="noopener noreferrer" aria-label={`Photo ${i + 1} of ${r.photos.length}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" loading="lazy" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </article>
            ))
          )}
        </section>

        <footer className="pr-foot">
          <span>Reviews are collected after completed work, one per job, through</span>{" "}
          <Link href="/">JobFlex</Link>
        </footer>
      </div>
    </main>
  );
}
