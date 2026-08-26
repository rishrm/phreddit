import test from "node:test";
import assert from "node:assert/strict";
import { ensureConfiguredAdmin } from "../utils/adminBootstrap.js";

test("admin bootstrap is inert when ADMIN_EMAIL is not configured", async () => {
  let called = false;
  const result = await ensureConfiguredAdmin({
    adminEmail: "",
    userModel: {
      async findOne() {
        called = true;
      }
    }
  });

  assert.deepEqual(result, { configured: false, reason: "not-configured" });
  assert.equal(called, false);
});

test("admin bootstrap rejects an invalid configured email", async () => {
  await assert.rejects(
    ensureConfiguredAdmin({ adminEmail: "not-an-email", userModel: {} }),
    /ADMIN_EMAIL must be a valid email address/
  );
});

test("admin bootstrap verifies an existing administrator without changing privileges", async () => {
  let receivedFilter;
  const result = await ensureConfiguredAdmin({
    adminEmail: "  Owner@Example.com ",
    userModel: {
      async findOne(filter) {
        receivedFilter = filter;
        return { isAdmin: true };
      }
    }
  });

  assert.deepEqual(receivedFilter, { email: "owner@example.com" });
  assert.deepEqual(result, { configured: true });
});

test("admin bootstrap refuses to promote an ordinary account", async () => {
  const result = await ensureConfiguredAdmin({
    adminEmail: "owner@example.com",
    userModel: {
      async findOne() {
        return { isAdmin: false };
      }
    }
  });

  assert.deepEqual(result, { configured: false, reason: "not-admin" });
});

test("admin bootstrap reports when the configured account does not exist", async () => {
  const result = await ensureConfiguredAdmin({
    adminEmail: "owner@example.com",
    userModel: {
      async findOne() {
        return null;
      }
    }
  });

  assert.deepEqual(result, { configured: false, reason: "not-found" });
});
