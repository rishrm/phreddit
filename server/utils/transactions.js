import mongoose from "mongoose";

function topologySupportsTransactions() {
  if (process.env.FORCE_TRANSACTIONS === "true") return true;
  if (process.env.DISABLE_TRANSACTIONS === "true") return false;

  const topologyType = mongoose.connection.client?.topology?.description?.type;
  return topologyType === "ReplicaSetWithPrimary" || topologyType === "Sharded";
}

export function withSession(query, session) {
  return session ? query.session(session) : query;
}

export function sessionOptions(session) {
  return session ? { session } : {};
}

export async function runAtomic(work) {
  if (!topologySupportsTransactions()) {
    return work(null);
  }

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
