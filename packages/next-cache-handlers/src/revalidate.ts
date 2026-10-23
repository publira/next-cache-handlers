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
 * Revalidates cache tags from an internal trusted caller, authenticated by a
 * shared token in the `X-Revalidate-Token` header.
 *
 * With `options`, the token is `options.token` and the environment is never
 * read. Without it, the token is `PNCH_REVALIDATE_TOKEN`.
 *
 * @deprecated Write the Route Handler in the app; see the README. Removed in
 * 2.0, together with the `PNCH_REVALIDATE_TOKEN` fallback.
 */
export const revalidateTags = async (
  request: Request,
  options?: { token: string | undefined }
): Promise<Response> => {
  const token = (
    options ? options.token : process.env.PNCH_REVALIDATE_TOKEN
  )?.trim();
  if (!token) {
    return Response.json(
      {
        error: options
          ? "revalidate token is not configured"
          : "PNCH_REVALIDATE_TOKEN is not configured",
      },
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
