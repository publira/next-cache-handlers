import { clampTtlSeconds, resolveCacheHandlerConfig } from "./config";
import type { CacheHandlerConfig } from "./config";
import { withRedis } from "./redis-client";
import { deserializeCachePayload, serializeCachePayload } from "./serialize";

/**
 * Minimal types for Next.js singular `cacheHandler` (ISR / fetch / image).
 * Kept loose so we do not pin to Next private module paths at compile time.
 */
export interface IncrementalCacheHandlerContext {
  fs?: unknown;
  dev?: boolean;
  flushToDisk?: boolean;
  serverDistDir?: string;
  maxMemoryCacheSize?: number;
  fetchCacheKeyPrefix?: string;
  prerenderManifest?: unknown;
  revalidatedTags: string[];
  _requestHeaders: Record<string, undefined | string | string[]>;
}

export interface IncrementalCacheHandlerValue {
  lastModified: number;
  age?: number;
  cacheState?: string;
  value: unknown;
  tags?: string[];
}

export interface IncrementalSetContext {
  tags?: string[];
  fetchCache?: boolean;
  cacheControl?: {
    revalidate?: number | false;
    expire?: number;
  };
  isFallback?: boolean;
  isRoutePPREnabled?: boolean;
  fetchUrl?: string;
  fetchIdx?: number;
  isImplicitBuildTimeCache?: boolean;
}

const CACHE_TAGS_HEADER = "x-next-cache-tags";

interface StoredIncrementalEntry {
  lastModified: number;
  tags: string[];
  value: unknown;
}

const valueKey = (prefix: string, key: string): string =>
  `${prefix}inc:v:${key}`;

const tagTimestampKey = (prefix: string, tag: string): string =>
  `${prefix}inc:tag:${tag}`;

const tagKeysKey = (prefix: string, tag: string): string =>
  `${prefix}inc:tagkeys:${tag}`;

/**
 * KEYS[1..n] = tag timestamp keys, KEYS[n+1..2n] = tag key-set keys.
 * ARGV[1] = revalidation timestamp, ARGV[2] = value-key prefix (`inc:v:`).
 *
 * One EVAL so a concurrent `set` (SET + SADD in MULTI) is ordered wholly
 * before or wholly after this revalidation. Split across round trips, a set
 * that landed in between would write an entry the later DEL then removed, or
 * lose its SADD when the tag key set itself was deleted.
 */
const REVALIDATE_TAG_SCRIPT = `
local n = math.floor(#KEYS / 2)
local revalidated_at = ARGV[1]
local value_prefix = ARGV[2]
for i = 1, n do
  local ts_key = KEYS[i]
  local set_key = KEYS[n + i]
  redis.call('SET', ts_key, revalidated_at)
  local members = redis.call('SMEMBERS', set_key)
  for _, member in ipairs(members) do
    redis.call('DEL', value_prefix .. member)
  end
  redis.call('DEL', set_key)
end
return n
`;

/**
 * KEYS[1] = value key, KEYS[2..n+1] = tag timestamp keys, KEYS[n+2..2n+1] =
 * tag key-set keys. ARGV[1] = when the key was looked up (empty when no lookup
 * was seen), ARGV[2] = payload, ARGV[3] = TTL in seconds, ARGV[4] = cache key.
 *
 * Writes nothing and answers 0 when one of the tags was revalidated at or
 * after the lookup. Checked in the same EVAL as the write, so a revalidation
 * either lands before the check and stops the write, or after the SADD and
 * deletes what was written.
 */
const SET_SCRIPT = `
local n = math.floor((#KEYS - 1) / 2)
local looked_up_at = tonumber(ARGV[1])
if looked_up_at then
  for i = 1, n do
    local revalidated_at = tonumber(redis.call('GET', KEYS[1 + i]))
    if revalidated_at and revalidated_at >= looked_up_at then
      return 0
    end
  end
end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
for i = 1, n do
  redis.call('SADD', KEYS[1 + n + i], ARGV[4])
end
return 1
`;

/**
 * When each value key was first looked up since it was last written, in ms.
 *
 * Next.js regenerates a page or a route only after `get` has answered for its
 * key, and a value written by `set` is what that render read from the data
 * sources by then. A render that began before `revalidateTag` and finishes
 * after it would otherwise be written once the revalidation has already
 * deleted every member of the tag, carrying a `lastModified` later than the
 * revalidation, and be served as fresh until its own revalidate period runs
 * out. The lookup is the latest moment the render can have started, so it is
 * what `set` compares the tags against.
 *
 * Module scope, because Next.js constructs a handler for every request while
 * the render it starts may write through another one. A key with no recorded
 * lookup is written the way it always was.
 */
const lookedUpAt = new Map<string, number>();

/** Enough for every page a process renders at once; the oldest goes first. */
const MAX_TRACKED_LOOKUPS = 10_000;

const recordLookup = (key: string, now: number): void => {
  if (lookedUpAt.has(key)) {
    return;
  }
  if (lookedUpAt.size >= MAX_TRACKED_LOOKUPS) {
    const oldest = lookedUpAt.keys().next();
    if (!oldest.done) {
      lookedUpAt.delete(oldest.value);
    }
  }
  lookedUpAt.set(key, now);
};

const takeLookup = (key: string): number | undefined => {
  const at = lookedUpAt.get(key);
  lookedUpAt.delete(key);
  return at;
};

const extractTagsFromValue = (
  data: unknown,
  ctx: IncrementalSetContext
): string[] => {
  const tags = new Set<string>();

  if (ctx.tags) {
    for (const tag of ctx.tags) {
      if (tag) {
        tags.add(tag);
      }
    }
  }

  if (data && typeof data === "object" && "tags" in data) {
    const { tags: dataTags } = data as { tags?: string[] };
    if (Array.isArray(dataTags)) {
      for (const tag of dataTags) {
        if (tag) {
          tags.add(tag);
        }
      }
    }
  }

  if (data && typeof data === "object" && "headers" in data) {
    const { headers } = data as { headers?: Record<string, unknown> };
    const headerVal =
      headers?.[CACHE_TAGS_HEADER] ?? headers?.["X-Next-Cache-Tags"];
    if (typeof headerVal === "string" && headerVal.length > 0) {
      for (const tag of headerVal.split(",")) {
        const trimmed = tag.trim();
        if (trimmed) {
          tags.add(trimmed);
        }
      }
    }
  }

  return [...tags];
};

const resolveTtlSeconds = (
  data: unknown,
  ctx: IncrementalSetContext,
  config: CacheHandlerConfig
): number => {
  if (
    data &&
    typeof data === "object" &&
    "kind" in data &&
    (data as { kind?: string }).kind === "IMAGE" &&
    "revalidate" in data &&
    typeof (data as { revalidate?: number }).revalidate === "number"
  ) {
    return clampTtlSeconds((data as { revalidate: number }).revalidate, config);
  }

  const revalidate = ctx.cacheControl?.revalidate;
  if (typeof revalidate === "number" && revalidate > 0) {
    return clampTtlSeconds(revalidate, config);
  }

  if (
    data &&
    typeof data === "object" &&
    "revalidate" in data &&
    typeof (data as { revalidate?: number }).revalidate === "number"
  ) {
    return clampTtlSeconds((data as { revalidate: number }).revalidate, config);
  }

  return config.defaultTtlSeconds;
};

const areTagsExpired = (
  tags: string[],
  lastModified: number,
  tagTimestamps: Map<string, number>
): boolean => {
  for (const tag of tags) {
    const expiredAt = tagTimestamps.get(tag);
    if (expiredAt !== undefined && expiredAt > lastModified) {
      return true;
    }
  }
  return false;
};

const applyTagTimestamps = (
  tags: string[],
  values: (string | null)[],
  target: Map<string, number>
): void => {
  for (const [index, tag] of tags.entries()) {
    const raw = values[index];
    if (raw === null || raw === undefined) {
      continue;
    }
    const ts = Number(raw);
    if (Number.isFinite(ts)) {
      target.set(tag, ts);
    }
  }
};

/**
 * Next.js expects a **class** default export for `cacheHandler` (singular).
 * Instances share Redis via the module-level client pool.
 */
export class RedisIncrementalCacheHandler {
  private readonly config: CacheHandlerConfig;
  private readonly revalidatedTags: Set<string>;
  /** Per-request tag timestamp mirror; refreshed in revalidateTag / get as needed. */
  private readonly localTagTimestamps = new Map<string, number>();

  constructor(
    ctx: IncrementalCacheHandlerContext,
    configOverrides: Partial<CacheHandlerConfig> = {}
  ) {
    this.config = resolveCacheHandlerConfig(configOverrides);
    this.revalidatedTags = ctx.revalidatedTags
      ? new Set(ctx.revalidatedTags)
      : new Set();
  }

  resetRequestCache(): void {
    // No durable per-request memory tier; drop local tag mirror for the next request.
    this.localTagTimestamps.clear();
  }

  async get(
    cacheKey: string,
    ctx?: { kind?: string; tags?: string[]; softTags?: string[] }
  ): Promise<IncrementalCacheHandlerValue | null> {
    const key = valueKey(this.config.keyPrefix, cacheKey);
    recordLookup(key, Date.now());

    const stored = await withRedis(this.config, null, async (client) => {
      const raw = await client.get(key);
      if (!raw) {
        return null;
      }
      return deserializeCachePayload<StoredIncrementalEntry>(raw);
    });

    if (!stored) {
      return null;
    }

    const combined = [
      ...new Set([
        ...(stored.tags ?? []),
        ...(ctx?.softTags ?? []),
        ...(ctx?.tags ?? []),
      ]),
    ];

    if (combined.some((tag) => this.revalidatedTags.has(tag))) {
      return null;
    }

    const missing = combined.filter((tag) => !this.localTagTimestamps.has(tag));
    if (missing.length > 0) {
      await this.hydrateTagTimestamps(missing);
    }

    if (
      areTagsExpired(combined, stored.lastModified, this.localTagTimestamps)
    ) {
      return null;
    }

    return {
      lastModified: stored.lastModified,
      tags: stored.tags,
      value: stored.value,
    };
  }

  async set(
    cacheKey: string,
    data: unknown | null,
    ctx: IncrementalSetContext = {}
  ): Promise<void> {
    const key = valueKey(this.config.keyPrefix, cacheKey);
    const lookupAt = takeLookup(key);

    if (data === null) {
      await withRedis(this.config, undefined, async (client) => {
        await client.del(key);
      });
      return;
    }

    const tags = extractTagsFromValue(data, ctx);
    const lastModified = Date.now();
    const stored: StoredIncrementalEntry = {
      lastModified,
      tags,
      value: data,
    };
    const ttl = resolveTtlSeconds(data, ctx, this.config);

    await withRedis(this.config, undefined, async (client) => {
      await client.eval(SET_SCRIPT, {
        arguments: [
          lookupAt === undefined ? "" : String(lookupAt),
          serializeCachePayload(stored),
          String(ttl),
          cacheKey,
        ],
        keys: [
          key,
          ...tags.map((tag) => tagTimestampKey(this.config.keyPrefix, tag)),
          ...tags.map((tag) => tagKeysKey(this.config.keyPrefix, tag)),
        ],
      });
    });
  }

  async revalidateTag(
    tags: string | string[],
    /** The serve-stale window Next.js offers; see `revalidatedAt` below. */
    _durations?: { expire?: number }
  ): Promise<void> {
    const list = (Array.isArray(tags) ? tags : [tags]).filter(Boolean);
    if (list.length === 0) {
      return;
    }

    // The moment of the revalidation, never the end of the profile's
    // serve-stale window: every entry the tag names is deleted below, so there
    // is nothing left to serve stale, and a timestamp in the future would
    // instead invalidate the entries written to replace them.
    const revalidatedAt = Date.now();

    for (const tag of list) {
      this.localTagTimestamps.set(tag, revalidatedAt);
    }

    await withRedis(this.config, undefined, async (client) => {
      await client.eval(REVALIDATE_TAG_SCRIPT, {
        arguments: [String(revalidatedAt), valueKey(this.config.keyPrefix, "")],
        keys: [
          ...list.map((tag) => tagTimestampKey(this.config.keyPrefix, tag)),
          ...list.map((tag) => tagKeysKey(this.config.keyPrefix, tag)),
        ],
      });
    });
  }

  private async hydrateTagTimestamps(tags: string[]): Promise<void> {
    await withRedis(this.config, undefined, async (client) => {
      const keys = tags.map((tag) =>
        tagTimestampKey(this.config.keyPrefix, tag)
      );
      const values = await client.mGet(keys);
      applyTagTimestamps(tags, values, this.localTagTimestamps);
    });
  }
}
