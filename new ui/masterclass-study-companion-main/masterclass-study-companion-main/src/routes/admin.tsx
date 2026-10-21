import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { AdminDashboard } from "@/components/admin-dashboard";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Thumbnail Generator Admin — TutIn" },
      { name: "description", content: "Configure global generative artwork parameters for courses without uploaded thumbnails." },
      { property: "og:title", content: "Thumbnail Generator Admin — TutIn" },
      { property: "og:description", content: "Control algorithmic thumbnail generation, density, contrast, and color palettes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <AdminDashboard />
    </AppShell>
  ),
});
