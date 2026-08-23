import { createRoute, useNavigate, Link as RouterLink } from "@tanstack/react-router";
import { Route as RootRoute } from "./__root";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui";
import {
  Github,
  ImageDown,
  Pencil,
  Save,
  Shapes,
  ShieldCheck,
  Undo2,
  Wifi,
} from "lucide-react";
import { HeroBoard } from "@/components/HeroBoard";
import { RoomList } from "@/components/RoomList";
import { SignOutButton } from "@/components/SignOutButton";
import { OpenCanvasButton } from "@/components/OpenCanvasButton";

function A({ to, children, ...rest }: { to: string; children: React.ReactNode } & Record<string, unknown>) {
  return (
    <RouterLink to={to as any} {...rest}>
      {children}
    </RouterLink>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/",
  component: Index,
});

function Index() {
  const { me, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas dark:bg-canvas-dark">
      {/* Nav */}
      <nav className="border-b border-border dark:border-border-dark">
        <div className="container flex items-center justify-between px-4 py-3.5 mx-auto sm:px-6 lg:px-8">
          <A
            to="/"
            className="flex items-center gap-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="flex items-center justify-center w-7 h-7 -rotate-6 border border-border dark:border-border-dark rounded-md bg-card dark:bg-card-dark">
              <Pencil className="w-3.5 h-3.5 text-primary" />
            </span>
            <span className="font-mono font-semibold text-base tracking-tight text-foreground dark:text-foreground-dark">
              CoDraw
            </span>
          </A>
          <div className="flex items-center gap-3">
            {me && (
              <span className="hidden sm:inline-flex items-center gap-2 px-2.5 py-1.5 font-mono text-xs border border-border rounded-md text-muted-foreground dark:text-muted-foreground-dark">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                {me.name}
              </span>
            )}
            <a
              href="https://github.com/NalinDalal/codraw"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-muted-foreground dark:text-muted-foreground-dark rounded transition-colors duration-fast hover:text-foreground dark:hover:text-foreground-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="GitHub repository"
            >
              <Github className="w-5 h-5" />
            </a>
            {me && <SignOutButton />}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="overflow-hidden border-b border-border dark:border-border-dark bg-[radial-gradient(circle,#eceef1_1px,transparent_1px)] dark:bg-[radial-gradient(circle,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:24px_24px]">
        <div className="container px-4 py-16 mx-auto sm:px-6 lg:px-8 sm:py-20">
          <div className="max-w-3xl mx-auto text-center">
            {me ? (
              <>
                <p className="font-mono text-xs text-primary dark:text-highlight-dark tracking-wider">
                  {"// "}signed in as {me.name}
                </p>
                <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl text-foreground dark:text-foreground-dark">
                  Welcome back —{" "}
                  <span className="text-primary dark:text-highlight-dark">pick up your canvas</span>
                </h1>
                <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground dark:text-muted-foreground-dark">
                  Create a new room or jump into one of yours below.
                  Share the link to draw together in real time.
                </p>
                <div className="flex gap-x-4 justify-center items-center mt-10">
                  <OpenCanvasButton />
                </div>
              </>
            ) : (
              <>
                <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl text-foreground dark:text-foreground-dark">
                  Excalidraw-style canvas with{" "}
                  <span className="text-primary dark:text-highlight-dark">live multi-user collaboration</span>
                </h1>
                <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground dark:text-muted-foreground-dark">
                  Real-time collaborative whiteboard where multiple users draw,
                  chat, and edit the same canvas together over WebSockets.
                </p>
                <div className="flex gap-x-4 justify-center items-center mt-10">
                  <A to="/signin">
                    <Button
                      variant="primary"
                      className="px-6 h-11 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas dark:focus-visible:ring-offset-canvas-dark"
                    >
                      Sign in
                    </Button>
                  </A>
                  <A to="/signup">
                    <Button
                      variant="secondary"
                      className="px-6 h-11 rounded-md border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas dark:focus-visible:ring-offset-canvas-dark"
                    >
                      Sign up
                    </Button>
                  </A>
                </div>
              </>
            )}
          </div>

          {!me && (
            <div className="max-w-3xl mx-auto mt-14">
              <HeroBoard />
              <p className="mt-2 font-mono text-xs text-muted-foreground text-center">
                {"// shapes: rectangle, ellipse, diamond, arrow — drawn with rough.js"}
              </p>
            </div>
          )}
        </div>
      </header>

      {/* Your rooms */}
      {me && (
        <section className="py-16 sm:py-20 border-b border-border dark:border-border-dark">
          <div className="container px-4 mx-auto sm:px-6 lg:px-8">
            <SectionKicker>your rooms</SectionKicker>
            <h2 className="mt-3 max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">
              Jump back in
            </h2>
            <div className="mt-8">
              <RoomList />
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section className="py-20 sm:py-24">
        <div className="container px-4 mx-auto sm:px-6 lg:px-8">
          <SectionKicker>features</SectionKicker>
          <h2 className="mt-3 max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to draw together
          </h2>
          <div className="grid grid-cols-1 gap-4 mt-12 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="p-5 border border-border dark:border-border-dark rounded-lg bg-card dark:bg-card-dark transition-[border-color,transform] duration-fast ease-spring hover:border-primary hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center justify-center w-10 h-10 border border-border dark:border-border-dark rounded-md bg-muted dark:bg-muted-dark">
                    <f.icon className="w-5 h-5 text-primary dark:text-highlight-dark" />
                  </div>
                  <span className="font-mono text-xs text-muted-foreground dark:text-muted-foreground-dark">
                    {f.index}
                  </span>
                </div>
                <h3 className="mt-4 font-semibold text-foreground dark:text-foreground-dark">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground dark:text-muted-foreground-dark">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech stack */}
      <section className="py-16 sm:py-20 bg-muted dark:bg-muted-dark border-y border-border dark:border-border-dark">
        <div className="container px-4 mx-auto sm:px-6 lg:px-8">
          <SectionKicker>tech stack</SectionKicker>
          <h2 className="mt-3 max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">
            One toolchain, three services
          </h2>
          <div className="flex flex-wrap gap-2 mt-8">
            {STACK.map((item) => (
              <span
                key={item}
                className="px-3 py-1.5 font-mono text-sm border border-border dark:border-border-dark rounded-md bg-muted dark:bg-muted-dark text-foreground dark:text-foreground-dark"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Under the hood */}
      <section className="py-20 sm:py-24">
        <div className="container px-4 mx-auto sm:px-6 lg:px-8">
          <SectionKicker>under the hood</SectionKicker>
          <h2 className="mt-3 max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">
            The boring details, done right
          </h2>
          <div className="mt-10 overflow-hidden border border-border dark:border-border-dark rounded-lg bg-card dark:bg-card-dark">
            <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border dark:border-border-dark bg-muted dark:bg-muted-dark">
              <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <span className="w-3 h-3 rounded-full bg-[#28c840]" />
              <span className="ml-2 font-mono text-xs text-muted-foreground dark:text-muted-foreground-dark">
                architecture
              </span>
            </div>
            <div className="p-5 sm:p-6">
              {HIGHLIGHTS.map((h) => (
                <p key={h} className="py-1.5 font-mono text-sm text-foreground dark:text-foreground-dark">
                  <span className="text-muted-foreground dark:text-muted-foreground-dark">$ </span>
                  {h}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border dark:border-border-dark">
        <div className="container flex flex-col gap-4 items-center justify-between px-4 py-8 mx-auto sm:flex-row sm:px-6 lg:px-8">
          <p className="font-mono text-sm text-muted-foreground dark:text-muted-foreground-dark">
            © {new Date().getFullYear()} CoDraw — real-time collaborative
            whiteboard
          </p>
          <a
            href="https://github.com/NalinDalal/week-22-excalidraw"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 font-mono text-sm border border-border rounded-md text-foreground dark:text-foreground-dark transition-[border-color,color] duration-fast hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Github className="w-4 h-4" />
            view source
          </a>
        </div>
      </footer>
    </div>
  );
}

const FEATURES = [
  {
    icon: Shapes,
    index: "01",
    title: "Full drawing toolset",
    body: "Pencil, rect, circle, diamond, arrow, line, text, image, eraser and frame — plus grouping and multi-select.",
  },
  {
    icon: Wifi,
    index: "02",
    title: "Real-time sync",
    body: "Shape diffs, live presence cursors and in-room chat over WebSockets, with auto-reconnect using exponential backoff.",
  },
  {
    icon: Save,
    index: "03",
    title: "Conflict-safe autosave",
    body: "Optimistic concurrency with 409 merge handling — your edits are never silently overwritten.",
  },
  {
    icon: Undo2,
    index: "04",
    title: "Canvas UX",
    body: "Undo/redo, pinch-to-zoom, touch support, minimap and present mode.",
  },
  {
    icon: ImageDown,
    index: "05",
    title: "Export & images",
    body: "Export to PNG, SVG or JSON, and upload images with LRU caching.",
  },
  {
    icon: ShieldCheck,
    index: "06",
    title: "Security",
    body: "Custom HS256 JWT auth, bcrypt, per-IP rate limiting and revocable sessions.",
  },
];

const STACK = [
  "next.js 15",
  "react 19",
  "typescript",
  "bun",
  "postgresql / prisma",
  "turborepo",
  "aws ec2",
];

const HIGHLIGHTS = [
  "monorepo — 3 apps + 4 shared packages",
  "persistence — versioned optimistic concurrency",
  "renderer — custom canvas engine, dirty-rect + layer caching",
];

function SectionKicker({ children }: { children: string }) {
  return (
    <p className="font-mono text-xs text-primary dark:text-highlight-dark tracking-wider">
      {"// "}
      {children}
    </p>
  );
}
