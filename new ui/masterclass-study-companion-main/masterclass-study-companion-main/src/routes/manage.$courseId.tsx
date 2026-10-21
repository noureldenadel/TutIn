import { createFileRoute, notFound } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { CurriculumManager } from "@/components/curriculum-manager";
import { courses } from "@/lib/courses";

export const Route = createFileRoute("/manage/$courseId")({
  loader: ({ params }) => {
    const course = courses.find((c) => String(c.id) === params.courseId);
    if (!course) throw notFound();
    return { course };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `Manage curriculum — ${loaderData?.course.title ?? "Course"} — TutIn` },
      { name: "description", content: "Reorder modules and lessons, check transcripts, subtitles, and AI dubs." },
      { property: "og:title", content: `Manage curriculum — ${loaderData?.course.title ?? "Course"}` },
      { property: "og:description", content: "A calm curriculum editor for your offline courses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  notFoundComponent: () => <AppShell><div className="p-10 text-muted-foreground">Course not found.</div></AppShell>,
  component: ManagePage,
});

function ManagePage() {
  const { course } = Route.useLoaderData();
  return <AppShell><CurriculumManager course={course} /></AppShell>;
}
