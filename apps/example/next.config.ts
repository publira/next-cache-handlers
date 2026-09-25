import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Singular: ISR, Route Handlers, `fetch` / `unstable_cache`, and `next/image`.
  cacheHandler: import.meta.resolve("@publira/next-cache-handlers/incremental"),
  // Plural: "use cache" / "use cache: remote", backed by the same Redis.
  cacheHandlers: {
    default: import.meta.resolve("@publira/next-cache-handlers/use-cache"),
    remote: import.meta.resolve("@publira/next-cache-handlers/use-cache"),
  },
  // Prefer Redis over the default in-process memory tier.
  cacheMaxMemorySize: 0,
  images: {
    customCacheHandler: true,
  },
};

export default nextConfig;
