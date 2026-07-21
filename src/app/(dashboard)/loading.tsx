import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Segment-level loading boundary for every dashboard page. Its existence is
// what makes sidebar navigation feel instant: the router paints this ghost the
// moment a link is clicked (and can prefetch it), instead of leaving the old
// page frozen until the destination's auth + DB work finishes on the server.
export default function DashboardLoading() {
  return <PageSkeleton />;
}
