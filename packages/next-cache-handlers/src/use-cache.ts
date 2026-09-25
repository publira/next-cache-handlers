/**
 * Entry module for Next.js `cacheHandlers` (plural).
 *
 * next.config.ts:
 * ```ts
 * cacheHandlers: {
 *   default: import.meta.resolve("@publira/next-cache-handlers/use-cache"),
 *   remote: import.meta.resolve("@publira/next-cache-handlers/use-cache"),
 * }
 * ```
 *
 * Both `default` (`"use cache"`) and `remote` (`"use cache: remote"`) point at
 * the same Redis-backed handler so multi-instance deployments share one store.
 * `"use cache: private"` is not configurable by Next.js.
 */
import type { UseCacheHandler } from "./use-cache-handler";
import { createUseCacheHandler } from "./use-cache-handler";

/**
 * Next.js loads this module at startup without awaiting it, so a throw would
 * only be logged; exiting is what stops a server whose config was refused.
 */
const createOrExit = (): UseCacheHandler => {
  try {
    return createUseCacheHandler();
  } catch (error) {
    console.error("[next-cache-handlers]", error);
    process.exit(1);
  }
};

const handler = createOrExit();

export default handler;
