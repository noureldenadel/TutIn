import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { RoadmapPage } from "@/components/roadmap-page";

export const Route = createFileRoute("/roadmap")({
  head: () => ({
    meta: [
      { title: "Learning roadmap — TutIn" },
      { name: "description", content: "Plan your learning pathway by arranging and connecting masterclasses." },
      { property: "og:title", content: "Learning roadmap — TutIn" },
      { property: "og:description", content: "Interactive visual curriculum and prerequisite pathways." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <RoadmapPage />
    </AppShell>
  ),
});
