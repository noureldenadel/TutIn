import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { CoursePlayer } from "@/components/course-player";
import { findSavedCourseById, type Course } from "@/lib/courses";

interface LearnSearch {
  lesson?: number | undefined;
  t?: number | undefined;
  tab?: "playlist" | "notes" | "transcript" | undefined;
}

export const Route = createFileRoute("/learn/$courseId")({
  validateSearch: (search: Record<string, unknown>): LearnSearch => {
    const rawLesson = Number(search["lesson"]);
    const rawTime = Number(search["t"]);
    const rawTab = search["tab"];
    return {
      lesson: Number.isFinite(rawLesson) && rawLesson >= 0 ? Math.floor(rawLesson) : undefined,
      t: Number.isFinite(rawTime) && rawTime >= 0 ? rawTime : undefined,
      tab:
        rawTab === "playlist" || rawTab === "notes" || rawTab === "transcript"
          ? rawTab
          : undefined,
    };
  },
  loader: ({ params }) => {
    const course = findSavedCourseById(params.courseId) ?? null;
    return { courseId: params.courseId, ssrCourse: course };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.ssrCourse?.title ?? "Lesson"} — TutIn` },
      { name: "description", content: "Watch, take notes, and follow an AI transcript in a calm learning workspace." },
      { property: "og:title", content: `${loaderData?.ssrCourse?.title ?? "Lesson"} — TutIn` },
      { property: "og:description", content: "A calm course player with playlist, smart notes, and AI transcript." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LearnPage,
});

function LearnPage() {
  const { courseId, ssrCourse } = Route.useLoaderData();
  const search = Route.useSearch();
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
      <CoursePlayer
        course={clientCourse}
        initialLessonIdx={search.lesson}
        initialTime={search.t}
        initialTab={search.tab}
      />
    </AppShell>
  );
}
