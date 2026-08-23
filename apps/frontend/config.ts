/**
 * HTTP backend URL used for REST API requests (signin, signup, room creation).
 *
 * Defaults to `/api`, which Next.js rewrites to the HTTP backend
 * (`http://localhost:3001`), keeping the request same-origin so the auth
 * cookie always works. Set `NEXT_PUBLIC_HTTP_BACKEND` to override (e.g. a
 * fully-qualified URL) — used when the API is not proxied behind the site.
 *
 * @example
 * ```ts
 * await axios.get(`${HTTP_BACKEND}/room/my-room`, { withCredentials: true });
 * ```
 */
export const HTTP_BACKEND =
  import.meta.env.VITE_HTTP_BACKEND || "/api";

export const INTERNAL_HTTP_BACKEND =
  import.meta.env.VITE_HTTP_BACKEND || "http://localhost:3001";

export const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `${typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws"}://${
    typeof window !== "undefined" ? window.location.host : "localhost:3000"
  }/ws`;
