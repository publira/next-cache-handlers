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
| `PNCH_REVALIDATE_TOKEN` | **Deprecated**, removed in 2.0. The token `revalidateTags(request)` expects when none is passed |

## Other exports

### `@publira/next-cache-handlers/revalidate` (deprecated)

`revalidateTags` is deprecated and will be removed in 2.0. It is a Route Handler that checks the `X-Revalidate-Token` header and calls `revalidateTag(tag, "max")` for each tag in a `{ "tags": [...] }` body. `revalidateTags(request, { token })` uses the given token; `revalidateTags(request)` falls back to `PNCH_REVALIDATE_TOKEN`, which goes away with the export.

To migrate, write the handler in the app:

```ts
// app/api/revalidate/route.ts
import { revalidateTag } from "next/cache";

export const POST = async (request: Request) => {
  const token = process.env.REVALIDATE_TOKEN;
  if (!token || request.headers.get("x-revalidate-token") !== token) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { tags } = await request.json().catch(() => ({}));
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string")) {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }
  for (const tag of tags) {
    revalidateTag(tag, "max");
  }
  return Response.json({ tags });
};
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
