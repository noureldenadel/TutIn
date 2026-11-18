import { createFileRoute } from "@tanstack/react-router";
import { RoadmapPage } from "@/components/pages/roadmap-page";

export const Route = createFileRoute("/roadmap")({
  component: RoadmapPage,
});
