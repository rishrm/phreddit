# Performance Notes

This document records a reproducible local API benchmark. It is evidence for
an engineering decision, not a production capacity guarantee.

## Test profile

- Date: 2026-08-27
- Dataset: 2,000 posts and 6,000 comments in a dedicated `phreddit_bench`
  database
- Response page: 20 posts
- Load: 50 asynchronous workers for 15 seconds
- Application rate limiter: disabled only for this isolated benchmark
- Host: Apple M2 Pro (10 cores), 16 GB memory
- Runtime: Node.js 26.7.0, MongoDB 8.3.7, Mongoose 8.24.4
- Transport: loopback HTTP; no internet, TLS, Render, Vercel, or Atlas latency
- Baseline commit: `dd32be6`
- Optimized commit: `799a954`

The guarded volume seed and dependency-free HTTP runner are in
`server/bench/`. Both runs completed with zero non-2xx responses and zero
request errors.

## Results

| Endpoint | Successful req/s | p50 | p97.5 | p99 |
|---|---:|---:|---:|---:|
| Active sort, baseline | 40 | 1,241.1 ms | 1,664.0 ms | 1,788.7 ms |
| Active sort, optimized run 1 | 1,000 | 49.7 ms | 62.0 ms | 69.1 ms |
| Active sort, optimized run 2 | 947 | 51.2 ms | 75.6 ms | 98.9 ms |
| Newest sort, optimized build | 866 | 57.0 ms | 77.5 ms | 81.4 ms |
| Indexed post/comment search | 556 | 87.1 ms | 122.2 ms | 131.7 ms |

Across the two optimized Active-sort runs, throughput improved by at least
23x and p99 latency fell by at least 94% relative to the measured baseline.

## What changed

The baseline Active feed ran a correlated comment aggregation for every
candidate post before sorting. At volume, that work dominated the endpoint.

The optimized design stores `commentCount` and `latestCommentAt` on each Post:

- comment creation updates both fields inside the same MongoDB transaction as
  the comment and ownership references;
- comment-tree deletion recomputes the affected post metadata before commit;
- destructive post cascades skip needless recomputation for posts being
  deleted;
- a bounded, idempotent startup backfill repairs documents created before the
  fields existed;
- the benchmark/demo seeders maintain the same invariant;
- Active ordering uses the compound
  `{ latestCommentAt: -1, createdAt: -1, _id: -1 }` index.

For a 20-result guest query, MongoDB's execution plan used the compound index,
examined 20 keys, and examined zero post documents while selecting the ordered
IDs. The API then hydrated only those 20 posts.

## Reproduce

```bash
# Terminal 1: seed and serve an isolated benchmark database
MONGO_URI=mongodb://127.0.0.1:27017/phreddit_bench \
CONFIRM_DATABASE_RESET=phreddit_bench npm --prefix server run bench:seed -- 2000
MONGO_URI=mongodb://127.0.0.1:27017/phreddit_bench \
DISABLE_RATE_LIMIT=true npm --prefix server start

# Terminal 2: benchmark representative read paths
BENCH_URL='http://127.0.0.1:8000/api/posts?limit=20' \
  npm --prefix server run bench
BENCH_URL='http://127.0.0.1:8000/api/posts?limit=20&sort=active' \
  npm --prefix server run bench
BENCH_URL='http://127.0.0.1:8000/api/posts?limit=20&search=mongo' \
  npm --prefix server run bench
```

Results vary with hardware, dataset shape, runtime versions, and background
load. These figures do not mean the system supports 1,000 simultaneous users;
production capacity requires a separate test through the deployed network and
database topology.
