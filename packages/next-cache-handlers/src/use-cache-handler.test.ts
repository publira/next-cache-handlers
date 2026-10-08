import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UseCacheEntry } from "./use-cache-handler";

const { store } = vi.hoisted(() => ({
  store: { sets: new Map<string, Set<string>>(), strings: new Map() },
}));

/** Just enough of a Redis client for the `"use cache"` handler. */
const fakeClient = {
  get: (key: string) => Promise.resolve(store.strings.get(key) ?? null),
  mGet: (keys: string[]) =>
    Promise.resolve(keys.map((key) => store.strings.get(key) ?? null)),
  multi: () => {
    const queued: (() => void)[] = [];
    const transaction = {
      exec: () => {
        for (const run of queued) {
          run();
        }
        return Promise.resolve([]);
      },
      sAdd: (key: string, member: string) => {
        queued.push(() => {
          const members = store.sets.get(key) ?? new Set<string>();
          members.add(member);
          store.sets.set(key, members);
        });
        return transaction;
      },
      set: (key: string, value: string) => {
        queued.push(() => store.strings.set(key, value));
        return transaction;
      },
    };
    return transaction;
  },
  sMembers: (key: string) => Promise.resolve([...(store.sets.get(key) ?? [])]),
  set: (key: string, value: string) => {
    store.strings.set(key, value);
    return Promise.resolve("OK");
  },
};

vi.mock("./redis-client", () => ({
  withRedis: <T>(
    _config: unknown,
    _fallback: T,
    run: (client: typeof fakeClient) => Promise<T>
  ) => run(fakeClient),
}));

const { timeOrigin } = performance;
const start = Date.UTC(2026, 9, 8, 12, 0, 0);
const tag = "tenant:t1:pages";

/** Runs this process's performance clock `skewMs` ahead of the wall clock. */
const skewPerformanceClock = (skewMs: number): void => {
  vi.spyOn(performance, "now").mockImplementation(
    () => Date.now() + skewMs - timeOrigin
  );
};

const performanceNow = (): number => timeOrigin + performance.now();

const year = 365 * 24 * 60 * 60;

/**
 * A handler in a process of its own: the offsets the module has seen between
 * the two clocks are per process, so each instance loads it afresh.
 */
const startProcess = async () => {
  vi.resetModules();
  const { createUseCacheHandler } = await import("./use-cache-handler");
  return createUseCacheHandler({ keyPrefix: "pnch:test:" });
};

const entry = (timestamp: number): UseCacheEntry => ({
  expire: 3600,
  revalidate: 900,
  stale: 30,
  tags: [tag],
  timestamp,
  value: new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("body"));
      controller.close();
    },
  }),
});

beforeEach(() => {
  store.sets.clear();
  store.strings.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(start);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("use-cache handler clocks", () => {
  it("reports a fill that started before a revalidation as stale when the performance clock runs ahead", async () => {
    skewPerformanceClock(50);
    const handler = await startProcess();

    // The lookup misses and the fill reads the data, and only then is the tag
    // revalidated: on the performance clock the fill still looks later.
    expect(await handler.get("key", [])).toBeUndefined();
    const fillStartedAt = performanceNow();
    vi.setSystemTime(start + 10);
    await handler.updateTags([tag], { expire: year });
    vi.setSystemTime(start + 20);
    await handler.set("key", Promise.resolve(entry(fillStartedAt)));

    vi.setSystemTime(start + 30);
    const hit = await handler.get("key", []);
    expect(hit?.revalidate).toBe(1);
  });

  it("reports a fill that started after a revalidation as fresh when the performance clock runs behind", async () => {
    skewPerformanceClock(-50);
    const handler = await startProcess();

    await handler.updateTags([tag], { expire: year });
    vi.setSystemTime(start + 10);
    expect(await handler.get("key", [])).toBeUndefined();
    const fillStartedAt = performanceNow();
    vi.setSystemTime(start + 20);
    await handler.set("key", Promise.resolve(entry(fillStartedAt)));

    vi.setSystemTime(start + 30);
    const hit = await handler.get("key", []);
    expect(hit?.revalidate).toBe(900);
  });

  it("reports a fill that started before a revalidation as stale when the wall clock steps forward before it is written", async () => {
    skewPerformanceClock(0);
    const handler = await startProcess();

    expect(await handler.get("key", [])).toBeUndefined();
    const fillStartedAt = performanceNow();
    vi.setSystemTime(start + 10);
    await handler.updateTags([tag], { expire: year });

    // The wall clock jumps a second ahead while the fill is still running.
    vi.restoreAllMocks();
    skewPerformanceClock(-1000);
    vi.setSystemTime(start + 1020);
    await handler.set("key", Promise.resolve(entry(fillStartedAt)));

    vi.setSystemTime(start + 1030);
    const hit = await handler.get("key", []);
    expect(hit?.revalidate).toBe(1);
  });

  it("compares a revalidation from another instance on the wall clock both share", async () => {
    skewPerformanceClock(-50);
    const writer = await startProcess();
    await writer.updateTags([tag], { expire: year });
    vi.setSystemTime(start + 10);
    await writer.set("key", Promise.resolve(entry(performanceNow())));

    vi.restoreAllMocks();
    skewPerformanceClock(50);
    const reader = await startProcess();
    await reader.refreshTags();
    vi.setSystemTime(start + 20);
    const hit = await reader.get("key", []);
    expect(hit?.revalidate).toBe(900);
  });

  it("hands Next.js the entry timestamp and the tag expiration on its performance clock", async () => {
    skewPerformanceClock(50);
    const handler = await startProcess();

    expect(await handler.getExpiration([tag])).toBe(0);

    const fillStartedAt = performanceNow();
    await handler.set("key", Promise.resolve(entry(fillStartedAt)));
    const hit = await handler.get("key", []);
    expect(hit?.timestamp).toBeCloseTo(fillStartedAt);

    // Next.js discards an entry whose timestamp is at or before this, comparing
    // both on its own clock.
    vi.setSystemTime(start + 10);
    await handler.updateTags([tag]);
    expect(await handler.getExpiration([tag])).toBeCloseTo(performanceNow());
  });
});
