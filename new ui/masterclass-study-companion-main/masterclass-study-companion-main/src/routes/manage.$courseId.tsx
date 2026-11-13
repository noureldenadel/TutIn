import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { CurriculumManager } from "@/components/curriculum-manager";
import { findSavedCourseById, type Course } from "@/lib/courses";

export const Route = createFileRoute("/manage/$courseId")({
  loader: ({ params }) => {
    const course = findSavedCourseById(params.courseId) ?? null;
    return { courseId: params.courseId, ssrCourse: course };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `Manage curriculum — ${loaderData?.ssrCourse?.title ?? "Course"} — TutIn` },
      { name: "description", content: "Reorder modules and lessons, check transcripts, subtitles, and AI dubs." },
      { property: "og:title", content: `Manage curriculum — ${loaderData?.ssrCourse?.title ?? "Course"}` },
      { property: "og:description", content: "A calm curriculum editor for your offline courses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ManagePage,
});

function ManagePage() {
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

  return <AppShell><CurriculumManager course={clientCourse} /></AppShell>;
}
