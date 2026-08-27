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
  it("does not persist a guest session until an unsafe request needs a token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ user: null }))
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "on-demand-token" }))
      .mockResolvedValueOnce(jsonResponse({ _id: "community-1" }, 201));
    const api = await loadApiWithFetch(fetchMock);

    await api.me();
    await api.createCommunity({ name: "webdev", description: "Frontend notes" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/auth/csrf");
    const mutationOptions = fetchMock.mock.calls[2][1];
    expect(new Headers(mutationOptions.headers).get("X-CSRF-Token"))
      .toBe("on-demand-token");
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

  it("adds a support reference to unexpected server errors", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      error: "Internal server error.",
      requestId: "request-500"
    }, 500));
    const api = await loadApiWithFetch(fetchMock);

    await expect(api.getCommunities()).rejects.toMatchObject({
      message: "Internal server error. Reference: request-500",
      requestId: "request-500",
      status: 500
    });
  });
});
