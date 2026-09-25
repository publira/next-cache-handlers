import { describe, expect, it } from "vitest";

import {
  bufferToStream,
  deserializeCachePayload,
  serializeCachePayload,
  streamToBuffer,
} from "./serialize";

describe("serializeCachePayload", () => {
  it("round-trips Buffer and Map fields used by image / app page cache", () => {
    const original = {
      html: "<html/>",
      kind: "APP_PAGE",
      rscData: Buffer.from("rsc-bytes"),
      segmentData: new Map<string, Buffer>([["/seg", Buffer.from("segment")]]),
      status: 200,
    };

    const raw = serializeCachePayload(original);
    const restored = deserializeCachePayload<typeof original>(raw);

    expect(restored.kind).toBe("APP_PAGE");
    expect(restored.html).toBe("<html/>");
    expect(Buffer.isBuffer(restored.rscData)).toBe(true);
    expect(restored.rscData?.equals(Buffer.from("rsc-bytes"))).toBe(true);
    expect(restored.segmentData).toBeInstanceOf(Map);
    expect(
      restored.segmentData?.get("/seg")?.equals(Buffer.from("segment"))
    ).toBe(true);
  });

  it("round-trips IMAGE buffer entries", () => {
    const original = {
      buffer: Buffer.from([1, 2, 3, 4]),
      etag: "abc",
      extension: "webp",
      kind: "IMAGE",
      revalidate: 60,
      upstreamEtag: "up",
    };

    const restored = deserializeCachePayload<typeof original>(
      serializeCachePayload(original)
    );
    expect(restored.kind).toBe("IMAGE");
    expect(restored.buffer.equals(Buffer.from([1, 2, 3, 4]))).toBe(true);
    expect(restored.etag).toBe("abc");
  });
});

describe("stream helpers", () => {
  it("converts between stream and buffer", async () => {
    const input = new Uint8Array([9, 8, 7]);
    const stream = bufferToStream(input);
    const out = await streamToBuffer(stream);
    expect([...out]).toEqual([9, 8, 7]);
  });
});
