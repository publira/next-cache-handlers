import { setTimeout as delay } from "node:timers/promises";

import { createClient } from "redis";
import type { RedisClientType } from "redis";

import type { CacheHandlerConfig } from "./config";

type RedisClient = RedisClientType;

const clients = new Map<string, Promise<RedisClient | null>>();
let warnedUnavailable = false;

const debug = (...args: unknown[]): void => {
  if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
    console.debug("[next-cache-handlers]", ...args);
  }
};

const warnOnceUnavailable = (reason: unknown): void => {
  if (warnedUnavailable) {
    return;
  }
  warnedUnavailable = true;
  console.warn(
    "[@publira/next-cache-handlers] Redis unavailable; cache will miss until connected.",
    reason instanceof Error ? reason.message : reason
  );
};

/**
 * Shared lazy Redis client. Returns null when Redis is disabled or unreachable.
 * Callers must treat null as "no shared cache" and fall through (miss / no-op set).
 */
export const getRedisClient = (
  config: CacheHandlerConfig
): Promise<RedisClient | null> => {
  if (!config.redisUrl) {
    return Promise.resolve(null);
  }

  const existing = clients.get(config.redisUrl);
  if (existing) {
    return existing;
  }

  const promise = (async (): Promise<RedisClient | null> => {
    try {
      const client = createClient({
        socket: {
          connectTimeout: config.timeoutMs,
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              return new Error("Redis reconnect limit exceeded");
            }
            return Math.min(retries * 100, 2000);
          },
        },
        url: config.redisUrl,
      }) as RedisClient;

      client.on("error", (error) => {
        debug("redis error", error);
      });

      await client.connect();
      debug("redis connected", config.redisUrl);
      return client;
    } catch (error) {
      warnOnceUnavailable(error);
      clients.delete(config.redisUrl);
      return null;
    }
  })();

  clients.set(config.redisUrl, promise);
  return promise;
};

/** Run a Redis command with a timeout; returns `fallback` on failure/timeout. */
export const withRedis = async <T>(
  config: CacheHandlerConfig,
  fallback: T,
  run: (client: RedisClient) => Promise<T>
): Promise<T> => {
  const client = await getRedisClient(config);
  if (!client?.isReady) {
    return fallback;
  }

  try {
    return await Promise.race([
      run(client),
      (async () => {
        await delay(config.timeoutMs);
        throw new Error(`Redis command timed out after ${config.timeoutMs}ms`);
      })(),
    ]);
  } catch (error) {
    debug("redis command failed", error);
    return fallback;
  }
};

/** Test helper: drop cached client promises. */
export const resetRedisClientsForTests = (): void => {
  clients.clear();
  warnedUnavailable = false;
};
