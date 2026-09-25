import { expect, test } from "@playwright/test";

import {
  instances,
  readPageTimestamp,
  readRemoteTimestamp,
  revalidateExampleTag,
} from "#helpers/instances";

// Both tests revalidate or read the same shared entries.
test.describe.configure({ mode: "serial" });

test("shares a use cache: remote entry between instances", async ({
  request,
}) => {
  const first = await readRemoteTimestamp(request, instances.first);
  const second = await readRemoteTimestamp(request, instances.second);

  expect(second, "the second instance reads the first one's entry").toBe(first);
});

test("a tag revalidated on one instance refreshes both", async ({
  request,
}) => {
  const pageBefore = await readPageTimestamp(request, instances.first);
  const remoteBefore = await readRemoteTimestamp(request, instances.first);

  await revalidateExampleTag(request, instances.first);

  // Revalidation is stale-while-revalidate, so a read can still return the
  // old value once while the new one is generated.
  await expect
    .poll(async () => {
      const first = await readPageTimestamp(request, instances.first);
      const second = await readPageTimestamp(request, instances.second);
      return first !== pageBefore && first === second;
    }, "the page is regenerated once and served by both instances")
    .toBe(true);

  await expect
    .poll(async () => {
      const first = await readRemoteTimestamp(request, instances.first);
      const second = await readRemoteTimestamp(request, instances.second);
      return first !== remoteBefore && first === second;
    }, "the use cache: remote entry is regenerated once and read by both")
    .toBe(true);
});
