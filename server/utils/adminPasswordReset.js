import bcrypt from "bcrypt";
import mongoose from "mongoose";
import User from "../models/User.js";
import { runAtomic, sessionOptions } from "./transactions.js";
import { validateEmail, validateRegistrationInput } from "./validation.js";

const PASSWORD_HASH_ROUNDS = 12;
const SESSION_COLLECTION = "sessions";

export function resolveAdminPasswordResetInputs(env = process.env) {
  const email = String(env.ADMIN_EMAIL || "").trim().toLowerCase();
  const confirmation = String(env.CONFIRM_ADMIN_PASSWORD_RESET || "")
    .trim()
    .toLowerCase();
  const newPassword = typeof env.ADMIN_NEW_PASSWORD === "string"
    ? env.ADMIN_NEW_PASSWORD
    : "";

  if (!validateEmail(email)) {
    throw new Error("Set ADMIN_EMAIL to an existing administrator account.");
  }
  if (confirmation !== email) {
    throw new Error(
      "Set CONFIRM_ADMIN_PASSWORD_RESET to the same email to confirm recovery."
    );
  }
  if (!newPassword) {
    throw new Error("Set ADMIN_NEW_PASSWORD through a secret environment variable.");
  }

  return { email, newPassword };
}

export async function resetAdminPassword({ email, newPassword }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail })
    .select("+passwordHash firstName lastName displayName email isAdmin")
    .lean();
  if (!user) {
    throw new Error("No account exists with ADMIN_EMAIL.");
  }
  if (!user.isAdmin) {
    throw new Error("ADMIN_EMAIL must already belong to an administrator.");
  }

  const validation = validateRegistrationInput({
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    email: user.email,
    password: newPassword,
    confirmPassword: newPassword
  });
  if (!validation.ok) {
    throw new Error(validation.errors.join(" "));
  }
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    throw new Error("The new administrator password must be different.");
  }

  const passwordHash = await bcrypt.hash(newPassword, PASSWORD_HASH_ROUNDS);
  return runAtomic(async (session) => {
    const sessionCollection = mongoose.connection.collection(SESSION_COLLECTION);
    const invalidated = await sessionCollection.deleteMany(
      {},
      sessionOptions(session)
    );

    const update = await User.updateOne(
      { _id: user._id, isAdmin: true },
      { $set: { passwordHash } },
      sessionOptions(session)
    );
    if (update.matchedCount !== 1) {
      throw new Error("Administrator account changed during password recovery.");
    }

    return {
      email: user.email,
      invalidatedSessions: invalidated.deletedCount
    };
  });
}
