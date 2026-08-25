import { io } from "socket.io-client";

function socketBaseUrl() {
  const explicitSocketUrl = import.meta.env.VITE_SOCKET_URL;
  if (explicitSocketUrl) return explicitSocketUrl.replace(/\/+$/, "");

  const apiBase = import.meta.env.VITE_API_BASE_URL;
  if (!apiBase) return undefined; // same origin; Vite proxies /socket.io in dev
  try {
    return new URL(apiBase, window.location.origin).origin;
  } catch {
    return undefined;
  }
}

// Subscribes to live updates for one post. Returns an unsubscribe function.
export function subscribeToPost(postId, onUpdate) {
  const socket = io(socketBaseUrl(), { withCredentials: true });
  let refreshTimer = null;

  socket.on("connect", () => {
    socket.emit("post:join", String(postId));
  });

  socket.on("post:updated", (payload) => {
    if (String(payload?.postId) === String(postId)) {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(onUpdate, 80);
    }
  });

  return () => {
    clearTimeout(refreshTimer);
    socket.emit("post:leave", String(postId));
    socket.disconnect();
  };
}
