import { createRoute, useParams } from "@tanstack/react-router";
import { Route as RootRoute } from "../__root";
import { RoomCanvas } from "@/components/RoomCanvas";

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/canvas/$roomId",
  component: Canvas,
});

function Canvas() {
  const { roomId } = useParams({ from: "/canvas/$roomId" } as any);
  return <RoomCanvas roomId={roomId} />;
}
