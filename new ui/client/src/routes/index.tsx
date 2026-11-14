import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/components/layout/app-shell";

export const Route = createFileRoute("/")({
  component: HomePage,
});
