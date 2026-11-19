import { createFileRoute } from "@tanstack/react-router";
import { HistoryPage } from "@/components/pages/history-page";
import { HistoryListSkeleton, Skeleton } from "@/components/ui/skeleton";

function HistoryPendingSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-8 pt-4 sm:px-8 sm:pb-12 sm:pt-8 lg:px-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-32 rounded-sm" />
        <Skeleton className="h-10 w-full rounded-lg sm:h-11 sm:w-80 lg:w-96" />
      </div>
      <div className="mt-5 border-b border-border/50 pb-3 sm:mt-7 sm:pb-4">
        <Skeleton className="h-9 w-64 rounded-lg" />
      </div>
      <HistoryListSkeleton />
    </div>
  );
}

export const Route = createFileRoute("/history")({
  pendingComponent: HistoryPendingSkeleton,
  component: HistoryPage,
});
