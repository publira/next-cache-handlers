# Changelog

## [1.1.0](https://github.com/publira/next-cache-handlers/compare/v1.0.3...v1.1.0) (2026-10-23)


### Features

* deprecate revalidateTags and accept its token as an argument ([#146](https://github.com/publira/next-cache-handlers/issues/146)) ([65de37a](https://github.com/publira/next-cache-handlers/commit/65de37ad18e76b64524db940c06e0ed588e36249))


### Bug Fixes

* keep Redis off during next build when redisUrl is an override ([#148](https://github.com/publira/next-cache-handlers/issues/148)) ([3cebf60](https://github.com/publira/next-cache-handlers/commit/3cebf6022e7ccf3a409f6242a6e2cbda349d2926))

## [1.0.3](https://github.com/publira/next-cache-handlers/compare/v1.0.2...v1.0.3) (2026-10-22)


### Bug Fixes

* **deps:** update dependency next to v16.4.0 ([#77](https://github.com/publira/next-cache-handlers/issues/77)) ([323bcc5](https://github.com/publira/next-cache-handlers/commit/323bcc500feda3dd1920ef050f21528b0a39a07a))
* **deps:** update dependency next to v16.4.1 ([#117](https://github.com/publira/next-cache-handlers/issues/117)) ([5444f08](https://github.com/publira/next-cache-handlers/commit/5444f081b8eab22a539d4bd005ffdc31b7ebab9f))
* **deps:** update dependency next to v16.4.2 ([#124](https://github.com/publira/next-cache-handlers/issues/124)) ([ed0d8d9](https://github.com/publira/next-cache-handlers/commit/ed0d8d9db749e1161d45c5e92855ad55181e642f))
* **deps:** update dependency zod to v4.6.6 ([#101](https://github.com/publira/next-cache-handlers/issues/101)) ([4215fb0](https://github.com/publira/next-cache-handlers/commit/4215fb0e764f1e0bae05cb10b1f97d7a18fa1e53))
* **deps:** update dependency zod to v4.6.7 ([#105](https://github.com/publira/next-cache-handlers/issues/105)) ([69214b8](https://github.com/publira/next-cache-handlers/commit/69214b85aa3913895151d6e038b67c1ba154c106))
* **deps:** update react monorepo to v19.3.1 ([#118](https://github.com/publira/next-cache-handlers/issues/118)) ([13f61c5](https://github.com/publira/next-cache-handlers/commit/13f61c57232018cec9448727aaf673a8bbeb8f2f))

## [1.0.2](https://github.com/publira/next-cache-handlers/compare/v1.0.1...v1.0.2) (2026-10-08)


### Bug Fixes

* empty ([#68](https://github.com/publira/next-cache-handlers/issues/68)) ([a83ad26](https://github.com/publira/next-cache-handlers/commit/a83ad2617dc9e47beb47334f6666227aca83b595))

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
