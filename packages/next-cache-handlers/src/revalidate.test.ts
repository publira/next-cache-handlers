import { beforeEach, describe, expect, it, vi } from "vitest";

import { revalidateTags } from "./revalidate";

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));

vi.mock("next/cache", () => ({ revalidateTag }));

const revalidateToken = "test-revalidate-token";

const request = (body: unknown, token = revalidateToken) =>
  new Request("https://app.example/api/v1/revalidate", {
    body: JSON.stringify(body),
    headers: { "x-revalidate-token": token },
    method: "POST",
  });

describe("revalidateTags", () => {
  beforeEach(() => {
    process.env.PNCH_REVALIDATE_TOKEN = revalidateToken;
    revalidateTag.mockReset();
  });

  it("marks the received tags stale", async () => {
    const response = await revalidateTags(
      request({
        tags: ["tenant:tenant-a:site", "tenant:tenant-a:site"],
      })
    );

    expect(response.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith(
      "tenant:tenant-a:site",
      "max"
    );
  });

  it("tags spanning tenants are revalidated as they are", async () => {
    const response = await revalidateTags(
      request({
        tags: ["tenant:tenant-a:site", "tenant:tenant-b:series:list"],
      })
    );

    expect(response.status).toBe(200);
    expect(revalidateTag).toHaveBeenNthCalledWith(
      1,
      "tenant:tenant-a:site",
      "max"
    );
    expect(revalidateTag).toHaveBeenNthCalledWith(
      2,
      "tenant:tenant-b:series:list",
      "max"
    );
  });

  it("requires the shared token", async () => {
    const response = await revalidateTags(
      request({ tags: ["tenant:tenant-a:site"] }, "wrong-token")
    );

    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("authenticates with the given token instead of the environment", async () => {
    const accepted = await revalidateTags(
      request({ tags: ["tenant:tenant-a:site"] }, "given-token"),
      { token: "given-token" }
    );
    const rejected = await revalidateTags(
      request({ tags: ["tenant:tenant-a:site"] }),
      { token: "given-token" }
    );

    expect(accepted.status).toBe(200);
    expect(rejected.status).toBe(401);
    expect(revalidateTag).toHaveBeenCalledOnce();
  });

  it("does not fall back to the environment for a missing given token", async () => {
    const response = await revalidateTags(
      request({ tags: ["tenant:tenant-a:site"] }),
      { token: undefined }
    );

    expect(response.status).toBe(500);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
