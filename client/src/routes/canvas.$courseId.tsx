import { createFileRoute } from "@tanstack/react-router";
import { CourseCanvasPage } from "@/components/canvas/course-canvas-page";
import { CanvasSkeleton } from "@/components/ui/skeleton";
import { useSavedCourseQuery } from "@/lib/courses";

export const Route = createFileRoute("/canvas/$courseId")({
  pendingComponent: CanvasSkeleton,
  component: CourseCanvasRoute,
});

function CourseCanvasRoute() {
  const { courseId } = Route.useParams();
  const { course, isLoading } = useSavedCourseQuery(courseId);

  if (isLoading && !course) {
    return <CanvasSkeleton />;
  }

  if (!course) {
    return <div className="p-10 text-muted-foreground">Course not found.</div>;
  }

  return <CourseCanvasPage course={course} />;
}
