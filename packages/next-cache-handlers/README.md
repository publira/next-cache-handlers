# @publira/next-cache-handlers

Puts **both** of Next.js's server caches on Redis, so every instance of a self-hosted, multi-instance deployment shares one cache.

| Setting | What it covers | Export |
| --- | --- | --- |
| **`cacheHandlers` (plural)** | `"use cache"` / `"use cache: remote"` | `@publira/next-cache-handlers/use-cache` |
| **`cacheHandler` (singular)** | ISR, Route Handlers, `fetch` / `unstable_cache`, and **`next/image` when it uses the built-in optimizer** | `@publira/next-cache-handlers/incremental` |

Wire both: with only `cacheHandlers`, the ISR family stays local to each instance.

Any server that speaks the Redis protocol works, including [Valkey](https://valkey.io/).

## Requirements

- Next.js 16.3 or later
- A Redis-compatible server

## Installation

```sh
pnpm add @publira/next-cache-handlers
```

## Wiring it in `next.config.ts`

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  cacheHandler: import.meta.resolve("@publira/next-cache-handlers/incremental"),
  cacheHandlers: {
    default: import.meta.resolve("@publira/next-cache-handlers/use-cache"),
    remote: import.meta.resolve("@publira/next-cache-handlers/use-cache"),
  },
  cacheMaxMemorySize: 0,
  // Only for an app that uses the built-in `/_next/image` optimizer.
  images: {
    customCacheHandler: true,
  },
  output: "standalone",
};

export default nextConfig;
```

Give each app its own `PNCH_CACHE_APP` to separate their key spaces when they share one Redis.

## Environment variables

| Variable | Description |
| --- | --- |
| `PNCH_REDIS_URL` | The Redis connection URL (default `redis://localhost:6379`). `disabled` / `off` / `false` / an empty string turns it off (always a miss). A `redis://` URL carrying a password stops the server at startup, because that scheme has no TLS: use `rediss://` |
| `PNCH_CACHE_APP` | The app name in the key prefix (default `next` → `pnch:{app}:`) |
| `PNCH_CACHE_KEY_PREFIX` | Overrides the whole prefix |
| `PNCH_REDIS_CACHE_TIMEOUT_MS` | The command timeout in ms (default `1000`) |
| `PNCH_REVALIDATE_TOKEN` | The shared secret `revalidateTags` expects in the `X-Revalidate-Token` header. Read by the `./revalidate` handler only |

## Other exports

### `@publira/next-cache-handlers/revalidate`

`revalidateTags(request)` is a Route Handler that lets another service revalidate tags over HTTP. It compares the `X-Revalidate-Token` header with `PNCH_REVALIDATE_TOKEN`, reads `{ "tags": [...] }` from the body, and calls `revalidateTag(tag, "max")` on each one, so the request reaches the app's own `PNCH_CACHE_APP` key space.

It answers `500` when the token is not configured, `401` when the header does not match, and `400` for a body that is not that shape. It is a machine-to-machine entry point, not a browser-facing API.

```ts
// app/api/revalidate/route.ts
import { revalidateTags } from "@publira/next-cache-handlers/revalidate";
import type { NextRequest } from "next/server";

export const POST = (request: NextRequest) => revalidateTags(request);
```

### `@publira/next-cache-handlers/tags`

`readTagRevalidatedAt(tag)` returns the moment a tag was last revalidated, as every instance sharing the Redis sees it. It is for a value held outside Next.js's caches — in `proxy.ts`, for example, where none of them run — that `revalidateTag` still has to reach.

### `@publira/next-cache-handlers`

The root entry exports the building blocks behind the handlers (`createUseCacheHandler`, `RedisIncrementalCacheHandler`, `resolveCacheHandlerConfig`, `checkRedisReady`, …) for an app that needs to compose its own.

## Behavior on failure

Redis being down, disabled, or timing out is a miss on get and a no-op on set, so the app keeps running. A shared Redis is still required for a multi-instance production deployment: without it, each instance renders on its own.

## Choosing a `"use cache"` directive

| Directive | Handler | What it is for |
| --- | --- | --- |
| `"use cache"` | `cacheHandlers.default` | The ordinary shared data cache (Redis, with the configuration above) |
| `"use cache: remote"` | `cacheHandlers.remote` | The same Redis as `default` in the configuration above |
| `"use cache: private"` | Not configurable | Request-specific; no handler applies |

To raise the multi-instance hit rate for public data, prefer `"use cache: remote"`.

## References

- [`cacheHandler` (singular)](https://nextjs.org/docs/app/api-reference/config/next-config-js/incrementalCacheHandlerPath)
- [`cacheHandlers` (plural)](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandlers)

## License

[Apache License 2.0](https://github.com/publira/next-cache-handlers/blob/main/LICENSE)
