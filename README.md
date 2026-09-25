# Publira Next Cache Handlers

Redis-backed [`cacheHandler`](https://nextjs.org/docs/app/api-reference/config/next-config-js/incrementalCacheHandlerPath) and [`cacheHandlers`](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandlers) for Next.js, so every instance of a self-hosted, multi-instance deployment shares one server cache.

- **`cacheHandlers` (plural)** backs `"use cache"` and `"use cache: remote"`.
- **`cacheHandler` (singular)** backs ISR, Route Handlers, `fetch` / `unstable_cache`, and `next/image`.

## Installation

```sh
pnpm add @publira/next-cache-handlers
```

## Usage

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  cacheHandler: import.meta.resolve("@publira/next-cache-handlers/incremental"),
  cacheHandlers: {
    default: import.meta.resolve("@publira/next-cache-handlers/use-cache"),
    remote: import.meta.resolve("@publira/next-cache-handlers/use-cache"),
  },
  cacheMaxMemorySize: 0,
};

export default nextConfig;
```

Point it at your server with `PNCH_REDIS_URL` (default `redis://localhost:6379`).

**[Read the full documentation in `packages/next-cache-handlers/README.md`.](packages/next-cache-handlers/README.md)** It covers the environment variables, the revalidation Route Handler, and the behavior when Redis is unavailable.

## Contributing

The repository is a [Turborepo](https://turborepo.com/) monorepo managed with [pnpm](https://pnpm.io/). Open it in the Dev Container, which starts Valkey and Redis alongside it, or run `docker compose up -d` to start them on `localhost:6379` and `localhost:6380`. Then install the dependencies with `pnpm install` and run the workspace commands from the repository root:

| Command          | Description                                         |
| ---------------- | --------------------------------------------------- |
| `pnpm build`     | Build the library and the example app.              |
| `pnpm dev`       | Run the example app in development mode.            |
| `pnpm test`      | Run the unit and integration tests.                 |
| `pnpm test:e2e`  | Run the end-to-end tests against two app instances. |
| `pnpm typecheck` | Run TypeScript type checking across the workspace.  |
| `pnpm check`     | Run the linter and formatter checks.                |
| `pnpm fix`       | Apply the linter and formatter fixes.               |

| Path | Contents |
| --- | --- |
| `packages/next-cache-handlers` | The published `@publira/next-cache-handlers` |
| `apps/example` | A Next.js app wired to the library |
| `e2e` | Playwright end-to-end tests |

See [`AGENTS.md`](AGENTS.md) for the repository conventions, including the Conventional Commits format used for commit messages and pull request titles.

## License

[Apache License 2.0](LICENSE)
