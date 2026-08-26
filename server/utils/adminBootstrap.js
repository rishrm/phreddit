import User from "../models/User.js";
import { validateEmail } from "./validation.js";

export async function ensureConfiguredAdmin({
  adminEmail = process.env.ADMIN_EMAIL,
  userModel = User
} = {}) {
  const email = String(adminEmail || "").trim().toLowerCase();
  if (!email) {
    return { configured: false, reason: "not-configured" };
  }

  if (!validateEmail(email)) {
    throw new Error("ADMIN_EMAIL must be a valid email address.");
  }

  let query = userModel.findOne({ email });
  if (typeof query?.select === "function") {
    query = query.select("isAdmin");
  }
  const user = await query;

  if (!user) {
    return { configured: false, reason: "not-found" };
  }

  if (!user.isAdmin) {
    return { configured: false, reason: "not-admin" };
  }

  return { configured: true };
}
