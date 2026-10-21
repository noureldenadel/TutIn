import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Learning analytics — TutIn" },
      { name: "description", content: "Your watch time, streaks, study consistency, and learning focus at a glance." },
      { property: "og:title", content: "Learning analytics — TutIn" },
      { property: "og:description", content: "A calm, motivating view of how you learn." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <AppShell><AnalyticsDashboard /></AppShell>,
});
