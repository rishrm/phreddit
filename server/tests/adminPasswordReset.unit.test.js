import test from "node:test";
import assert from "node:assert/strict";
import { resolveAdminPasswordResetInputs } from "../utils/adminPasswordReset.js";

test("administrator password reset inputs require a secret and exact confirmation", () => {
  assert.deepEqual(
    resolveAdminPasswordResetInputs({
      ADMIN_EMAIL: " Admin@Example.com ",
      CONFIRM_ADMIN_PASSWORD_RESET: "admin@example.com",
      ADMIN_NEW_PASSWORD: "FreshRecoveryPass987!"
    }),
    {
      email: "admin@example.com",
      newPassword: "FreshRecoveryPass987!"
    }
  );

  assert.throws(
    () => resolveAdminPasswordResetInputs({
      ADMIN_EMAIL: "admin@example.com",
      CONFIRM_ADMIN_PASSWORD_RESET: "different@example.com",
      ADMIN_NEW_PASSWORD: "FreshRecoveryPass987!"
    }),
    /CONFIRM_ADMIN_PASSWORD_RESET/
  );
  assert.throws(
    () => resolveAdminPasswordResetInputs({
      ADMIN_EMAIL: "admin@example.com",
      CONFIRM_ADMIN_PASSWORD_RESET: "admin@example.com"
    }),
    /ADMIN_NEW_PASSWORD/
  );
});
