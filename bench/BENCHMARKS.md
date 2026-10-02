# ThrottleBox benchmarks

## Environment
- Commit: `k6 benchmarks`
- Date: 2026-10-01/02 (America/Chicago)
- Machine: macbook prox m4
- Node: v22.18.0 — API via `npm run dev` (tsx watch) on host, 1 replica
- Redis: redis:7-alpine, standalone Docker container, appendonly off
- Policy: `api-burst` — token_bucket, capacity 20, refill 2/s
- Load: `RATE=<n> DURATION=30s npm run bench` → `k6 run bench/check.js`
  (constant-arrival-rate, preAllocatedVUs 100, maxVUs 1000)

## Mixed keys

| Offered/s | Completed/s | p50 | p95 | p99 | Errors | Dropped/s | Verdict |
|---|---|---|---|---|---|---|---|
| 200 | 200 | 1.62ms | 2.71ms | 4.07ms | 0% | 0 | clean |
| 500 | 500 | 1.11ms | 2.16ms | 5.34ms | 0% | 0 | clean |
| 1,000 | 1,000 | 0.70ms | 1.27ms | 4.05ms | 0% | 0 | clean |
| 2,000 | 2,000 | 0.30ms | 0.73ms | 2.33ms | 0% | 0 | clean |
| 4,000 | 4,000 | 0.22ms | 0.53ms | 1.28ms | 0% | 0 | clean |
| 8,000 | 7,980 | 0.32ms | 1.32ms | 13.23ms | 0% | 20 | last stable step |
| 16,000 | 15,719 | 2.01ms | 27.07ms | 49.17ms | 0% | 275 | knee crossed |
| 32,000 | 16,773 | 46.44ms | 77.53ms | 138.8ms | 0.02% | 15,191 | saturated |

## Hot key (single subject)

| Offered/s | Completed/s | p50 | p95 | p99 | Errors | Dropped/s |
|---|---|---|---|---|---|---|
| 4,000 | 3,967 | 0.23ms | 3.74ms | 17.89ms | 0% | 33 |

## Headline
Stable through ~8,000 req/s mixed-key (p95 1.3ms, p99 13ms, zero errors).
Knee between 8k and 16k offered. Hot-key worst case clean at 4k/s; tail
stretches (p99 18ms vs 1.3ms mixed) as all Lua executions serialize on one key.

## Methodology notes
- Runs executed in ascending order; later runs benefited from JIT/connection-pool
  warmup (p50 fell 1.6ms → 0.2ms across the sequence). Warm up before measuring.
- At 16k/32k offered, k6 hit its own maxVUs=1000 ceiling ("Insufficient VUs"),
  so completed-request figures there are partly load-generator-limited.
- Denied limiter decisions return HTTP 200 with allowed:false; only transport
  failures count as errors.
- Do not compare these laptop numbers against vendor-published figures;
  environments differ.
