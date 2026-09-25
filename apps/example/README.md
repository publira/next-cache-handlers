# next-cache-handlers example

A minimal Next.js app wired to `@publira/next-cache-handlers`. It is not published; it shows the wiring, keeps it building, and is the app the end-to-end tests in `e2e/` run.

- `next.config.ts` points both `cacheHandler` and `cacheHandlers` at the package.
- `app/page.tsx` is prerendered and stored through `cacheHandler`. It renders a `"use cache"` timestamp tagged `example`.
- `app/api/remote/route.ts` reads a `"use cache: remote"` timestamp tagged `example` on every request, through `cacheHandlers`.
- `app/api/revalidate/route.ts` exposes `revalidateTags`.

## Running it

Build the workspace once, then start the app with a Redis-compatible server reachable at `PNCH_REDIS_URL` (default `redis://localhost:6379`):

```sh
pnpm build
PNCH_CACHE_APP=example PNCH_REVALIDATE_TOKEN=secret \
  pnpm --filter @publira/next-cache-handlers-example start
```

Revalidate the cached timestamps:

```sh
curl -X POST http://localhost:3000/api/revalidate \
  -H "Content-Type: application/json" \
  -H "X-Revalidate-Token: secret" \
  -d '{"tags":["example"]}'
```
