import { afterEach, describe, expect, it } from "vitest";

import { clampTtlSeconds, resolveCacheHandlerConfig } from "./config";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("resolveCacheHandlerConfig", () => {
  it("defaults redis url and key prefix", () => {
    delete process.env.PNCH_REDIS_URL;
    delete process.env.PNCH_CACHE_KEY_PREFIX;
    delete process.env.PNCH_CACHE_APP;
    delete process.env.NEXT_PHASE;

    const config = resolveCacheHandlerConfig();
    expect(config.redisUrl).toBe("redis://localhost:6379");
    expect(config.keyPrefix).toBe("pnch:next:");
  });

  it("disables redis for explicit off values", () => {
    process.env.PNCH_REDIS_URL = "disabled";
    expect(resolveCacheHandlerConfig().redisUrl).toBe("");

    process.env.PNCH_REDIS_URL = "off";
    expect(resolveCacheHandlerConfig().redisUrl).toBe("");

    process.env.PNCH_REDIS_URL = "";
    expect(resolveCacheHandlerConfig().redisUrl).toBe("");
  });

  it("disables redis during production build phase", () => {
    process.env.PNCH_REDIS_URL = "redis://example:6379";
    process.env.NEXT_PHASE = "phase-production-build";
    expect(resolveCacheHandlerConfig().redisUrl).toBe("");
  });

  it("refuses a password over redis://", () => {
    delete process.env.NEXT_PHASE;
    for (const url of [
      "redis://user:secret@example:6379",
      "redis://:secret@example:6379",
      "REDIS://:secret@example:6379",
    ]) {
      process.env.PNCH_REDIS_URL = url;
      expect(() => resolveCacheHandlerConfig()).toThrow(
        /PNCH_REDIS_URL.*rediss:\/\//u
      );
    }
  });

  it("refuses a password over redis:// passed as an override", () => {
    process.env.PNCH_REDIS_URL = "disabled";
    expect(() =>
      resolveCacheHandlerConfig({ redisUrl: "redis://:secret@example:6379" })
    ).toThrow(/rediss:\/\//u);
  });

  it("accepts a password over rediss://", () => {
    delete process.env.NEXT_PHASE;
    process.env.PNCH_REDIS_URL = "rediss://user:secret@example:6380";
    expect(resolveCacheHandlerConfig().redisUrl).toBe(
      "rediss://user:secret@example:6380"
    );
  });

  it("accepts redis:// without a password", () => {
    delete process.env.NEXT_PHASE;
    for (const url of [
      "redis://example:6379",
      "redis://user@example:6379",
      "redis://user:@example:6379",
    ]) {
      process.env.PNCH_REDIS_URL = url;
      expect(resolveCacheHandlerConfig().redisUrl).toBe(url);
    }
  });

  it("uses PNCH_CACHE_APP and PNCH_CACHE_KEY_PREFIX", () => {
    delete process.env.NEXT_PHASE;
    process.env.PNCH_CACHE_APP = "web";
    expect(resolveCacheHandlerConfig().keyPrefix).toBe("pnch:web:");

    process.env.PNCH_CACHE_KEY_PREFIX = "custom-prefix";
    expect(resolveCacheHandlerConfig().keyPrefix).toBe("custom-prefix:");
  });
});

describe("clampTtlSeconds", () => {
  const config = resolveCacheHandlerConfig({
    redisUrl: "",
  });

  it("falls back to default and caps at max", () => {
    expect(clampTtlSeconds(undefined, config)).toBe(config.defaultTtlSeconds);
    expect(clampTtlSeconds(0, config)).toBe(config.defaultTtlSeconds);
    expect(clampTtlSeconds(config.maxTtlSeconds + 100, config)).toBe(
      config.maxTtlSeconds
    );
    expect(clampTtlSeconds(120, config)).toBe(120);
  });
});
