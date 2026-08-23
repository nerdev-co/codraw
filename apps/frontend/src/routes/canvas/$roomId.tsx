import { createRoute, useParams, redirect } from "@tanstack/react-router";
import { Route as RootRoute } from "../__root";
import { checkAuth } from "@/lib/auth";

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/canvas/$roomId",
  beforeLoad: async () => {
    const authenticated = await checkAuth();
    if (!authenticated) {
      throw redirect({ to: "/" } as any);
    }
  },
  component: Canvas,
});

function Canvas() {
  const { roomId } = useParams({ from: "/canvas/$roomId" } as any);
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground dark:text-foreground-dark">Canvas: {roomId}</h1>
        <p className="mt-2 text-muted-foreground dark:text-muted-foreground-dark">Collaborative whiteboard coming soon...</p>
      </div>
    </div>
  );
}
