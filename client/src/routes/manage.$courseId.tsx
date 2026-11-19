import { createFileRoute } from "@tanstack/react-router";
import { CurriculumManager } from "@/components/player/curriculum-manager";
import { CurriculumSkeleton } from "@/components/ui/skeleton";
import { useSavedCourseQuery } from "@/lib/courses";

function ManagePendingSkeleton() {
  return <CurriculumSkeleton withHeader moduleCount={3} />;
}

export const Route = createFileRoute("/manage/$courseId")({
  pendingComponent: ManagePendingSkeleton,
  component: ManagePage,
});

function ManagePage() {
  const { courseId } = Route.useParams();
  const { course, isLoading } = useSavedCourseQuery(courseId);

  if (isLoading && !course) {
    return <CurriculumSkeleton withHeader moduleCount={3} />;
  }

  if (!course) {
    return <div className="p-10 text-muted-foreground">Course not found.</div>;
  }

  return <CurriculumManager course={course} />;
}
