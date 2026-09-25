# Changelog

## 1.0.0 (2026-09-25)

### Features

* Redis-backed `cacheHandler` (`@publira/next-cache-handlers/incremental`) for ISR, Route Handlers, `fetch`, and `next/image`
* Redis-backed `cacheHandlers` (`@publira/next-cache-handlers/use-cache`) for `"use cache"` and `"use cache: remote"`
* `revalidateTags` Route Handler (`@publira/next-cache-handlers/revalidate`) for revalidating tags over HTTP with a shared token
* `readTagRevalidatedAt` (`@publira/next-cache-handlers/tags`) for values held outside Next.js's caches
* Configuration through the `PNCH_*` environment variables, with keys under `pnch:{app}:`
* Tested against Valkey and Redis
