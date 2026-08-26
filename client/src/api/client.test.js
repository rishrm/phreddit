import { afterEach, describe, expect, it, vi } from "vitest";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function loadApiWithFetch(fetchMock) {
  vi.resetModules();
  vi.stubGlobal("fetch", fetchMock);
  return (await import("./client.js")).api;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("API CSRF handling", () => {
  it("captures the bootstrap token and sends it on unsafe requests", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ user: null, csrfToken: "bootstrap-token" }))
      .mockResolvedValueOnce(jsonResponse({ _id: "community-1" }, 201));
    const api = await loadApiWithFetch(fetchMock);

    await api.me();
    await api.createCommunity({ name: "webdev", description: "Frontend notes" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const mutationOptions = fetchMock.mock.calls[1][1];
    expect(new Headers(mutationOptions.headers).get("X-CSRF-Token"))
      .toBe("bootstrap-token");
  });

  it("refreshes an invalid token and retries the mutation exactly once", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ user: null, csrfToken: "expired-token" }))
      .mockResolvedValueOnce(jsonResponse({
        error: "CSRF token is invalid or missing.",
        code: "CSRF_TOKEN_INVALID"
      }, 403))
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "fresh-token" }))
      .mockResolvedValueOnce(jsonResponse({ _id: "post-1", title: "Updated" }));
    const api = await loadApiWithFetch(fetchMock);

    await api.me();
    await api.updatePost("post-1", { title: "Updated" });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[2][0]).toBe("/api/auth/csrf");
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("X-CSRF-Token"))
      .toBe("expired-token");
    expect(new Headers(fetchMock.mock.calls[3][1].headers).get("X-CSRF-Token"))
      .toBe("fresh-token");
  });

  it("clears the token after logout and obtains a new one before another mutation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ user: null, csrfToken: "session-token" }))
      .mockResolvedValueOnce(jsonResponse({ message: "Logged out successfully." }))
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "new-session-token" }))
      .mockResolvedValueOnce(jsonResponse({ _id: "community-2" }, 201));
    const api = await loadApiWithFetch(fetchMock);

    await api.me();
    await api.logout();
    await api.createCommunity({ name: "design", description: "Review notes" });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[2][0]).toBe("/api/auth/csrf");
    expect(new Headers(fetchMock.mock.calls[3][1].headers).get("X-CSRF-Token"))
      .toBe("new-session-token");
  });
});
