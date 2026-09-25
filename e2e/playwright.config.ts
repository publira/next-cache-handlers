import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

import { instances, REVALIDATE_TOKEN } from "./helpers/instances.ts";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));

// A key prefix of its own keeps each run away from the entries earlier runs
// left in the same Redis. The config is evaluated again in every worker, so
// the value is fixed once in the environment they inherit.
process.env.E2E_CACHE_APP ??= `e2e-${process.pid}`;

const startInstance = (baseURL: string) => ({
  command: `pnpm --filter @publira/next-cache-handlers-example exec next start --hostname 127.0.0.1 --port ${new URL(baseURL).port}`,
  cwd: workspaceRoot,
  env: {
    PNCH_CACHE_APP: process.env.E2E_CACHE_APP ?? "",
    PNCH_REVALIDATE_TOKEN: REVALIDATE_TOKEN,
  },
  // An instance already on the port may use another Redis or key prefix, and
  // the tests would then pass or fail for the wrong reason.
  reuseExistingServer: false,
  url: baseURL,
});

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI === undefined ? "list" : "github",
  retries: process.env.CI === undefined ? 0 : 2,
  testDir: "./tests",
  testMatch: "**/*.e2e.ts",
  webServer: [startInstance(instances.first), startInstance(instances.second)],
});
