import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { ArrowLeft, Camera, Search } from "lucide-react";
import { toast } from "sonner";

import { CourseCard, CourseSortDropdown } from "@/components/layout/app-shell";
import {
  InstructorAvatar,
  normalizeInstructorSlug,
  saveInstructorAvatar,
} from "@/components/layout/instructor-avatar";
import { Button } from "@/components/ui/button";
import { InstructorDetailSkeleton, InstructorListSkeleton } from "@/components/ui/skeleton";
import {
  readAppSettings,
  readSessionFilters,
  SETTINGS_CHANGED_EVENT,
  updateSessionFilters,
  writeAppSettings,
} from "@/lib/app-settings";
import { sortCourses, useCoursesList, type CourseSortOption } from "@/lib/courses";
import { formatDurationLabel } from "@/lib/format";
import { compressImageFileToBlob } from "@/lib/media-store";

export type Instructor = {
  id: string;
  name: string;
  courses: number;
  lessons: number;
  hours: string;
  topics: string[];
};

interface InstructorsPageProps {
  selectedId?: string | null;
  onSelectInstructor?: (id: string | null) => void;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(blob);
  });
}

export function InstructorsPage({
  selectedId: controlledSelectedId,
  onSelectInstructor,
}: InstructorsPageProps = {}) {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const activeId = controlledSelectedId !== undefined ? controlledSelectedId : internalSelectedId;

  const selectInstructor = (id: string | null) => {
    if (onSelectInstructor) {
      onSelectInstructor(id);
    } else {
      setInternalSelectedId(id);
    }
  };

  const { courses, isLoading } = useCoursesList();
  const [query, setQuery] = useState(() => readSessionFilters().instructorsQuery ?? "");
  const [sort, setSort] = useState<CourseSortOption>(() => readAppSettings().librarySort);

  useEffect(() => {
    const syncSort = () => {
      setSort(readAppSettings().librarySort);
    };
    window.addEventListener(SETTINGS_CHANGED_EVENT, syncSort);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, syncSort);
  }, []);

  useEffect(() => {
    updateSessionFilters({ instructorsQuery: query });
  }, [query]);

  const instructorsList = useMemo<Instructor[]>(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        courses: number;
        lessons: number;
        durationSecs: number;
        topics: Set<string>;
      }
    >();

    for (const c of courses) {
      const displayName = (c.instructor || "").trim();
      if (!displayName) continue;
      const slug = normalizeInstructorSlug(displayName);
      const existing = map.get(displayName.toLowerCase());
      if (existing) {
        existing.courses += 1;
        existing.lessons += c.totalVideos || c.lessons || 0;
        existing.durationSecs += c.totalDuration || 0;
        c.tags?.forEach((t) => existing.topics.add(t));
      } else {
        map.set(displayName.toLowerCase(), {
          id: slug,
          name: displayName,
          courses: 1,
          lessons: c.totalVideos || c.lessons || 0,
          durationSecs: c.totalDuration || 0,
          topics: new Set(c.tags ?? []),
        });
      }
    }

    return Array.from(map.values())
      .map((item) => ({
        id: item.id,
        name: item.name,
        courses: item.courses,
        lessons: item.lessons,
        hours: formatDurationLabel(item.durationSecs),
        topics: Array.from(item.topics),
      }))
      .sort((a, b) => b.courses - a.courses || a.name.localeCompare(b.name));
  }, [courses]);

  const handleFileUpload = async (name: string, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be smaller than 10MB.");
      return;
    }
    try {
      const blob = await compressImageFileToBlob(file, 512, 0.85);
      const dataUrl = await blobToDataUrl(blob);
      const ok = await saveInstructorAvatar(name, dataUrl);
      if (ok) {
        toast.success("Avatar updated");
      } else {
        toast.error("Failed to save avatar");
      }
    } catch {
      toast.error("Failed to process image");
    }
  };

  const selectedInstructor = useMemo(() => {
    if (!activeId) return null;
    const needle = activeId.toLowerCase();
    return (
      instructorsList.find(
        (i) => i.id.toLowerCase() === needle || i.name.toLowerCase() === needle,
      ) ?? null
    );
  }, [activeId, instructorsList]);

  const instructorCourses = useMemo(() => {
    if (!selectedInstructor) return [];
    const target = selectedInstructor.name.toLowerCase();
    return sortCourses(
      courses.filter((c) => (c.instructor || "").trim().toLowerCase() === target),
      sort,
    );
  }, [courses, selectedInstructor, sort]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return instructorsList;
    return instructorsList.filter((instructor) => {
      const haystack = [instructor.name, ...instructor.topics].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [instructorsList, query]);

  if (isLoading && activeId && !selectedInstructor) {
    return <InstructorDetailSkeleton />;
  }

  if (selectedInstructor) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-4 pb-8 pt-4 sm:px-8 sm:pb-12 sm:pt-8 lg:px-10">
        <nav className="mb-4 sm:mb-6">
          <button
            type="button"
            onClick={() => selectInstructor(null)}
            className="group inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
          >
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
            Instructors
          </button>
        </nav>

        <header className="flex flex-col gap-4 border-b border-border/50 pb-5 sm:flex-row sm:items-center sm:gap-6 sm:pb-6">
          <div className="group/avatar relative size-16 shrink-0 rounded-full">
            <InstructorAvatar
              name={selectedInstructor.name}
              size="xl"
              className="size-full transition-[filter] duration-150 group-hover/avatar:brightness-[0.4]"
            />
            <label
              className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full text-white opacity-0 transition-opacity duration-150 group-hover/avatar:opacity-100"
              title="Change photo"
            >
              <Camera className="size-5 drop-shadow-sm" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleFileUpload(selectedInstructor.name, e)}
              />
            </label>
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {selectedInstructor.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {instructorCourses.length} {instructorCourses.length === 1 ? "course" : "courses"} ·{" "}
              {selectedInstructor.lessons} lessons · {selectedInstructor.hours}
            </p>
          </div>
        </header>

        <section className="mt-5 sm:mt-6" aria-label={`Courses by ${selectedInstructor.name}`}>
          <div className="flex items-center justify-between pb-3 sm:pb-4">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Courses</h2>
            <CourseSortDropdown
              sort={sort}
              onSortChange={(nextSort) => {
                setSort(nextSort);
                writeAppSettings({ ...readAppSettings(), librarySort: nextSort });
              }}
            />
          </div>

          {instructorCourses.length === 0 ? (
            <div className="mt-12 flex flex-col items-center rounded-xl bg-secondary/40 px-6 py-14 text-center">
              <p className="text-base font-semibold text-foreground">No courses found</p>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-5 md:grid-cols-2 xl:grid-cols-4">
              {instructorCourses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-8 pt-4 sm:px-8 sm:pb-12 sm:pt-8 lg:px-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Instructors
        </h1>
        <label className="flex h-10 min-w-0 items-center gap-2 rounded-lg bg-secondary/75 px-3 transition-colors focus-within:bg-card focus-within:ring-2 focus-within:ring-ring/30 sm:h-11 sm:w-80 lg:w-96">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search instructors"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
      </header>

      {isLoading ? (
        <InstructorListSkeleton count={6} />
      ) : filtered.length === 0 ? (
        <div className="mt-16 flex flex-col items-center rounded-xl bg-secondary/40 px-6 py-16 text-center">
          <p className="text-base font-semibold text-foreground">
            {query ? "No matching instructors" : "No instructors yet"}
          </p>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            {query
              ? "Clear your search to see all instructors."
              : "Add a course with an instructor."}
          </p>
          {query && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-4 rounded-md"
              onClick={() => setQuery("")}
            >
              Clear search
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-1">
          {filtered.map((instructor) => (
            <button
              key={instructor.id}
              type="button"
              onClick={() => selectInstructor(instructor.id)}
              className="group flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-5 sm:py-3.5"
            >
              <div
                className="group/avatar relative size-12 shrink-0 rounded-full"
                onClick={(e) => e.stopPropagation()}
              >
                <InstructorAvatar
                  name={instructor.name}
                  size="lg"
                  className="size-full transition-[filter] duration-150 group-hover/avatar:brightness-[0.4]"
                />
                <label
                  className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full text-white opacity-0 transition-opacity duration-150 group-hover/avatar:opacity-100"
                  title="Change photo"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Camera className="size-4 drop-shadow-sm" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void handleFileUpload(instructor.name, e)}
                  />
                </label>
              </div>
              <span className="min-w-0 flex-1 truncate text-base font-medium text-foreground transition-colors group-hover:text-foreground">
                {instructor.name}
              </span>
              <span className="shrink-0 font-mono text-sm text-muted-foreground">
                {instructor.courses} {instructor.courses === 1 ? "course" : "courses"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
