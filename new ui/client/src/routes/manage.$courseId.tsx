import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { CurriculumManager } from "@/components/player/curriculum-manager";
import { useSavedCourseQuery } from "@/lib/courses";

export const Route = createFileRoute("/manage/$courseId")({
  component: ManagePage,
});

function ManagePage() {
  const { courseId } = Route.useParams();
  const { course, isLoading } = useSavedCourseQuery(courseId);

  if (isLoading && !course) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading course…
      </div>
    );
  }

  if (!course) {
    return <div className="p-10 text-muted-foreground">Course not found.</div>;
  }

  return <CurriculumManager course={course} />;
}
