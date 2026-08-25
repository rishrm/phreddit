import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/User.js";
import { validateEmail } from "../utils/validation.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/phreddit";
const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();

async function main() {
  if (!validateEmail(email)) {
    throw new Error("Set ADMIN_EMAIL to the existing account you want to promote.");
  }
  if (process.env.CONFIRM_ADMIN_PROMOTION !== email) {
    throw new Error("Set CONFIRM_ADMIN_PROMOTION to the same email to confirm this privilege change.");
  }

  await mongoose.connect(MONGO_URI);
  const user = await User.findOneAndUpdate(
    { email },
    { $set: { isAdmin: true }, $max: { reputation: 1000 } },
    { new: true }
  );
  if (!user) {
    throw new Error("No account exists with ADMIN_EMAIL. Register it first.");
  }

  console.log(`Promoted ${user.email} to administrator in ${mongoose.connection.name}.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
