import { createFileRoute } from "@tanstack/react-router";
import { CoursePlayer } from "@/components/player/course-player";
import { PlayerSkeleton } from "@/components/ui/skeleton";
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
        rawTab === "playlist" || rawTab === "notes" || rawTab === "transcript" ? rawTab : undefined,
    };
  },
  pendingComponent: PlayerSkeleton,
  component: LearnPage,
});

function LearnPage() {
  const { courseId } = Route.useParams();
  const search = Route.useSearch();
  const { course, isLoading } = useSavedCourseQuery(courseId);

  if (isLoading && !course) {
    return <PlayerSkeleton />;
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
