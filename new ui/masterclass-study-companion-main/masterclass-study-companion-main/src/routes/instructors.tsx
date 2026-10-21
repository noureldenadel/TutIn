import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { InstructorsPage } from "@/components/instructors-page";

export const Route = createFileRoute("/instructors")({
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
  return (
    <AppShell>
      <InstructorsPage />
    </AppShell>
  );
}
