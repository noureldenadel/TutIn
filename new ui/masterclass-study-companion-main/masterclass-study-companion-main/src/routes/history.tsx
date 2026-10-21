import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { HistoryPage } from "@/components/history-page";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History — TutIn" },
      { name: "description", content: "Pick up right where you left off across all enrolled masterclasses." },
      { property: "og:title", content: "History — TutIn" },
      { property: "og:description", content: "A calm, distraction-free view of everything you've watched." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <AppShell><HistoryPage /></AppShell>,
});
