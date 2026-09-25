# End-to-end tests

These tests start two instances of `apps/example` on one Redis-compatible server with the same key prefix, which is the multi-instance deployment the library exists for, and check that the instances share what they cache:

| Test | Covers |
| --- | --- |
| `shares a use cache: remote entry between instances` | An entry one instance writes through `cacheHandlers` is what the other one reads. |
| `a tag revalidated on one instance refreshes both` | After `POST /api/revalidate` on one instance, the prerendered page (stored through `cacheHandler`) and the `"use cache: remote"` entry are regenerated once, and both instances serve the new value. |

They talk to the instances over HTTP only, so no browser needs to be installed.

## Run locally

Start a server, then run the suite from the repository root. The command builds the workspace first:

```sh
docker compose up -d   # outside the Dev Container, which starts the servers itself
pnpm test:e2e
```

`PNCH_REDIS_URL` picks the server, as it does for `pnpm test`: Valkey by default, `redis://redis:6379` for Redis in the Dev Container, `redis://localhost:6380` from the host.

Each run uses a key prefix of its own (`E2E_CACHE_APP`, `e2e-<pid>` by default), so entries from earlier runs do not leak in.

## Next.js canary

CI runs this suite on every change against the Next.js version the workspace pins, and `.github/workflows/canary.yml` runs it every day against `next@canary`. To try canary locally, run `pnpm update --recursive next@canary` before `pnpm test:e2e`, and discard the changes to the `package.json` files and `pnpm-lock.yaml` afterwards.

## Ports

The instances listen on `127.0.0.1:3101` and `127.0.0.1:3102`. Set `E2E_FIRST_PORT` and `E2E_SECOND_PORT` to move them. The suite never reuses a server already on those ports, because it could be using another Redis or key prefix.
