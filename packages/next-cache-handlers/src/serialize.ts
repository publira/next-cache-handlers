/**
 * JSON-safe serialization for Next.js cache values that may contain Buffer / Map.
 */

const BUFFER_MARKER = "__pnch_buffer__" as const;
const MAP_MARKER = "__pnch_map__" as const;

interface BufferEnvelope {
  [BUFFER_MARKER]: true;
  data: string;
}

interface MapEnvelope {
  [MAP_MARKER]: true;
  entries: [unknown, unknown][];
}

const isBufferEnvelope = (value: unknown): value is BufferEnvelope =>
  typeof value === "object" &&
  value !== null &&
  BUFFER_MARKER in value &&
  (value as BufferEnvelope)[BUFFER_MARKER] === true &&
  typeof (value as BufferEnvelope).data === "string";

const isMapEnvelope = (value: unknown): value is MapEnvelope =>
  typeof value === "object" &&
  value !== null &&
  MAP_MARKER in value &&
  (value as MapEnvelope)[MAP_MARKER] === true &&
  Array.isArray((value as MapEnvelope).entries);

const encodeValue = (value: unknown): unknown => {
  if (Buffer.isBuffer(value)) {
    const envelope: BufferEnvelope = {
      [BUFFER_MARKER]: true,
      data: value.toString("base64"),
    };
    return envelope;
  }

  if (value instanceof Map) {
    const envelope: MapEnvelope = {
      [MAP_MARKER]: true,
      entries: [...value.entries()].map(([k, v]) => [
        encodeValue(k),
        encodeValue(v),
      ]),
    };
    return envelope;
  }

  if (Array.isArray(value)) {
    return value.map((item) => encodeValue(item));
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = encodeValue(nested);
    }
    return out;
  }

  return value;
};

const decodeValue = (value: unknown): unknown => {
  if (isBufferEnvelope(value)) {
    return Buffer.from(value.data, "base64");
  }

  if (isMapEnvelope(value)) {
    return new Map(
      value.entries.map(([k, v]) => [decodeValue(k), decodeValue(v)])
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => decodeValue(item));
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = decodeValue(nested);
    }
    return out;
  }

  return value;
};

export const serializeCachePayload = (payload: unknown): string =>
  JSON.stringify(encodeValue(payload));

export const deserializeCachePayload = <T>(raw: string): T =>
  decodeValue(JSON.parse(raw)) as T;

/** Buffer a ReadableStream into a single Uint8Array. */
export const streamToBuffer = async (
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array> => {
  const arrayBuffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(arrayBuffer);
};

export const bufferToStream = (
  buffer: Uint8Array
): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(buffer);
      controller.close();
    },
  });
