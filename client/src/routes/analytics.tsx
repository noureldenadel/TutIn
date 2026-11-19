import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsDashboard } from "@/components/pages/analytics-dashboard";
import { AnalyticsSkeleton, Skeleton } from "@/components/ui/skeleton";

function AnalyticsPendingSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-8 pt-4 sm:px-8 sm:pb-12 sm:pt-8 lg:px-10">
      <Skeleton className="mb-4 h-8 w-36 rounded-sm sm:mb-6" />
      <AnalyticsSkeleton />
    </div>
  );
}

export const Route = createFileRoute("/analytics")({
  pendingComponent: AnalyticsPendingSkeleton,
  component: AnalyticsDashboard,
});
