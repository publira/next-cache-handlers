import type { APIRequestContext } from "@playwright/test";

/** The shared secret both instances expect on `POST /api/revalidate`. */
export const REVALIDATE_TOKEN = "e2e-revalidate-token";

/**
 * The two instances of the example app. They share one Redis and one key
 * prefix, which is the multi-instance deployment the library exists for.
 */
export const instances = {
  first: `http://127.0.0.1:${process.env.E2E_FIRST_PORT ?? "3101"}`,
  second: `http://127.0.0.1:${process.env.E2E_SECOND_PORT ?? "3102"}`,
} as const;

const PAGE_TIMESTAMP = /data-timestamp="page" dateTime="(?<timestamp>[^"]+)"/u;

/** Reads the timestamp the prerendered page at `/` was rendered with. */
export const readPageTimestamp = async (
  request: APIRequestContext,
  baseURL: string
): Promise<string> => {
  const response = await request.get(`${baseURL}/`);
  const match = PAGE_TIMESTAMP.exec(await response.text());
  if (!match?.groups?.timestamp) {
    throw new Error(`${baseURL}/ did not render a page timestamp`);
  }
  return match.groups.timestamp;
};

/** Reads the `"use cache: remote"` timestamp from `/api/remote`. */
export const readRemoteTimestamp = async (
  request: APIRequestContext,
  baseURL: string
): Promise<string> => {
  const response = await request.get(`${baseURL}/api/remote`);
  const body = (await response.json()) as { timestamp: string };
  return body.timestamp;
};

/** Revalidates the `example` tag through one instance's Route Handler. */
export const revalidateExampleTag = async (
  request: APIRequestContext,
  baseURL: string
): Promise<void> => {
  const response = await request.post(`${baseURL}/api/revalidate`, {
    data: { tags: ["example"] },
    headers: { "X-Revalidate-Token": REVALIDATE_TOKEN },
  });
  if (!response.ok()) {
    throw new Error(
      `POST ${baseURL}/api/revalidate answered ${response.status()}`
    );
  }
};
