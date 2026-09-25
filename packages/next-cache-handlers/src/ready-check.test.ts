import { afterEach, describe, expect, it, vi } from "vitest";

import { checkRedisReady } from "./ready-check";

const { mockGetRedisClient, mockWithRedis } = vi.hoisted(() => ({
  mockGetRedisClient: vi.fn(),
  mockWithRedis: vi.fn(),
}));

vi.mock("./redis-client", () => ({
  getRedisClient: mockGetRedisClient,
  withRedis: mockWithRedis,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  mockGetRedisClient.mockReset();
  mockWithRedis.mockReset();
});

describe("checkRedisReady", () => {
  it("no-ops when Redis is disabled", async () => {
    vi.stubEnv("PNCH_REDIS_URL", "disabled");
    await expect(checkRedisReady()).resolves.toBeUndefined();
    expect(mockGetRedisClient).not.toHaveBeenCalled();
  });

  it("succeeds when ping returns PONG", async () => {
    vi.stubEnv("PNCH_REDIS_URL", "redis://localhost:6379");
    mockGetRedisClient.mockResolvedValue({ isReady: true });
    mockWithRedis.mockImplementation((_config, _fallback, run) =>
      run({ ping: () => Promise.resolve("PONG") })
    );
    await expect(checkRedisReady()).resolves.toBeUndefined();
  });

  it("fails when client is not ready", async () => {
    vi.stubEnv("PNCH_REDIS_URL", "redis://localhost:6379");
    mockGetRedisClient.mockResolvedValue(null);
    await expect(checkRedisReady()).rejects.toThrow(/unavailable/u);
  });

  it("fails when ping fails", async () => {
    vi.stubEnv("PNCH_REDIS_URL", "redis://localhost:6379");
    mockGetRedisClient.mockResolvedValue({ isReady: true });
    mockWithRedis.mockResolvedValue(false);
    await expect(checkRedisReady()).rejects.toThrow(/ping failed/u);
  });
});
