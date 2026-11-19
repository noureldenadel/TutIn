import { createFileRoute } from "@tanstack/react-router";
import { RoadmapPage } from "@/components/pages/roadmap-page";
import { RoadmapSkeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/roadmap")({
  pendingComponent: RoadmapSkeleton,
  component: RoadmapPage,
});
