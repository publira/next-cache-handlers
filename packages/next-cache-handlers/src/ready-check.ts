import type { CacheHandlerConfig } from "./config";
import { resolveCacheHandlerConfig } from "./config";
import { getRedisClient, withRedis } from "./redis-client";

/**
 * Readiness check for the shared Redis cache backend.
 * When Redis is disabled (empty / `disabled` / `off` / `false`), this is a no-op success.
 * When configured, requires a successful PING.
 */
export const checkRedisReady = async (
  overrides: Partial<CacheHandlerConfig> = {}
): Promise<void> => {
  const config = resolveCacheHandlerConfig(overrides);
  if (!config.redisUrl) {
    return;
  }

  const client = await getRedisClient(config);
  if (!client?.isReady) {
    throw new Error("redis unavailable");
  }

  const ok = await withRedis(config, false, async (redis) => {
    const pong = await redis.ping();
    return pong === "PONG" || pong === "pong";
  });
  if (!ok) {
    throw new Error("redis ping failed");
  }
};
