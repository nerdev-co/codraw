import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/lib/auth-context";

export const Route = createRootRoute({
  component: () => (
    <ThemeProvider>
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    </ThemeProvider>
  ),
});