/**
 * Entry module for Next.js `cacheHandler` (singular).
 *
 * next.config.ts:
 * ```ts
 * cacheHandler: import.meta.resolve("@publira/next-cache-handlers/incremental"),
 * images: { customCacheHandler: true },
 * cacheMaxMemorySize: 0,
 * ```
 *
 * Covers ISR / App Router pages, Route Handlers, patched `fetch` /
 * `unstable_cache`, and (with `images.customCacheHandler`) optimized `next/image`
 * results (`kind: "IMAGE"`).
 */
export { RedisIncrementalCacheHandler as default } from "./incremental-cache-handler";
