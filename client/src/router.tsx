import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const queryClient = new QueryClient();

export const router = createRouter({
  routeTree,
  context: { queryClient },
  scrollRestoration: true,
  defaultPreloadStaleTime: 0,
  defaultPendingMs: 120,
  defaultPendingMinMs: 250,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
