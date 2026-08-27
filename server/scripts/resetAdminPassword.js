import dotenv from "dotenv";
import mongoose from "mongoose";
import {
  resetAdminPassword,
  resolveAdminPasswordResetInputs
} from "../utils/adminPasswordReset.js";

dotenv.config();

async function main() {
  const mongoUri = String(process.env.MONGO_URI || "").trim();
  if (!mongoUri) {
    throw new Error("Set MONGO_URI explicitly before administrator recovery.");
  }

  const inputs = resolveAdminPasswordResetInputs(process.env);
  delete process.env.ADMIN_NEW_PASSWORD;

  await mongoose.connect(mongoUri);
  const result = await resetAdminPassword(inputs);
  console.log(
    `Reset the administrator password for ${result.email} in ` +
    `${mongoose.connection.name}; invalidated ${result.invalidatedSessions} sessions.`
  );
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
