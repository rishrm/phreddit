import test from "node:test";
import assert from "node:assert/strict";
import { databaseHealth } from "../utils/health.js";

test("database health fails closed while MongoDB is disconnected", () => {
  assert.deepEqual(databaseHealth({ readyState: 0 }), {
    status: 503,
    payload: {
      ok: false,
      error: "Database is not ready."
    }
  });
});

test("database health exposes the test database only when requested", () => {
  assert.deepEqual(databaseHealth({
    readyState: 1,
    includeDatabase: true,
    databaseName: "phreddit_e2e"
  }), {
    status: 200,
    payload: { ok: true, database: "phreddit_e2e" }
  });
});
