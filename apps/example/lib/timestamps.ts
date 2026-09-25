import { cacheLife, cacheTag } from "next/cache";

/** The tag every cached value here carries, so one revalidation refreshes all. */
export const EXAMPLE_TAG = "example";

/**
 * Cached through `cacheHandlers.default`. The page that renders it is
 * prerendered, and the page itself is stored through `cacheHandler`.
 */
// oxlint-disable-next-line require-await -- a "use cache" function must be async.
export const getPageTimestamp = async (): Promise<string> => {
  "use cache";
  cacheLife("hours");
  cacheTag(EXAMPLE_TAG);
  return new Date().toISOString();
};

/** Cached through `cacheHandlers.remote`, and read on every request. */
// oxlint-disable-next-line require-await -- a "use cache" function must be async.
export const getRemoteTimestamp = async (): Promise<string> => {
  "use cache: remote";
  cacheLife("hours");
  cacheTag(EXAMPLE_TAG);
  return new Date().toISOString();
};
