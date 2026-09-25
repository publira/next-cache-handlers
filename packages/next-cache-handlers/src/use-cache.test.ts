import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("use-cache entry", () => {
  it("exits when PNCH_REDIS_URL carries a password over redis://", async () => {
    vi.stubEnv("PNCH_REDIS_URL", "redis://:secret@example:6379");
    vi.stubEnv("NEXT_PHASE", "");
    vi.spyOn(console, "error").mockImplementation(() => {
      // Keep the expected error out of the test output.
    });
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    await expect(import("./use-cache")).rejects.toThrow("process.exit");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("loads when PNCH_REDIS_URL is accepted", async () => {
    vi.stubEnv("PNCH_REDIS_URL", "disabled");
    const exit = vi.spyOn(process, "exit");

    await expect(import("./use-cache")).resolves.toHaveProperty("default");
    expect(exit).not.toHaveBeenCalled();
  });
});
