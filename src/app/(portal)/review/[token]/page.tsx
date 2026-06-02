import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ReviewSubmissionForm } from "@/components/reviews/ReviewSubmissionForm";

export default async function ReviewPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const rr = await db.reviewRequest.findUnique({
    where: { publicToken: token },
    include: {
      organization: { select: { name: true } },
      client: { select: { name: true } },
    },
  });
  if (!rr) return notFound();

  const submitted =
    rr.status === "COMPLETED" && rr.rating
      ? { rating: rr.rating, comment: rr.comment }
      : null;

  return (
    <main className="min-h-dvh flex items-center justify-center p-6 relative">
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 60% 40% at 30% 10%, rgba(200,148,80,0.07), transparent 60%)",
        }}
      />
      <div className="relative z-10 w-full">
        <ReviewSubmissionForm
          token={token}
          orgName={rr.organization.name}
          clientName={rr.client?.name ?? null}
          submitted={submitted}
        />
      </div>
    </main>
  );
}
