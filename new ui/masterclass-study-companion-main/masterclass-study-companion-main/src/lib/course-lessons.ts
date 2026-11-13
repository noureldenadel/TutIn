export interface CourseLessonSpec {
  id: string;
  title: string;
  duration: string;
}

export interface CourseModuleSpec {
  id: string;
  title: string;
  lessons: CourseLessonSpec[];
}

export interface CourseLessonItem {
  lessonId: string;
  lessonIdx: number;
  modIdx: number;
  moduleTitle: string;
  lessonInModule: number;
  title: string;
  duration: string;
  durationSeconds: number;
}

export const DEFAULT_COURSE_MODULES: CourseModuleSpec[] = [
  {
    id: "mod-0",
    title: "Foundations & Architecture",
    lessons: [
      { id: "lesson-0", title: "Welcome & how this course works", duration: "04:12" },
      { id: "lesson-1", title: "Seeing like a designer", duration: "09:30" },
      { id: "lesson-2", title: "Principles of visual hierarchy", duration: "12:45" },
      { id: "lesson-3", title: "Typography that breathes", duration: "10:05" },
    ],
  },
  {
    id: "mod-1",
    title: "Color, Space & Rhythm",
    lessons: [
      { id: "lesson-4", title: "Color with intention", duration: "14:20" },
      { id: "lesson-5", title: "Layout and rhythm", duration: "11:48" },
      { id: "lesson-6", title: "The 8-point grid", duration: "09:00" },
      { id: "lesson-7", title: "Micro-interactions & motion", duration: "11:15" },
    ],
  },
  {
    id: "mod-2",
    title: "Designing for People",
    lessons: [
      { id: "lesson-8", title: "Research without the jargon", duration: "11:30" },
      { id: "lesson-9", title: "Designing for real people", duration: "13:02" },
      { id: "lesson-10", title: "Your first case study", duration: "16:30" },
      { id: "lesson-11", title: "Design critiques & handoff", duration: "10:40" },
    ],
  },
];

export function parseDurationToSeconds(label: string): number {
  const parts = label
    .trim()
    .split(":")
    .map((part) => Number(part));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 3) {
    return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  }
  if (parts.length === 2) {
    return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  }
  return parts[0] ?? 0;
}

export function formatTimestamp(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function getCourseModules(_courseId?: string): CourseModuleSpec[] {
  return DEFAULT_COURSE_MODULES;
}

export function getCourseLessons(courseId?: string): CourseLessonItem[] {
  const modules = getCourseModules(courseId);
  const result: CourseLessonItem[] = [];
  let flatIdx = 0;

  modules.forEach((mod, modIdx) => {
    mod.lessons.forEach((lesson, lessonInModuleIdx) => {
      result.push({
        lessonId: lesson.id,
        lessonIdx: flatIdx,
        modIdx,
        moduleTitle: mod.title,
        lessonInModule: lessonInModuleIdx + 1,
        title: lesson.title,
        duration: lesson.duration,
        durationSeconds: parseDurationToSeconds(lesson.duration),
      });
      flatIdx += 1;
    });
  });

  return result;
}

