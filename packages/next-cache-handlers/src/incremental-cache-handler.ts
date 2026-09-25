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
    const stored = await withRedis(this.config, null, async (client) => {
      const raw = await client.get(valueKey(this.config.keyPrefix, cacheKey));
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
    if (data === null) {
      await withRedis(this.config, undefined, async (client) => {
        await client.del(valueKey(this.config.keyPrefix, cacheKey));
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
    const key = valueKey(this.config.keyPrefix, cacheKey);

    await withRedis(this.config, undefined, async (client) => {
      const multi = client.multi();
      multi.set(key, serializeCachePayload(stored), { EX: ttl });
      for (const tag of tags) {
        multi.sAdd(tagKeysKey(this.config.keyPrefix, tag), cacheKey);
      }
      await multi.exec();
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
