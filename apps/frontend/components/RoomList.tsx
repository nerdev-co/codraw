/**
 * "Your rooms" section for the home page.
 *
 * Fetches the authenticated user's rooms from the backend and merges them
 * with device-local recents (rooms visited via shared links). Renders a
 * grid of room cards plus an "Open Canvas" button to create a new room.
 * Unauthenticated visitors get a sign-in prompt instead.
 */

"use client";

import { HTTP_BACKEND } from "@/config";
import { Button } from "@/components/ui";
import { ArrowUpRight, History, Pencil, SquarePlus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import axios, { isAxiosError } from "axios";
import { useEffect, useState } from "react";
import { getRecentRooms, type RecentRoom } from "@/lib/recents";

interface RoomSummary {
  id: number;
  slug: string;
  createdAt: string;
}

const MAX_RECENTS = 6;

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function RoomCard({ slug, ago }: { slug: string; ago: string }) {
  return (
    <Link
      to={`/canvas/${slug}`}
      className="group flex items-center justify-between gap-3 px-4 py-3 border border-border dark:border-border-dark rounded-lg bg-card dark:bg-card-dark transition-[border-color,transform] duration-fast ease-spring hover:border-primary hover:-translate-y-0.5"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex items-center justify-center w-8 h-8 shrink-0 border border-border dark:border-border-dark rounded-md bg-canvas dark:bg-canvas-dark">
          <Pencil className="w-4 h-4 text-primary" />
        </span>
        <div className="min-w-0">
          <p className="font-mono text-sm truncate text-foreground dark:text-foreground-dark">{slug}</p>
          <p className="mt-0.5 text-xs text-muted-foreground dark:text-muted-foreground-dark">{ago}</p>
        </div>
      </div>
      <ArrowUpRight className="w-4 h-4 text-muted-foreground transition-colors duration-fast group-hover:text-primary" />
    </Link>
  );
}

export function RoomList() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [recents, setRecents] = useState<RecentRoom[]>([]);
  const [authError, setAuthError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  /** Load own rooms from the backend. */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // localStorage is only available on the client, so recents must be
    // loaded after mount to avoid SSR hydration mismatches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecents(getRecentRooms());
  }, []);

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${HTTP_BACKEND}/rooms/mine`, { withCredentials: true })
      .then((res) => {
        if (cancelled) return;
        setRooms(res.data.rooms);
        setAuthError(false);
      })
      .catch((e) => {
        if (cancelled) return;
        if (isAxiosError(e) && (e.response?.status === 401 || e.response?.status === 403)) {
          setAuthError(true);
        } else {
          setError("Failed to load your rooms. Please try again.");
        }
      });
    return () => { cancelled = true; };
  }, [reloadKey]);

  if (authError) {
    return (
      <div className="px-4 py-3 border border-border dark:border-border-dark rounded-lg bg-card dark:bg-card-dark">
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-dark">
          Sign in to create a room and pick up where you left off.
        </p>
        <div className="flex gap-3 mt-3">
          <Link to="/signin">
            <Button variant="primary">Sign in</Button>
          </Link>
          <Link to="/signup">
            <Button variant="secondary">Sign up</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-3 border border-border dark:border-border-dark rounded-lg bg-card dark:bg-card-dark">
        <p className="text-sm text-danger dark:text-danger-dark">{error}</p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => {
            setError(null);
            setAuthError(false);
            setReloadKey((k) => k + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  /** Own rooms are authoritative; show only non-owned slugs under recents. */
  const ownSlugs = new Set((rooms ?? []).map((r) => r.slug));
  const visitedOnly = recents.filter((r) => !ownSlugs.has(r.slug)).slice(0, MAX_RECENTS);
  const loading = rooms === null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground dark:text-foreground-dark">Your rooms</h2>
        <Button
          variant="secondary"
          disabled={creating}
          onClick={async () => {
            setCreating(true);
            try {
              const res = await axios.post(
                `${HTTP_BACKEND}/room`,
                { name: `room-${Date.now()}` },
                { withCredentials: true },
              );
              navigate({ to: `/canvas/${res.data.slug}` });
            } catch (e) {
              if (isAxiosError(e) && (e.response?.status === 401 || e.response?.status === 403)) {
                navigate({ to: "/signin" });
              } else {
                setError("Failed to create room. Please try again.");
              }
            } finally {
              setCreating(false);
            }
          }}
        >
          <SquarePlus className={`w-4 h-4 mr-1.5 ${creating ? "animate-spin" : ""}`} />
          Open Canvas
        </Button>
      </div>

      {!loading && (rooms?.length ?? 0) > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rooms!.map((r) => (
            <RoomCard key={r.id} slug={r.slug} ago={timeAgo(r.createdAt)} />
          ))}
        </div>
      )}

      {!loading && (rooms?.length ?? 0) === 0 && visitedOnly.length === 0 && (
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-dark">
          No rooms yet — create one to start drawing with others.
        </p>
      )}

      {visitedOnly.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mt-6 mb-3 text-xs font-mono text-muted-foreground dark:text-muted-foreground-dark">
            <History className="w-3.5 h-3.5" />
            recently visited
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visitedOnly.map((r) => (
              <RoomCard
                key={r.slug}
                slug={r.slug}
                ago={timeAgo(new Date(r.lastVisitedAt).toISOString())}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
