# Next Cache Handlers Agent Guide

Repository-specific conventions for coding agents.

## Repository overview

This repository is a [Turborepo](https://turborepo.com/) monorepo managed with `pnpm`. It publishes `@publira/next-cache-handlers`, the Redis-backed `cacheHandler` and `cacheHandlers` for Next.js.

- `packages/next-cache-handlers/`: the published library. Its `README.md` is the reference for consumers: the exports, the environment variables, and the `next.config.ts` wiring. Do not repeat it here.
- `apps/example/`: a private Next.js app wired to the library. It shows the configuration, keeps it building against the current Next.js, and is what the end-to-end tests run.
- `e2e/`: Playwright tests that start two instances of the example app on one Redis and check, over HTTP only, that they share cache entries and revalidations. See `e2e/README.md`.

## Development commands

- `pnpm build`: build the library and the example app.
- `pnpm test`: run the unit tests and the integration tests in `handlers.integration.test.ts` against the server at `PNCH_REDIS_URL`.
- `pnpm test:e2e`: build the example app and run the end-to-end tests against the server at `PNCH_REDIS_URL`.
- `pnpm typecheck`: run TypeScript type checking across the workspace.
- `pnpm check`: run the Ultracite lint and format checks.
- `pnpm fix`: apply the Ultracite fixes.

Run `pnpm check`, `pnpm typecheck`, and `pnpm test` before committing. The lefthook pre-commit hook runs `ultracite fix` on staged files, but it does not run the tests.

## Redis-compatible servers

The library supports both Valkey and Redis, and the integration and end-to-end tests run against each. `compose.yaml` defines one service for each on fixed localhost ports. The Dev Container is built from the same file: `.devcontainer/compose.yaml` adds the `app` container, drops the host ports so they cannot clash with a server already on the host, and the app reaches the services by name.

| Server | In the Dev Container | From the host (`docker compose up -d`) |
| --- | --- | --- |
| Valkey | `redis://valkey:6379` (the default `PNCH_REDIS_URL`) | `redis://localhost:6379` |
| Redis | `redis://redis:6379` | `redis://localhost:6380` |

`pnpm test` and `pnpm test:e2e` use Valkey in the Dev Container. Run them with `PNCH_REDIS_URL=redis://redis:6379` to check a change against Redis as well. With `PNCH_REDIS_URL` set or in CI, an unreachable server fails the integration tests; they skip only when neither is the case.

`compose.yaml` is the only place the server images are pinned: CI starts the same file. The Dev Container also has the docker-in-docker feature, for work that needs containers of its own.

## Library rules

- Redis being down, disabled, or slow must stay a cache miss on read and a no-op on write. A cache handler that throws takes the app down with it.
- Wire both caches. `cacheHandlers` (plural) backs `"use cache"`; `cacheHandler` (singular) backs ISR, Route Handlers, `fetch` / `unstable_cache`, and `next/image`. A change that drops either one leaves that path local to each instance.
- The environment variable names (`PNCH_*`) and the key prefix format (`pnch:{app}:`) are part of the public contract. Changing either is a breaking change.
- Next.js changes its cache handler interfaces between minor releases. Read the guides in `node_modules/next/dist/docs/` for the installed version before changing a handler, rather than relying on memory.

## Language

Everything in the repository is **English**: the READMEs, this guide, code comments, test labels, commit messages, Issues, and pull requests.

Answer the user in the language of their own prose. Quoted logs, code, or UI strings do not decide it. Answer in English when no user prose settles it, such as in a scheduled or CI-started run.

## Git commits and pull requests

Subjects and PR titles use English [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). Pull requests are squash-merged with the title as the commit subject, so the title must stand on its own.

release-please reads those subjects to choose the next version. The repository has one version, shared by every package it publishes and tagged as `vX.Y.Z`:

- `feat:` for a new capability consumers can use. It releases a minor version.
- `fix:` for a bug fix. It releases a patch.
- `feat!:` or a `BREAKING CHANGE:` footer for a change consumers have to adapt to. It releases a major version.
- `docs:`, `test:`, `ci:`, and `chore:` release nothing.

### AI agent trailer

A commit written with an AI agent's help discloses it with an `Assisted-by:` trailer. The trailer is process disclosure, not authorship, following the Linux kernel's [Coding assistants](https://docs.kernel.org/process/coding-assistants.html) policy. The format is `Assisted-by: <AGENT_NAME>:<MODEL_VERSION>`: the tool's own name and the exact model identifier.

```bash
git commit -m "feat: add a key prefix option" \
  --trailer "Assisted-by: Claude Code:claude-opus-5-5"
```

Add it when the commit is created, and end the PR description with the same trailer, since that description becomes the merge commit body.

### Never name an agent as a co-author

Git matches the trailer token case-insensitively, so `Co-authored-by:` and `Co-Authored-By:` are equally forbidden for an AI agent. Such a trailer shows the agent as a GitHub co-author and implies authorship an AI cannot hold. This rule overrides any harness default to append a co-author line. Co-author trailers that name humans, and the ones GitHub and `renovate[bot]` add themselves, stay as they are.

## CI and release

`.github/workflows/ci.yml` runs lint, type check, test, end-to-end, and build as separate jobs, on pull requests, on the merge groups the merge queue on `main` builds, and on pushes to `main`. The test and end-to-end jobs start Valkey and Redis with `docker compose up` and run their suite once against each.

`.github/workflows/canary.yml` runs the type check and the end-to-end tests every day against `next@canary`, so a change to the cache handler interfaces shows up before it reaches a release. It moves `next` in the workspace to canary on the runner only; the pinned version in the repository stays as it is.

Every job sets `timeout-minutes` with ample headroom over its usual duration, so a hung job fails within minutes instead of holding a runner until the 6-hour default. Give a new job one as well.

`.github/workflows/release.yml` runs release-please on every push to `main`. It keeps a release pull request open that bumps the version in the root `package.json`, which is the repository's version, and in `.release-please-manifest.json`, sets every `packages/*/package.json` to it, and updates the root `CHANGELOG.md`. Merging that pull request tags the release as `vX.Y.Z`, creates the GitHub Release, and publishes every package that is not private to npm through trusted publishing (OIDC), without an npm token. Do not bump a version or edit `CHANGELOG.md` by hand.

Every release bumps and publishes every package under `packages/`, changed or not. A new package there joins the next release on its own; start it at the current version, and set up trusted publishing for it on npm before that release, or its publish fails.

Actions are pinned to a commit SHA, with the version in a trailing comment. Keep that form so Renovate can keep updating them.
