# AGENTS.md — Coding Agent Guidelines for CoDraw

This document guides AI coding agents (Claude, Cursor, Codex, etc.) working on the CoDraw codebase.

---

## Project Overview

- **Type**: Real-time collaborative whiteboard (Excalidraw-like)
- **Stack**: Turborepo monorepo • Vite + TanStack Router + React 19 • Bun HTTP/WS backends • Neon PostgreSQL
- **Architecture**: 3 services (Frontend, HTTP Backend, WS Backend) behind Nginx
- **Key libs**: Rough.js (canvas), Prisma (ORM), TanStack Router (type-safe routing)

---

## Code Style & Conventions

### TypeScript
- **Strict mode** enabled across all workspaces
- **No `any`** — use `unknown` and narrow
- **Type-safe routing**: TanStack Router generates `routeTree.gen.ts` — never edit manually
- **Shape types**: Defined in `packages/shapes/` — import from `@repo/shapes`

### File Organization
- **Frontend routes**: `apps/frontend/src/routes/` — file-based, dynamic params with `$`
- **Canvas engine**: `apps/frontend/src/draw/` — managers, renderers, input handlers
- **Backend routes**: `apps/http-backend/src/` — REST endpoints
- **WS handlers**: `apps/ws-backend/src/` — message types, room broadcasting

### Naming
- **Components**: PascalCase (`Canvas.tsx`, `Toolbar.tsx`)
- **Hooks**: `use` prefix (`useCanvas.ts`)
- **Managers**: `PascalCaseManager.ts` (`PointerInteractionManager.ts`)
- **Utilities**: `camelCase.ts` (`colorSystem.ts`)
- **Types**: PascalCase + `Shape` suffix (`CircleShape`, `RectShape`)

---

## Critical Patterns

### Canvas Rendering
- **Layer caching**: Static scene cached offscreen, only selection/overlay redrawn
- **Transform order**: `ctx.scale(zoom, zoom); ctx.translate(panX, panY)` — **scale first, then translate**
- **Rough.js opts**: `roughness: style.roughness ?? 1` (default 1, not 0)
- **Zoom-aware**: All stroke widths divided by `zoom`

### Real-time Sync
- **Diff-based**: Frontend computes minimal diff (added/modified/deleted IDs)
- **Optimistic concurrency**: HTTP backend uses version stamps, returns 409 on conflict
- **WS messages**: `shape-diff`, `cursor`, `presence`, `chat` — defined in `ws-backend/src/index.ts`

### State Management
- **No Redux/Zustand** — React context + local state for canvas
- **Selection**: `selectedIds` Set in `GameContext`
- **Tools**: `selectedTool` string in `GameContext`

### Error Handling
- **Never swallow errors** — log and rethrow
- **Validation**: Zod schemas in HTTP backend (`room.ts`, `auth.ts`)
- **Canvas errors**: Error boundary wraps Canvas component

---

## Common Tasks

### Add a new shape tool
1. Define type in `packages/shapes/` (e.g., `star.ts`)
2. Export from `packages/shapes/index.ts`
3. Add tool to `canvasTools.ts` (`CORE_TOOLS` or `MORE_TOOLS`)
4. Add pointer handler in `pointerToolHandlers.ts`
5. Add renderer case in `renderer.ts` (`renderShape`)
6. Add hit-test in `renderer.ts` (`hitTest`)
7. Add bounds in `getShapeBounds` (in shape file)

### Add a keyboard shortcut
1. Add entry to `shortcutRegistry.ts` with `match` + `action`
2. Use existing categories: `tool`, `view`, `edit`, `navigation`, `text`, `panel`, `misc`

### Modify canvas rendering
- **Main render**: `RenderManager.clearCanvas()` → `buildCache()` → `blitCache()` → `drawSelection()`
- **Shape rendering**: `renderer.ts` → `renderShape()`
- **Selection**: `renderer.ts` → `drawSelection()`

---

## Testing & Quality

### Before committing
```bash
bun run lint        # ESLint across all workspaces
bun run format      # Prettier
bun run check-types # tsc --noEmit (runs in CI)
```

### Typecheck
- Run `bunx turbo check-types` (uses `tsc --noEmit` per workspace)
- Frontend uses `apps/frontend/tsconfig.json` (extends `@repo/typescript-config/base.json`)

### Build
```bash
bun run build  # turbo build (prisma generate + vite build)
```

---

## Environment Variables

| Variable | Required | Used By | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | All | Neon PostgreSQL connection string |
| `JWT_SECRET` | ✅ | HTTP, WS | JWT signing secret (≥ 32 chars) |
| `ALLOWED_ORIGINS` | ✅ prod | HTTP | CORS origins (comma-separated) |
| `NEXT_PUBLIC_HTTP_BACKEND` | ✅ prod | Frontend | API base URL (baked at build) |
| `NEXT_PUBLIC_WS_URL` | ✅ prod | Frontend | WebSocket URL (baked at build) |

---

## Deployment Notes

- **Frontend**: Vite builds to `apps/frontend/dist/` → served by Nginx directly
- **Backends**: PM2 runs `http-backend` (port 3001) + `ws-backend` (port 8080)
- **Nginx**: Proxies `/api` → 3001, `/ws` → 8080, serves `/` from `dist/`
- **SSL**: Certbot with auto-renewal
- **CI/CD**: GitHub Actions builds frontend artifact, deploys via SSH

---

## Common Pitfalls

| Issue | Cause | Fix |
|-------|-------|-----|
| Canvas offset at zoom ≠ 100% | Wrong transform order | `ctx.scale(); ctx.translate()` |
| Cursors not visible | Transform mismatch | Same fix as above |
| Z-order not updating | Missing `invalidateCache()` | Call `api.invalidateCache()` + `api.clearCanvas()` |
| Click creates default shape | No min drag distance | Check `MIN_RESIZE_SIZE` in pointer handler |
| Type errors in routeTree | Manual edit | Never edit `routeTree.gen.ts` manually |
| WebSocket 400 on connect | Auth token missing | Check `Sec-WebSocket-Protocol` header |

---

## Useful Commands

```bash
# Local dev
bun run dev                    # Start all services

# Typecheck
bunx turbo check-types

# Database
cd packages/db && bun prisma migrate dev
cd packages/db && bun prisma studio

# Production deploy (on EC2)
cd /opt/codraw
git pull && bun install && bun run build
pm2 restart all

# Logs
pm2 logs --lines 100
pm2 logs http-backend
pm2 logs ws-backend
```

---

## Resources

- **TanStack Router**: https://tanstack.com/router
- **Rough.js**: https://roughjs.com
- **Bun API**: https://bun.sh/docs/api
- **Prisma**: https://www.prisma.io/docs
- **Nginx config**: `deploy/nginx/default.conf`
- **PM2 config**: `deploy/pm2/ecosystem.config.js`