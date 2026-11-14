import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { CoursePlayer } from "@/components/player/course-player";
import { useSavedCourseQuery } from "@/lib/courses";

interface LearnSearch {
  lesson?: number | undefined;
  videoId?: string | undefined;
  t?: number | undefined;
  tab?: "playlist" | "notes" | "transcript" | undefined;
}

export const Route = createFileRoute("/learn/$courseId")({
  validateSearch: (search: Record<string, unknown>): LearnSearch => {
    const rawLesson = Number(search["lesson"]);
    const rawVideoId = search["videoId"];
    const rawTime = Number(search["t"]);
    const rawTab = search["tab"];
    return {
      lesson: Number.isFinite(rawLesson) && rawLesson >= 0 ? Math.floor(rawLesson) : undefined,
      videoId: typeof rawVideoId === "string" && rawVideoId.trim() ? rawVideoId.trim() : undefined,
      t: Number.isFinite(rawTime) && rawTime >= 0 ? rawTime : undefined,
      tab:
        rawTab === "playlist" || rawTab === "notes" || rawTab === "transcript"
          ? rawTab
          : undefined,
    };
  },
  component: LearnPage,
});

function LearnPage() {
  const { courseId } = Route.useParams();
  const search = Route.useSearch();
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

  return (
    <CoursePlayer
      course={course}
      initialLessonIdx={search.lesson}
      initialVideoId={search.videoId}
      initialTime={search.t}
      initialTab={search.tab}
    />
  );
}
