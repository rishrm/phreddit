import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import User from "../models/User.js";
import { resetAdminPassword } from "../utils/adminPasswordReset.js";
import {
  clearTestDb,
  connectTestDb,
  createTestUser,
  disconnectTestDb
} from "./testHelpers.js";

test("administrator recovery changes the hash and invalidates every session", async (t) => {
  await connectTestDb();
  await clearTestDb();

  t.after(async () => {
    await clearTestDb();
    await mongoose.connection.collection("sessions").deleteMany({});
    await disconnectTestDb();
  });

  const admin = await createTestUser({
    email: "recover-admin@example.com",
    displayName: "recoveradmin",
    isAdmin: true
  });
  await mongoose.connection.collection("sessions").insertMany([
    {
      _id: "admin-session",
      expires: new Date(Date.now() + 60_000),
      session: JSON.stringify({ userId: String(admin._id) })
    },
    {
      _id: "other-session",
      expires: new Date(Date.now() + 60_000),
      session: JSON.stringify({ userId: new mongoose.Types.ObjectId().toString() })
    }
  ]);

  const newPassword = "FreshRecoveryPass987!";
  const result = await resetAdminPassword({
    email: admin.email,
    newPassword
  });

  const updatedAdmin = await User.findById(admin._id).select("+passwordHash");
  assert.equal(await bcrypt.compare(newPassword, updatedAdmin.passwordHash), true);
  assert.equal(result.invalidatedSessions, 2);
  assert.equal(await mongoose.connection.collection("sessions").countDocuments(), 0);
});

test("administrator recovery rejects ordinary accounts and reused passwords", async (t) => {
  await connectTestDb();
  await clearTestDb();

  t.after(async () => {
    await clearTestDb();
    await disconnectTestDb();
  });

  const ordinaryUser = await createTestUser({
    email: "ordinary@example.com",
    displayName: "ordinaryuser"
  });
  await assert.rejects(
    resetAdminPassword({
      email: ordinaryUser.email,
      newPassword: "FreshRecoveryPass987!"
    }),
    /already belong to an administrator/
  );

  const admin = await createTestUser({
    email: "existing-admin@example.com",
    displayName: "existingadmin",
    isAdmin: true
  });
  await assert.rejects(
    resetAdminPassword({
      email: admin.email,
      newPassword: "Password123!"
    }),
    /must be different/
  );
});
