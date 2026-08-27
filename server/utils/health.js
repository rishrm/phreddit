export function databaseHealth({ readyState, includeDatabase = false, databaseName = "" }) {
  if (readyState !== 1) {
    return {
      status: 503,
      payload: { ok: false, error: "Database is not ready." }
    };
  }

  return {
    status: 200,
    payload: {
      ok: true,
      ...(includeDatabase ? { database: databaseName } : {})
    }
  };
}
