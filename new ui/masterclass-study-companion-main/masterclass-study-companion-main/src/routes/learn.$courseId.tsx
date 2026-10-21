import { createFileRoute, notFound } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { CoursePlayer } from "@/components/course-player";
import { courses } from "@/lib/courses";

export const Route = createFileRoute("/learn/$courseId")({
  loader: ({ params }) => {
    const course = courses.find((c) => String(c.id) === params.courseId);
    if (!course) throw notFound();
    return { course };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.course.title ?? "Lesson"} — TutIn` },
      { name: "description", content: "Watch, take notes, and follow an AI transcript in a calm learning workspace." },
      { property: "og:title", content: `${loaderData?.course.title ?? "Lesson"} — TutIn` },
      { property: "og:description", content: "A calm course player with playlist, smart notes, and AI transcript." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  notFoundComponent: () => <AppShell><div className="p-10 text-muted-foreground">Course not found.</div></AppShell>,
  component: LearnPage,
});

function LearnPage() {
  const { course } = Route.useLoaderData();
  return <AppShell><CoursePlayer course={course} /></AppShell>;
}
