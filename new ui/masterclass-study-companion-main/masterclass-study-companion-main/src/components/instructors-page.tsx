import { useMemo, useState } from "react";
import { ArrowLeft, Camera, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { InstructorAvatar } from "@/components/instructor-avatar";
import { CourseCard } from "@/components/app-shell";
import { courses } from "@/lib/courses";

export type Instructor = {
  id: string;
  name: string;
  category?: string;
  courses: number;
  lessons: number;
  hours: string;
  topics: string[];
};

export const instructors: Instructor[] = [
  {
    id: "maya-chen",
    name: "Maya Chen",
    category: "AI & Machine Learning",
    courses: 3,
    lessons: 42,
    hours: "16h 15m",
    topics: ["Deep Learning", "PyTorch", "Transformer Models", "LLM Fine-tuning"],
  },
  {
    id: "oliver-grant",
    name: "Oliver Grant",
    category: "Web Development",
    courses: 4,
    lessons: 58,
    hours: "20h 40m",
    topics: ["React", "TypeScript", "Design Systems", "Performance"],
  },
  {
    id: "sofia-marin",
    name: "Sofía Marín",
    category: "System Design",
    courses: 2,
    lessons: 40,
    hours: "14h 20m",
    topics: ["Distributed Systems", "Databases", "Caching", "Consistency"],
  },
  {
    id: "nia-williams",
    name: "Nia Williams",
    category: "Cloud",
    courses: 3,
    lessons: 38,
    hours: "16h 15m",
    topics: ["Kubernetes", "Serverless", "Infrastructure as Code", "Cost Optimization"],
  },
  {
    id: "daniel-okafor",
    name: "Daniel Okafor",
    category: "AI & Machine Learning",
    courses: 2,
    lessons: 27,
    hours: "12h 10m",
    topics: ["Reinforcement Learning", "Neural Networks", "Mathematics for ML"],
  },
  {
    id: "lena-kovacs",
    name: "Lena Kovács",
    category: "Cloud",
    courses: 2,
    lessons: 22,
    hours: "9h 00m",
    topics: ["Edge Computing", "Networking", "Security", "Workers"],
  },
  {
    id: "dev-patel",
    name: "Dev Patel",
    category: "Web Development",
    courses: 1,
    lessons: 14,
    hours: "6h 00m",
    topics: ["Fullstack", "Next.js", "Node", "GraphQL"],
  },
  {
    id: "lucas-zanotto",
    name: "Lucas Zanotto",
    category: "Web Development",
    courses: 5,
    lessons: 60,
    hours: "28h 00m",
    topics: ["Animation", "Creative Coding", "WebGL", "Three.js"],
  },
  {
    id: "ana-ruiz",
    name: "Ana Ruiz",
    category: "System Design",
    courses: 1,
    lessons: 16,
    hours: "7h 00m",
    topics: ["Microservices", "Event-Driven", "Kafka"],
  },
  {
    id: "hana-kim",
    name: "Hana Kim",
    category: "AI & Machine Learning",
    courses: 2,
    lessons: 25,
    hours: "11h 00m",
    topics: ["Computer Vision", "Diffusion Models", "Generative AI"],
  },
];

interface InstructorsPageProps {
  selectedId?: string | null;
  onSelectInstructor?: (id: string | null) => void;
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

  const [query, setQuery] = useState("");

  const [avatarMap, setAvatarMap] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem("tutin_instructor_avatars");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const normalizeKey = (id: string, name: string) => {
    return id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  };

  const saveAvatar = (id: string, name: string, dataUrl: string) => {
    const key = normalizeKey(id, name);
    const updated = { ...avatarMap, [key]: dataUrl, [name]: dataUrl };
    setAvatarMap(updated);
    try {
      localStorage.setItem("tutin_instructor_avatars", JSON.stringify(updated));
      window.dispatchEvent(
        new CustomEvent("tutin:instructor_avatar_changed", { detail: { id: key, dataUrl } })
      );
    } catch {
      // ignore
    }
  };

  const removeAvatar = (id: string, name: string) => {
    const key = normalizeKey(id, name);
    const updated = { ...avatarMap };
    delete updated[key];
    delete updated[name];
    setAvatarMap(updated);
    try {
      localStorage.setItem("tutin_instructor_avatars", JSON.stringify(updated));
      window.dispatchEvent(
        new CustomEvent("tutin:instructor_avatar_changed", { detail: { id: key, dataUrl: null } })
      );
    } catch {
      // ignore
    }
    toast.success("Avatar removed");
  };

  const hasCustomAvatar = (id: string, name: string) => {
    const key = normalizeKey(id, name);
    return Boolean(avatarMap[key] || avatarMap[name]);
  };

  const handleFileUpload = (id: string, name: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        saveAvatar(id, name, dataUrl);
        toast.success("Avatar updated");
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const selectedInstructor = useMemo(() => {
    if (!activeId) return null;
    return instructors.find((i) => i.id === activeId || i.name.toLowerCase() === activeId.toLowerCase()) ?? null;
  }, [activeId]);

  const instructorCourses = useMemo(() => {
    if (!selectedInstructor) return [];
    return courses.filter((c) => c.instructor.toLowerCase() === selectedInstructor.name.toLowerCase());
  }, [selectedInstructor]);

  const totalLessons = useMemo(() => {
    return instructorCourses.reduce((sum, c) => sum + c.lessons, 0);
  }, [instructorCourses]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return instructors;
    return instructors.filter((instructor) => {
      const haystack = [instructor.name, ...instructor.topics].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [query]);

  // Selected Instructor View
  if (selectedInstructor) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-5 pb-12 pt-6 sm:px-8 sm:pt-8 lg:px-10">
        <nav className="mb-6">
          <button
            type="button"
            onClick={() => selectInstructor(null)}
            className="group inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
          >
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
            Instructors
          </button>
        </nav>

        {/* Instructor Profile Header */}
        <header className="flex flex-col gap-5 border-b border-border/50 pb-6 sm:flex-row sm:items-center sm:gap-6">
          <div className="group/avatar relative inline-flex shrink-0 items-center justify-center">
            <div className="relative size-16 shrink-0 rounded-full">
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
                  onChange={(e) => handleFileUpload(selectedInstructor.id, selectedInstructor.name, e)}
                />
              </label>
            </div>
            {hasCustomAvatar(selectedInstructor.id, selectedInstructor.name) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeAvatar(selectedInstructor.id, selectedInstructor.name);
                }}
                className="absolute -right-1 -top-1 z-10 flex size-5 items-center justify-center rounded-full bg-card text-muted-foreground shadow-card transition-colors hover:text-destructive"
                title="Remove photo"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {selectedInstructor.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {instructorCourses.length} {instructorCourses.length === 1 ? "course" : "courses"} • {totalLessons} lessons • {selectedInstructor.hours}
            </p>
          </div>
        </header>

        {/* Courses Section */}
        <section className="mt-6" aria-label={`Courses by ${selectedInstructor.name}`}>
          <div className="flex items-center justify-between pb-4">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Courses
            </h2>
            <span className="font-mono text-xs text-muted-foreground">
              {instructorCourses.length} {instructorCourses.length === 1 ? "course" : "courses"}
            </span>
          </div>

          {instructorCourses.length === 0 ? (
            <div className="mt-12 flex flex-col items-center rounded-xl bg-secondary/40 px-6 py-14 text-center">
              <p className="text-base font-semibold text-foreground">No courses found</p>
              <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
                This instructor doesn't have any courses enrolled yet.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {instructorCourses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  // Instructors List View
  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 pb-12 pt-6 sm:px-8 sm:pt-8 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Instructors</h1>
        <label className="flex h-11 min-w-0 items-center gap-2 rounded-lg bg-secondary/75 px-3 transition-colors focus-within:bg-card focus-within:ring-2 focus-within:ring-ring/30 sm:w-80 lg:w-96">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search instructors"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
      </header>

      {filtered.length === 0 ? (
        <div className="mt-16 flex flex-col items-center rounded-xl bg-secondary/40 px-6 py-16 text-center">
          <p className="text-base font-semibold text-foreground">No instructors found</p>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            No instructors match your search.
          </p>
          <Button variant="secondary" size="sm" className="mt-4 rounded-md" onClick={() => setQuery("")}>
            Clear search
          </Button>
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
                    onChange={(e) => handleFileUpload(instructor.id, instructor.name, e)}
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
