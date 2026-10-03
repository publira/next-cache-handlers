# Changelog

## [1.0.1](https://github.com/publira/next-cache-handlers/compare/v1.0.0...v1.0.1) (2026-10-03)


### Bug Fixes

* **deps:** update dependency next to v16.3.7 ([#34](https://github.com/publira/next-cache-handlers/issues/34)) ([8fcdeca](https://github.com/publira/next-cache-handlers/commit/8fcdecaaabbedf039ea0034c55bdc2558ccc56ac))
* **deps:** update dependency next to v16.3.8 ([#42](https://github.com/publira/next-cache-handlers/issues/42)) ([1f1822e](https://github.com/publira/next-cache-handlers/commit/1f1822e129a97a050344fcc477e1e685f1b94aaa))
* **deps:** update dependency redis to v6.3.0 ([#41](https://github.com/publira/next-cache-handlers/issues/41)) ([a59554a](https://github.com/publira/next-cache-handlers/commit/a59554a24fe5cf2032f82db4bd06ecd27cfc63b3))

## 1.0.0 (2026-09-25)

### Features

* Redis-backed `cacheHandler` (`@publira/next-cache-handlers/incremental`) for ISR, Route Handlers, `fetch`, and `next/image`
* Redis-backed `cacheHandlers` (`@publira/next-cache-handlers/use-cache`) for `"use cache"` and `"use cache: remote"`
* `revalidateTags` Route Handler (`@publira/next-cache-handlers/revalidate`) for revalidating tags over HTTP with a shared token
* `readTagRevalidatedAt` (`@publira/next-cache-handlers/tags`) for values held outside Next.js's caches
* Configuration through the `PNCH_*` environment variables, with keys under `pnch:{app}:`
* Tested against Valkey and Redis
