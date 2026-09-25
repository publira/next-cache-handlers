export interface CacheHandlerConfig {
  /** Full key prefix, e.g. `pnch:web:` */
  keyPrefix: string;
  /** Redis connection URL. Empty disables Redis. */
  redisUrl: string;
  /** Per-command timeout in milliseconds. */
  timeoutMs: number;
  /** Default TTL (seconds) when an entry has no explicit revalidate/expire. */
  defaultTtlSeconds: number;
  /** Max TTL (seconds) as a safety cap for Redis keys. */
  maxTtlSeconds: number;
}

const DEFAULT_REDIS_URL = "redis://localhost:6379";
const DEFAULT_TIMEOUT_MS = 1000;
// 7 days
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7;
// 1 year
const MAX_TTL_SECONDS = 60 * 60 * 24 * 365;

const isProductionBuildPhase = (): boolean =>
  process.env.NEXT_PHASE === "phase-production-build";

const trimTrailingColon = (value: string): string =>
  value.endsWith(":") ? value.slice(0, -1) : value;

const isRedisDisabled = (value: string): boolean =>
  value === "" || value === "disabled" || value === "off" || value === "false";

/**
 * A `redis://` URL connects without TLS, so a password in it would be sent in
 * cleartext on every connect. A URL that does not parse is left to the Redis
 * client to report.
 */
const assertNoPlaintextPassword = (value: string): void => {
  if (!URL.canParse(value)) {
    return;
  }
  const url = new URL(value);
  if (url.protocol === "redis:" && url.password !== "") {
    throw new Error(
      "PNCH_REDIS_URL carries a password over redis://, which is sent in cleartext; use rediss:// instead"
    );
  }
};

/**
 * Resolve runtime config from environment variables.
 *
 * - `PNCH_REDIS_URL` — Redis connection string (default `redis://localhost:6379`).
 *   Set to empty / `disabled` / `off` / `false` to skip Redis (cache always misses).
 *   A `redis://` URL carrying a password throws: use `rediss://`.
 * - `PNCH_CACHE_KEY_PREFIX` — full key prefix override
 * - `PNCH_CACHE_APP` — app segment in the default prefix (`pnch:{app}:`)
 * - `PNCH_REDIS_CACHE_TIMEOUT_MS` — command timeout (default 1000)
 */
export const resolveCacheHandlerConfig = (
  overrides: Partial<CacheHandlerConfig> = {}
): CacheHandlerConfig => {
  const rawUrl = process.env.PNCH_REDIS_URL;
  let redisUrl = DEFAULT_REDIS_URL;
  if (rawUrl !== undefined) {
    const trimmed = rawUrl.trim();
    redisUrl = isRedisDisabled(trimmed) ? "" : trimmed;
  }

  // Avoid connecting Redis during `next build` (can hang CI / offline builds).
  if (isProductionBuildPhase()) {
    redisUrl = "";
  }

  const explicitPrefix = process.env.PNCH_CACHE_KEY_PREFIX?.trim();
  const app = process.env.PNCH_CACHE_APP?.trim() || "next";
  const keyPrefix = explicitPrefix
    ? `${trimTrailingColon(explicitPrefix)}:`
    : `pnch:${app}:`;

  const timeoutRaw = process.env.PNCH_REDIS_CACHE_TIMEOUT_MS?.trim();
  const timeoutParsed = timeoutRaw ? Number(timeoutRaw) : Number.NaN;
  const timeoutMs =
    Number.isFinite(timeoutParsed) && timeoutParsed > 0
      ? timeoutParsed
      : DEFAULT_TIMEOUT_MS;

  const config = {
    defaultTtlSeconds: DEFAULT_TTL_SECONDS,
    keyPrefix,
    maxTtlSeconds: MAX_TTL_SECONDS,
    redisUrl,
    timeoutMs,
    ...overrides,
  };
  assertNoPlaintextPassword(config.redisUrl);
  return config;
};

export const clampTtlSeconds = (
  seconds: number | undefined,
  config: CacheHandlerConfig
): number => {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return config.defaultTtlSeconds;
  }
  return Math.min(Math.floor(seconds), config.maxTtlSeconds);
};
