import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { InstructorsPage } from "@/components/pages/instructors-page";

type InstructorsSearch = {
  instructor?: string | undefined;
};

export const Route = createFileRoute("/instructors")({
  validateSearch: (search: Record<string, unknown>): InstructorsSearch => ({
    instructor: typeof search["instructor"] === "string" ? search["instructor"] : undefined,
  }),
  component: InstructorsRoute,
});

function InstructorsRoute() {
  const { instructor } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <InstructorsPage
      selectedId={instructor ?? null}
      onSelectInstructor={(id) => {
        navigate({
          to: "/instructors",
          search: id ? { instructor: id } : {},
        });
      }}
    />
  );
}
