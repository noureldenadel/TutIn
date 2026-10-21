import { useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InstructorAvatar } from "@/components/instructor-avatar";
import { cn } from "@/lib/utils";

type Instructor = {
  id: string;
  name: string;
  category: string;
  courses: number;
  lessons: number;
  hours: string;
  topics: string[];
};

const categories = ["All", "AI & Machine Learning", "Web Development", "System Design", "Cloud"] as const;

const instructors: Instructor[] = [
  {
    id: "maya-chen",
    name: "Maya Chen",
    category: "AI & Machine Learning",
    courses: 3,
    lessons: 42,
    hours: "18h",
    topics: ["Deep Learning", "PyTorch", "Transformer Models", "LLM Fine-tuning"],
  },
  {
    id: "oliver-grant",
    name: "Oliver Grant",
    category: "Web Development",
    courses: 4,
    lessons: 56,
    hours: "24h",
    topics: ["React", "TypeScript", "Design Systems", "Performance"],
  },
  {
    id: "sofia-marin",
    name: "Sofía Marín",
    category: "System Design",
    courses: 2,
    lessons: 30,
    hours: "14h",
    topics: ["Distributed Systems", "Databases", "Caching", "Consistency"],
  },
  {
    id: "nia-williams",
    name: "Nia Williams",
    category: "Cloud",
    courses: 3,
    lessons: 38,
    hours: "16h",
    topics: ["Kubernetes", "Serverless", "Infrastructure as Code", "Cost Optimization"],
  },
  {
    id: "daniel-okafor",
    name: "Daniel Okafor",
    category: "AI & Machine Learning",
    courses: 2,
    lessons: 27,
    hours: "12h",
    topics: ["Reinforcement Learning", "Neural Networks", "Mathematics for ML"],
  },
  {
    id: "lena-kovacs",
    name: "Lena Kovács",
    category: "Cloud",
    courses: 2,
    lessons: 22,
    hours: "9h",
    topics: ["Edge Computing", "Networking", "Security", "Workers"],
  },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function InstructorCard({ instructor }: { instructor: Instructor }) {
  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-md">
      <div className="flex items-center gap-4">
        <InstructorAvatar name={instructor.name} size="xl" showSpark />
        <h3 className="min-w-0 truncate text-lg font-semibold tracking-tight text-foreground">
          {instructor.name}
        </h3>
      </div>

      <div className="mt-4 flex items-center gap-2 text-[13px] font-medium text-foreground/70">
        <span>{instructor.courses} courses</span>
        <span className="text-muted-foreground/50">•</span>
        <span>{instructor.lessons} lessons</span>
        <span className="text-muted-foreground/50">•</span>
        <span>{instructor.hours}</span>
      </div>

      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {instructor.topics.map((topic) => (
          <span
            key={topic}
            className="shrink-0 rounded-full border border-border bg-secondary/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
          >
            {topic}
          </span>
        ))}
      </div>

      <Button asChild variant="outline" className="mt-5 w-full rounded-md hover:bg-secondary">
        <Link to="/">
          View courses
          <ArrowRight className="size-4" />
        </Link>
      </Button>
    </article>
  );
}

export function InstructorsPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("All");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return instructors.filter((instructor) => {
      if (category !== "All" && instructor.category !== category) return false;
      if (!q) return true;
      const haystack = [instructor.name, instructor.category, ...instructor.topics].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [query, category]);

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Instructors</h1>
      </header>

      <div className="mt-7 flex flex-col gap-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search instructors"
            className="h-11 rounded-lg border-border bg-card pl-11 text-sm shadow-sm"
          />
        </div>
        <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg border border-border bg-secondary/50 p-1">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={cn(
                "rounded-sm px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                category === item
                  ? "bg-card text-foreground shadow-card"
                  : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-16 flex flex-col items-center rounded-xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
          <p className="text-base font-semibold text-foreground">No instructors found</p>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            No instructors match this view.
          </p>
          <Button variant="outline" size="sm" className="mt-4 rounded-md" onClick={() => { setQuery(""); setCategory("All"); }}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((instructor) => (
            <InstructorCard key={instructor.id} instructor={instructor} />
          ))}
        </div>
      )}
    </div>
  );
}
