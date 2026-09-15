# Yuniko

Yuniko is a real social web app for publishing image posts, following people, and interacting through likes, comments, and bookmarks.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/yuniko-app run dev` — run the web app (port 5173)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push the PostgreSQL schema (development only)

Required API environment:

- `DATABASE_URL` — PostgreSQL connection string

Optional environment:

- `FRONTEND_ORIGIN` — comma-separated browser origins allowed by the API
- `VITE_API_URL` — public API base URL for the web app; defaults to `/api`

## Where things live

- `artifacts/yuniko-app` — React web client
- `artifacts/api-server/src/routes` — authentication and social API
- `lib/db/src/schema/index.ts` — PostgreSQL source of truth
- `lib/api-spec/openapi.yaml` — API contract for generated clients

## Architecture decisions

- The browser stores only a revocable session token. User data and interactions live in PostgreSQL.
- Passwords use Node's built-in `scrypt` implementation; no plaintext password is persisted.
- Posts accept image URLs for now. This keeps the MVP deployable without pretending there is a file-storage service; object storage can be added behind the same `imageUrl` field.
- The client never falls back to sample content. If the API or database is unavailable, it displays the actual error.

## Product

- Account registration, login, logout, and 30-day revocable sessions
- Chronological feed with persistent likes, bookmarks, comments, and post creation
- User search, public profiles, follow/unfollow, and follow/like/comment notifications