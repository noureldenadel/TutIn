import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { InstructorsPage } from "@/components/instructors-page";

type InstructorsSearch = {
  instructor?: string | undefined;
};

export const Route = createFileRoute("/instructors")({
  validateSearch: (search: Record<string, unknown>): InstructorsSearch => ({
    instructor: typeof search["instructor"] === "string" ? (search["instructor"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Instructors — TutIn" },
      { name: "description", content: "Meet the world-class instructors behind your TutIn courses." },
      { property: "og:title", content: "Instructors — TutIn" },
      { property: "og:description", content: "Meet the world-class instructors behind your TutIn courses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InstructorsRoute,
});

function InstructorsRoute() {
  const { instructor } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <AppShell>
      <InstructorsPage
        selectedId={instructor ?? null}
        onSelectInstructor={(id) => {
          navigate({
            to: "/instructors",
            search: id ? { instructor: id } : {},
          });
        }}
      />
    </AppShell>
  );
}
