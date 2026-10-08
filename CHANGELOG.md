# Changelog

## [1.0.1](https://github.com/publira/next-cache-handlers/compare/v1.0.0...v1.0.1) (2026-10-08)


### Bug Fixes

* compare use-cache entries and tag revalidations on the wall clock ([#65](https://github.com/publira/next-cache-handlers/issues/65)) ([245853d](https://github.com/publira/next-cache-handlers/commit/245853dccdd746e1a027bc9808484d31b7772291))
* **deps:** update dependency next to v16.3.7 ([#34](https://github.com/publira/next-cache-handlers/issues/34)) ([8fcdeca](https://github.com/publira/next-cache-handlers/commit/8fcdecaaabbedf039ea0034c55bdc2558ccc56ac))
* **deps:** update dependency next to v16.3.8 ([#42](https://github.com/publira/next-cache-handlers/issues/42)) ([1f1822e](https://github.com/publira/next-cache-handlers/commit/1f1822e129a97a050344fcc477e1e685f1b94aaa))
* **deps:** update dependency redis to v6.3.0 ([#41](https://github.com/publira/next-cache-handlers/issues/41)) ([a59554a](https://github.com/publira/next-cache-handlers/commit/a59554a24fe5cf2032f82db4bd06ecd27cfc63b3))
* drop an incremental entry rendered across a revalidation of its tag ([#63](https://github.com/publira/next-cache-handlers/issues/63)) ([895e8ce](https://github.com/publira/next-cache-handlers/commit/895e8ced05b9caa26d0f0f72e365715ee38845c2))

## 1.0.0 (2026-09-25)

### Features

* Redis-backed `cacheHandler` (`@publira/next-cache-handlers/incremental`) for ISR, Route Handlers, `fetch`, and `next/image`
* Redis-backed `cacheHandlers` (`@publira/next-cache-handlers/use-cache`) for `"use cache"` and `"use cache: remote"`
* `revalidateTags` Route Handler (`@publira/next-cache-handlers/revalidate`) for revalidating tags over HTTP with a shared token
* `readTagRevalidatedAt` (`@publira/next-cache-handlers/tags`) for values held outside Next.js's caches
* Configuration through the `PNCH_*` environment variables, with keys under `pnch:{app}:`
* Tested against Valkey and Redis
