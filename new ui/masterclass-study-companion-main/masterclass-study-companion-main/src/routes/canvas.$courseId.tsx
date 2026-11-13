import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { CourseCanvasPage } from "@/components/canvas/course-canvas-page";
import { findSavedCourseById, type Course } from "@/lib/courses";

export const Route = createFileRoute("/canvas/$courseId")({
  loader: ({ params }) => {
    const course = findSavedCourseById(params.courseId) ?? null;
    return { courseId: params.courseId, ssrCourse: course };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.ssrCourse?.title ?? "Notes Canvas"} — Canvas — TutIn` },
      { name: "description", content: "Visual whiteboard for course video notes, sketches, and images." },
      { property: "og:title", content: `${loaderData?.ssrCourse?.title ?? "Notes Canvas"} — Canvas` },
      { property: "og:type", content: "website" },
    ],
  }),
  component: CourseCanvasRoute,
});

function CourseCanvasRoute() {
  const { courseId, ssrCourse } = Route.useLoaderData();
  const [clientCourse, setClientCourse] = useState<Course | null>(ssrCourse);
  const [hydrated, setHydrated] = useState(Boolean(ssrCourse));

  useEffect(() => {
    setClientCourse(findSavedCourseById(courseId) ?? null);
    setHydrated(true);

    const onUpdate = () => setClientCourse(findSavedCourseById(courseId) ?? null);
    window.addEventListener("tutin:course_updated", onUpdate);
    return () => window.removeEventListener("tutin:course_updated", onUpdate);
  }, [courseId]);

  if (!hydrated) {
    return <AppShell><div className="p-10 text-muted-foreground" /></AppShell>;
  }

  if (!clientCourse) {
    return <AppShell><div className="p-10 text-muted-foreground">Course not found.</div></AppShell>;
  }

  return (
    <AppShell>
      <CourseCanvasPage course={clientCourse} />
    </AppShell>
  );
}

