import { createRoute } from "@tanstack/react-router";
import { Route as RootRoute } from "./__root";
import { AuthPage } from "@/components/AuthPage";

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/signup",
  component: Signup,
});

function Signup() {
  return <AuthPage isSignin={false} />;
}
