import test from "node:test";
import assert from "node:assert/strict";
import {
  databaseResetIsConfirmed,
  isLocalMongoUri,
  resolveSeedInputs
} from "../utils/seedConfig.js";

test("local seed mode accepts the assignment's three command-line arguments", () => {
  const inputs = resolveSeedInputs({
    args: ["admin@example.com", "admin", "LocalPassword123!"],
    env: {},
    mongoUri: "mongodb://127.0.0.1:27017/phreddit"
  });

  assert.equal(inputs.adminPassword, "LocalPassword123!");
  assert.equal(inputs.demoPassword, "LocalPassword123!");
  assert.equal(inputs.usedCommandLinePassword, true);
});

test("remote seeds require password secrets instead of process arguments", () => {
  const inputs = resolveSeedInputs({
    args: ["admin@example.com", "admin", "VisibleProcessArgument"],
    env: {},
    mongoUri: "mongodb+srv://cluster.example/phreddit"
  });

  assert.equal(inputs.adminPassword, "");
  assert.equal(inputs.demoPassword, "");
  assert.equal(inputs.usedCommandLinePassword, false);
});

test("database reset confirmation is implicit only for the default local database", () => {
  assert.equal(isLocalMongoUri("mongodb://localhost:27017/phreddit"), true);
  assert.equal(isLocalMongoUri("mongodb+srv://cluster.example/phreddit"), false);
  assert.equal(databaseResetIsConfirmed({
    mongoUri: "mongodb://localhost:27017/phreddit",
    databaseName: "phreddit"
  }), true);
  assert.equal(databaseResetIsConfirmed({
    mongoUri: "mongodb://localhost:27017/important",
    databaseName: "important"
  }), false);
  assert.equal(databaseResetIsConfirmed({
    mongoUri: "mongodb+srv://cluster.example/portfolio",
    databaseName: "portfolio",
    confirmation: "portfolio"
  }), true);
});

