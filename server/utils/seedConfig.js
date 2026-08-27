const LOCAL_MONGO_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLocalMongoUri(mongoUri) {
  try {
    const parsed = new URL(mongoUri);
    return parsed.protocol === "mongodb:" && LOCAL_MONGO_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function resolveSeedInputs({ args, env, mongoUri }) {
  const [email, displayName, commandLinePassword] = args;
  const localDatabase = isLocalMongoUri(mongoUri);
  const adminPassword = env.ADMIN_PASSWORD || (
    localDatabase ? commandLinePassword : ""
  );
  const demoPassword = env.DEMO_PASSWORD || (
    localDatabase ? adminPassword : ""
  );

  return {
    email,
    displayName,
    adminPassword,
    demoPassword,
    usedCommandLinePassword: Boolean(
      commandLinePassword && !env.ADMIN_PASSWORD && localDatabase
    )
  };
}

export function databaseResetIsConfirmed({ mongoUri, databaseName, confirmation }) {
  if (confirmation === databaseName) return true;
  return isLocalMongoUri(mongoUri) && databaseName === "phreddit";
}

