import { PageSkeleton } from "@/components/ui/PageSkeleton";

// Same instant-navigation boundary as the dashboard group — see
// src/app/(dashboard)/loading.tsx for why this exists.
export default function AdminLoading() {
  return <PageSkeleton />;
}
