import { revalidateTag } from "next/cache";
import { z } from "zod";

const revalidateRequestSchema = z.strictObject({
  tags: z.array(z.string().trim().min(1).max(256)).min(1),
});

const normalizeTags = (tags: string[]): string[] => {
  const unique = new Set<string>();
  for (const tag of tags) {
    const normalized = tag.trim();
    if (normalized) {
      unique.add(normalized);
    }
  }
  return [...unique];
};

const invalidPayloadResponse = (issues: z.core.$ZodIssue[]) =>
  Response.json(
    {
      error: "invalid payload",
      issues: issues.map((issue) => ({
        message: issue.message,
        path: issue.path.join("."),
      })),
    },
    { status: 400 }
  );

/**
 * Revalidates cache tags from an internal trusted caller.
 *
 * Every web app uses this handler so its isolated `PNCH_CACHE_APP` keyspace
 * receives the same invalidation. The explicit shared token authenticates the
 * machine request; it is not a browser-facing API.
 */
export const revalidateTags = async (request: Request): Promise<Response> => {
  const token = process.env.PNCH_REVALIDATE_TOKEN?.trim();
  if (!token) {
    return Response.json(
      { error: "PNCH_REVALIDATE_TOKEN is not configured" },
      { status: 500 }
    );
  }

  const headerToken = request.headers.get("x-revalidate-token")?.trim();
  if (!headerToken || headerToken !== token) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = revalidateRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return invalidPayloadResponse(parsed.error.issues);
  }

  const tags = normalizeTags(parsed.data.tags);

  for (const tag of tags) {
    revalidateTag(tag, "max");
  }

  return Response.json({ revalidated: tags.length, tags });
};
