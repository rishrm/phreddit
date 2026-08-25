// Benchmarks the paginated post listing without third-party load-test code.
// Start the API against a seeded bench database with DISABLE_RATE_LIMIT=true.
import { performance } from "node:perf_hooks";

const TARGET = process.env.BENCH_URL || "http://127.0.0.1:8000/api/posts?limit=20";
const CONNECTIONS = Number(process.env.BENCH_CONNECTIONS || 50);
const DURATION_SECONDS = Number(process.env.BENCH_DURATION || 15);

if (!Number.isInteger(CONNECTIONS) || CONNECTIONS < 1 || CONNECTIONS > 1000) {
  throw new Error("BENCH_CONNECTIONS must be an integer between 1 and 1000.");
}
if (!Number.isFinite(DURATION_SECONDS) || DURATION_SECONDS < 1 || DURATION_SECONDS > 600) {
  throw new Error("BENCH_DURATION must be between 1 and 600 seconds.");
}

const targetUrl = new URL(TARGET);
if (!["http:", "https:"].includes(targetUrl.protocol)) {
  throw new Error("BENCH_URL must use http:// or https://.");
}

const latencies = [];
let successful = 0;
let non2xx = 0;
let errors = 0;
const startedAt = performance.now();
const deadline = startedAt + DURATION_SECONDS * 1000;

async function worker() {
  while (performance.now() < deadline) {
    const requestStartedAt = performance.now();
    try {
      const response = await fetch(targetUrl, {
        signal: AbortSignal.timeout(10_000)
      });
      await response.arrayBuffer();
      latencies.push(performance.now() - requestStartedAt);
      if (response.ok) successful += 1;
      else non2xx += 1;
    } catch {
      errors += 1;
    }
  }
}

await Promise.all(Array.from({ length: CONNECTIONS }, () => worker()));
const elapsedSeconds = (performance.now() - startedAt) / 1000;
latencies.sort((a, b) => a - b);

function percentile(value) {
  if (latencies.length === 0) return 0;
  const index = Math.min(
    latencies.length - 1,
    Math.ceil((value / 100) * latencies.length) - 1
  );
  return latencies[index];
}

const requestsPerSecond = successful / elapsedSeconds;
console.log(`Target: ${targetUrl}`);
console.log(`Connections: ${CONNECTIONS}; duration: ${elapsedSeconds.toFixed(2)}s`);
console.log(
  `Summary: ${requestsPerSecond.toFixed(0)} successful req/s, ` +
  `p50 ${percentile(50).toFixed(1)}ms, p97.5 ${percentile(97.5).toFixed(1)}ms, ` +
  `p99 ${percentile(99).toFixed(1)}ms`
);
console.log(`Responses: ${successful} successful, ${non2xx} non-2xx, ${errors} errors.`);

if (non2xx > 0 || errors > 0) {
  process.exitCode = 1;
}
