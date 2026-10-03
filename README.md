https://github.com/Girishvesangi/throttlebox/actions/workflows/ci.yml/badge.svg
# ThrottleBox

Redis-backed rate limiting for Node.js. Four algorithms, one HTTP API, atomic by construction.

## Why ThrottleBox?

Three Node servers keeping their own counters will give three different answers for the same user. So the counters live in Redis — one shared source of truth. But a naive "read count, decide, write count" still races: two requests can both read `9` before either writes `10`, and both slip through a limit of ten. ThrottleBox runs the check-and-update as a single Lua script inside Redis, so the decision is atomic — no race, no matter how many servers or how much concurrency.

## Features

- **Four algorithms** — fixed window, token bucket, sliding-window counter, leaky bucket — each as a Redis Lua script.
- **Server-owned policies** — clients name a policy (`"api-burst"`), they can't silently raise their own quota.
- **Atomic by construction** — scripts are loaded once with `SCRIPT LOAD`, invoked by SHA with `EVALSHA`, and automatically reloaded after a `NOSCRIPT` (e.g. Redis restart).
- **Honest benchmarks** — k6 load tests with published methodology, including where it saturates.

## Quickstart

```bash
docker compose up --build -d

curl -X POST localhost:3000/v1/check \
  -H 'content-type: application/json' \
  -d '{"policyId":"api-burst","subject":"user:42","cost":1}'

docker compose down
```

Local dev without Docker: run Redis on `localhost:6379`, then `npm run dev`.

## API

### `POST /v1/check`

Request:

```json
{
  "policyId": "api-burst",
  "subject": "user:42",
  "cost": 1
}
```

- `policyId` — a server-owned policy (see table below). Unknown IDs are rejected.
- `subject` — who the limit applies to (user ID, API key, IP…). Max 200 characters.
- `cost` — how much quota this request consumes. Defaults to `1`; must be a positive integer within the policy's capacity.

Response (`200` — a *denied* request is still `200`, with `allowed: false`):

```json
{
  "allowed": true,
  "limit": 20,
  "remaining": 17,
  "resetAtMs": 1759363200000,
  "retryAfterMs": 0,
  "algorithm": "token_bucket"
}
```

- `remaining` — quota left after this request.
- `resetAtMs` — when the current window/bucket fully resets (epoch milliseconds).
- `retryAfterMs` — how long to wait before retrying; `0` when allowed.

Errors:

| Status | Body                                  | When                                      |
|--------|---------------------------------------|-------------------------------------------|
| 400    | `{ "error": "subject is required" }`  | Missing subject, or longer than 200 chars |
| 400    | `{ "error": "policyId is required" }` | Missing policyId                          |
| 404    | `{ "error": "unknown policy" }`       | No policy with that ID                    |
| 400    | `{ "error": "invalid cost" }`         | Non-integer cost, `< 1`, or above capacity |

### Policies

| `policyId`         | Algorithm      | Limit / capacity | Window / rate       |
|--------------------|----------------|------------------|---------------------|
| `login-attempts`   | fixed window   | 5                | 60,000 ms (1 min)   |
| `api-burst`        | token bucket   | capacity 20      | refill 2/s          |
| `signup`           | sliding window | 5                | 3,600,000 ms (1 hr) |
| `expensive-report` | leaky bucket   | capacity 3       | leak 0.2/s          |

## Algorithms

| Algorithm              | How it works (one line)                                  | Reach for it when                          |
|------------------------|----------------------------------------------------------|--------------------------------------------|
| Fixed window           | Counter per fixed time block; resets on the boundary.    | Simple cases like login attempts.          |
| Token bucket           | Tokens refill at a steady rate; each request spends one. | Bursty APIs that need a bounded burst.     |
| Sliding-window counter | Weighted blend of the current and previous window.       | You want smooth limits with no 2× boundary burst. |
| Leaky bucket           | Requests queue as backlog; the bucket drains steadily.    | Expensive jobs that must run at a capped rate. |

## Benchmarks

Stable through **~8,000 requests/second** (mixed keys) on a MacBook Pro — p95 1.3 ms, p99 13 ms, zero errors. The knee is between 8k and 16k offered; the hot-key worst case (all requests on one key) is clean at 4,000/s. Full methodology, environment, and caveats in [`bench/BENCHMARKS.md`](bench/BENCHMARKS.md) — including why you shouldn't compare laptop numbers to vendor-published ones.

## Project structure

```
throttlebox/
  src/
    server.ts     # Fastify app, /v1/check route
    runner.ts     # ScriptRunner: loads Lua scripts, EVALSHA dispatch, NOSCRIPT reload
    redis.ts      # Redis client (REDIS_URL with local fallback)
    policies.ts   # server-owned policy definitions
    lua/          # the four algorithm scripts
  test/           # vitest suite (19 tests) — per-file key prefixes for isolation
  bench/
    check.js      # k6 load script
    BENCHMARKS.md # results + methodology
  Dockerfile      # multi-stage build
  compose.yaml    # API + Redis, one command
```

## Limitations

- **Single Redis** is a single point of failure — no Cluster/Sentinel support yet, and nothing multi-region.
- **Counters live in Redis memory** (`appendonly off` in compose) — a Redis restart wipes state and briefly over-admits. That's fail-open by design; fail-closed would need persistence.
- **Policies are compiled in**, not configurable at runtime.
- **No authentication** on `/v1/check` yet.
- **Benchmarks are laptop numbers**, not production sizing.

## Roadmap

- API-key authentication on `/v1/check`
- Admin API for creating/updating policies at runtime
- Redis Cluster support
- Prometheus metrics (`rate`, `errors`, `duration`)
- Hosted demo
