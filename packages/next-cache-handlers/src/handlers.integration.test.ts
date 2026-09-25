import { createClient } from "redis";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { RedisIncrementalCacheHandler } from "./incremental-cache-handler";
import { getRedisClient, resetRedisClientsForTests } from "./redis-client";
import { streamToBuffer } from "./serialize";
import {
  createUseCacheHandler,
  readTagRevalidatedAt,
} from "./use-cache-handler";

const configuredRedisUrl = process.env.PNCH_REDIS_URL?.trim();
const redisUrl = configuredRedisUrl || "redis://localhost:6379";
const keyPrefix = `pnch:test-${process.pid}:`;

const imageData = (etag: string) => ({
  buffer: Buffer.from([0xff, 0xd8, 0xff]),
  etag,
  extension: "jpg",
  kind: "IMAGE",
  revalidate: 120,
  upstreamEtag: `u-${etag}`,
});

const canConnect = async (): Promise<boolean> => {
  resetRedisClientsForTests();
  process.env.PNCH_REDIS_URL = redisUrl;
  delete process.env.NEXT_PHASE;
  const client = await getRedisClient({
    defaultTtlSeconds: 60,
    keyPrefix,
    maxTtlSeconds: 3600,
    redisUrl,
    timeoutMs: 1000,
  });
  return Boolean(client?.isReady);
};

describe("Redis handlers integration", () => {
  let available = false;

  beforeAll(async () => {
    available = await canConnect();
    // Skip only when Redis was never configured (a host without the
    // service). A configured URL or CI means these cases are expected to run.
    if (
      !available &&
      (Boolean(configuredRedisUrl) || Boolean(process.env.CI))
    ) {
      throw new Error(
        `Redis handlers integration tests could not reach ${redisUrl}`
      );
    }
  });

  afterAll(async () => {
    if (!available) {
      return;
    }
    const client = await getRedisClient({
      defaultTtlSeconds: 60,
      keyPrefix,
      maxTtlSeconds: 3600,
      redisUrl,
      timeoutMs: 1000,
    });
    if (!client) {
      return;
    }
    const keys = await client.keys(`${keyPrefix}*`);
    if (keys.length > 0) {
      await client.del(keys);
    }
    resetRedisClientsForTests();
  });

  it("use-cache handler set/get and tag invalidation", async ({ skip }) => {
    if (!available) {
      skip();
    }

    const handler = createUseCacheHandler({ keyPrefix, redisUrl });
    const cacheKey = "uc-key-1";
    const payload = new TextEncoder().encode("hello-cache");

    await handler.set(
      cacheKey,
      Promise.resolve({
        expire: 3600,
        revalidate: 60,
        stale: 30,
        tags: ["tenant:t1:pages"],
        timestamp: Date.now(),
        value: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(payload);
            controller.close();
          },
        }),
      })
    );

    const hit = await handler.get(cacheKey, []);
    expect(hit).toBeDefined();
    if (!hit) {
      throw new Error("expected cache hit");
    }
    const body = await streamToBuffer(hit.value);
    expect(new TextDecoder().decode(body)).toBe("hello-cache");

    await handler.updateTags(["tenant:t1:pages"]);
    await handler.refreshTags();
    const missed = await handler.get(cacheKey, []);
    expect(missed).toBeUndefined();
  });

  it("reports when another handler instance revalidated a tag", async ({
    skip,
  }) => {
    if (!available) {
      skip();
    }

    const tag = "tenant:t-read:pages";
    expect(await readTagRevalidatedAt(tag, { keyPrefix, redisUrl })).toBe(0);

    const before = Date.now();
    await createUseCacheHandler({ keyPrefix, redisUrl }).updateTags([tag], {
      expire: 3600,
    });

    const revalidatedAt = await readTagRevalidatedAt(tag, {
      keyPrefix,
      redisUrl,
    });
    expect(revalidatedAt).toBeGreaterThanOrEqual(before);
  });

  it("reports an unreadable tag when Redis is disabled", async () => {
    expect(
      await readTagRevalidatedAt("tenant:t-read:pages", {
        keyPrefix,
        redisUrl: "",
      })
    ).toBeUndefined();
  });

  it("use-cache handler serves a revalidated tag within its serve-stale window", async ({
    skip,
  }) => {
    if (!available) {
      skip();
    }

    const handler = createUseCacheHandler({ keyPrefix, redisUrl });
    const tag = "tenant:t1:window";
    const write = async (
      cacheKey: string,
      body: string,
      timestamp: number
    ): Promise<void> => {
      await handler.set(
        cacheKey,
        Promise.resolve({
          expire: 3600,
          revalidate: 60,
          stale: 30,
          tags: [tag],
          timestamp,
          value: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(body));
              controller.close();
            },
          }),
        })
      );
    };

    // Written far enough back that the revalidation below is unambiguously
    // later, while staying inside the entry's own 60s revalidate window.
    await write("uc-window-before", "before", Date.now() - 5000);
    // A year, the window `revalidateTag(tag, "max")` asks Next.js for.
    await handler.updateTags([tag], { expire: 365 * 24 * 60 * 60 });
    await handler.refreshTags();

    // The older value is still served, and asks to be revalidated with the
    // lowest second: the number reaches Next.js as the route's
    // `cacheControl.revalidate`, which answers anything under one with a 500.
    const stale = await handler.get("uc-window-before", []);
    expect(stale).toBeDefined();
    if (!stale) {
      throw new Error("expected the previous value to still be served");
    }
    expect(stale.revalidate).toBe(1);
    expect(new TextDecoder().decode(await streamToBuffer(stale.value))).toBe(
      "before"
    );

    // The value written to replace it is not caught by the same window.
    await write("uc-window-after", "after", Date.now());
    const fresh = await handler.get("uc-window-after", []);
    expect(fresh).toBeDefined();
    if (!fresh) {
      throw new Error("expected the replacement value to be cached");
    }
    expect(fresh.revalidate).toBe(60);
    expect(new TextDecoder().decode(await streamToBuffer(fresh.value))).toBe(
      "after"
    );
  });

  it("use-cache handler keeps a value written while the stale-serving window was open", async ({
    skip,
  }) => {
    if (!available) {
      skip();
    }

    const handler = createUseCacheHandler({ keyPrefix, redisUrl });
    const tag = "tenant:t1:closed-window";
    const windowSeconds = 60;
    const revalidatedAt = Date.now();

    await handler.updateTags([tag], { expire: windowSeconds });

    // Written after the revalidation, while its window was still open.
    await handler.set(
      "uc-closed-window",
      Promise.resolve({
        expire: 7200,
        revalidate: 3600,
        stale: 30,
        tags: [tag],
        timestamp: revalidatedAt + 1000,
        value: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("during"));
            controller.close();
          },
        }),
      })
    );

    // Only the clock moves; the Redis client keeps its real timers.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(revalidatedAt + (windowSeconds + 10) * 1000);
      const hit = await handler.get("uc-closed-window", []);
      expect(hit).toBeDefined();
      if (!hit) {
        throw new Error("expected the value to outlive the closed window");
      }
      expect(hit.revalidate).toBe(3600);
      expect(new TextDecoder().decode(await streamToBuffer(hit.value))).toBe(
        "during"
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("incremental handler keeps caching a tag after it is revalidated", async ({
    skip,
  }) => {
    if (!available) {
      skip();
    }

    const handler = new RedisIncrementalCacheHandler(
      { _requestHeaders: {}, revalidatedTags: [] },
      { keyPrefix, redisUrl }
    );
    const tag = "tenant:t1:image-window";

    await handler.revalidateTag(tag, { expire: 365 * 24 * 60 * 60 });
    handler.resetRequestCache();

    await handler.set(
      "img-window",
      {
        buffer: Buffer.from([0xff, 0xd8, 0xff]),
        etag: "e2",
        extension: "jpg",
        kind: "IMAGE",
        revalidate: 120,
        upstreamEtag: "u2",
      },
      { tags: [tag] }
    );

    const hit = await handler.get("img-window", { kind: "IMAGE" });
    expect(hit).not.toBeNull();
  });

  it("incremental handler set/get IMAGE and revalidateTag", async ({
    skip,
  }) => {
    if (!available) {
      skip();
    }

    const handler = new RedisIncrementalCacheHandler(
      { _requestHeaders: {}, revalidatedTags: [] },
      { keyPrefix, redisUrl }
    );

    const key = "img-key-1";
    await handler.set(
      key,
      {
        buffer: Buffer.from([0xff, 0xd8, 0xff]),
        etag: "e1",
        extension: "jpg",
        kind: "IMAGE",
        revalidate: 120,
        upstreamEtag: "u1",
      },
      { tags: ["tenant:t1:image"] }
    );

    const hit = await handler.get(key, { kind: "IMAGE" });
    expect(hit).not.toBeNull();
    if (!hit) {
      throw new Error("expected image cache hit");
    }
    const value = hit.value as {
      buffer: Buffer;
      etag: string;
      kind: string;
    };
    expect(value.kind).toBe("IMAGE");
    expect(Buffer.isBuffer(value.buffer)).toBe(true);
    expect(value.buffer.equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true);
    expect(value.etag).toBe("e1");

    await handler.revalidateTag("tenant:t1:image");
    const missed = await handler.get(key, { kind: "IMAGE" });
    expect(missed).toBeNull();
  });

  it("incremental handler indexes a value written after revalidateTag", async ({
    skip,
  }) => {
    if (!available) {
      skip();
    }

    const handler = new RedisIncrementalCacheHandler(
      { _requestHeaders: {}, revalidatedTags: [] },
      { keyPrefix, redisUrl }
    );
    const tag = "tenant:t1:image-index";
    const cacheKey = "img-index-after";

    await handler.revalidateTag(tag);
    handler.resetRequestCache();
    await handler.set(
      cacheKey,
      {
        buffer: Buffer.from([0xff, 0xd8, 0xff]),
        etag: "e-after",
        extension: "jpg",
        kind: "IMAGE",
        revalidate: 120,
        upstreamEtag: "u-after",
      },
      { tags: [tag] }
    );

    const hit = await handler.get(cacheKey, { kind: "IMAGE" });
    expect(hit).not.toBeNull();

    const client = await getRedisClient({
      defaultTtlSeconds: 60,
      keyPrefix,
      maxTtlSeconds: 3600,
      redisUrl,
      timeoutMs: 1000,
    });
    if (!client) {
      throw new Error("expected a Redis client");
    }
    const members = await client.sMembers(`${keyPrefix}inc:tagkeys:${tag}`);
    expect(members).toContain(cacheKey);
  });

  it("EVAL keeps a set that split round trips drop from the tag key set", async ({
    onTestFinished,
    skip,
  }) => {
    if (!available) {
      skip();
    }

    // A second TCP connection, like another Next.js instance. The handler
    // uses the pooled client; this one drives the split revalidation steps.
    const control = createClient({ url: redisUrl });
    await control.connect();
    onTestFinished(async () => {
      if (control.isOpen) {
        await control.quit();
      }
    });

    const splitHandler = new RedisIncrementalCacheHandler(
      { _requestHeaders: {}, revalidatedTags: [] },
      { keyPrefix, redisUrl }
    );
    const splitTag = "tenant:t1:image-split-gap";
    const splitOldKey = "img-split-old";
    const splitNewKey = "img-split-new";
    const splitTagKeys = `${keyPrefix}inc:tagkeys:${splitTag}`;

    await splitHandler.set(splitOldKey, imageData("split-old"), {
      tags: [splitTag],
    });

    // Previous revalidateTag: SET timestamp, SMEMBERS, then DEL. A set from
    // the other connection lands in that gap and its SADD is wiped with the
    // key set.
    await control.set(`${keyPrefix}inc:tag:${splitTag}`, String(Date.now()));
    const membersBeforeSet = await control.sMembers(splitTagKeys);
    await splitHandler.set(splitNewKey, imageData("split-new"), {
      tags: [splitTag],
    });
    const staleValueKeys = membersBeforeSet.map(
      (member) => `${keyPrefix}inc:v:${member}`
    );
    if (staleValueKeys.length > 0) {
      await control.del(staleValueKeys);
    }
    await control.del(splitTagKeys);

    expect(
      await control.get(`${keyPrefix}inc:v:${splitNewKey}`)
    ).not.toBeNull();
    expect(await control.sMembers(splitTagKeys)).not.toContain(splitNewKey);

    const evalHandler = new RedisIncrementalCacheHandler(
      { _requestHeaders: {}, revalidatedTags: [] },
      { keyPrefix, redisUrl }
    );
    const evalTag = "tenant:t1:image-eval-after";
    const evalOldKey = "img-eval-old";
    const evalNewKey = "img-eval-new";
    const evalTagKeys = `${keyPrefix}inc:tagkeys:${evalTag}`;

    await evalHandler.set(evalOldKey, imageData("eval-old"), {
      tags: [evalTag],
    });
    await evalHandler.revalidateTag(evalTag);
    evalHandler.resetRequestCache();
    // Same interleaving, now closed: a set issued after the script returns
    // stays indexed, because Redis cannot run it between SMEMBERS and DEL.
    await evalHandler.set(evalNewKey, imageData("eval-new"), {
      tags: [evalTag],
    });

    expect(await evalHandler.get(evalOldKey, { kind: "IMAGE" })).toBeNull();
    expect(await evalHandler.get(evalNewKey, { kind: "IMAGE" })).not.toBeNull();
    expect(await control.sMembers(evalTagKeys)).toContain(evalNewKey);
  });
});
