import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TutIn — Your offline learning space" },
      { name: "description", content: "Learn from offline masterclasses with AI transcripts, translations, and study notes." },
      { property: "og:title", content: "TutIn — Your offline learning space" },
      { property: "og:description", content: "A calm, local-first workspace for video learning and AI-powered study." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <AppShell />;
}
