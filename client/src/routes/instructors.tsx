import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { InstructorsPage } from "@/components/pages/instructors-page";
import { InstructorListSkeleton, Skeleton } from "@/components/ui/skeleton";

type InstructorsSearch = {
  instructor?: string | undefined;
};

function InstructorsPendingSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-8 pt-4 sm:px-8 sm:pb-12 sm:pt-8 lg:px-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-36 rounded-sm" />
        <Skeleton className="h-10 w-full rounded-lg sm:h-11 sm:w-80 lg:w-96" />
      </div>
      <InstructorListSkeleton count={6} />
    </div>
  );
}

export const Route = createFileRoute("/instructors")({
  validateSearch: (search: Record<string, unknown>): InstructorsSearch => ({
    instructor: typeof search["instructor"] === "string" ? search["instructor"] : undefined,
  }),
  pendingComponent: InstructorsPendingSkeleton,
  component: InstructorsRoute,
});

function InstructorsRoute() {
  const { instructor } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <InstructorsPage
      selectedId={instructor ?? null}
      onSelectInstructor={(id) => {
        navigate({
          to: "/instructors",
          search: id ? { instructor: id } : {},
        });
      }}
    />
  );
}
