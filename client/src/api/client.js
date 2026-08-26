const configuredApiBase = import.meta.env.VITE_API_BASE_URL;
const useProductionProxy = import.meta.env.PROD && import.meta.env.VITE_DIRECT_API !== "true";
const API_BASE = (useProductionProxy ? "/api" : configuredApiBase || "/api").replace(/\/+$/, "");
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

let csrfToken = null;
let csrfTokenRequest = null;

function captureCsrfToken(data) {
  if (typeof data.csrfToken === "string" && data.csrfToken) {
    csrfToken = data.csrfToken;
  }
}

function requestError(response, data) {
  const error = new Error(data.error || data.errors?.join(" ") || "Request failed.");
  error.status = response.status;
  error.code = data.code;
  return error;
}

async function parseResponse(response) {
  return response.json().catch(() => ({}));
}

async function getCsrfToken() {
  if (csrfToken) return csrfToken;
  if (csrfTokenRequest) return csrfTokenRequest;

  csrfTokenRequest = (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/csrf`, {
        credentials: "include"
      });
      const data = await parseResponse(response);
      if (!response.ok) throw requestError(response, data);

      captureCsrfToken(data);
      if (!csrfToken) {
        throw new Error("The server did not provide a CSRF token.");
      }
      return csrfToken;
    } finally {
      csrfTokenRequest = null;
    }
  })();

  return csrfTokenRequest;
}

async function request(path, options = {}, allowCsrfRetry = true) {
  const { headers: suppliedHeaders, body, ...fetchOptions } = options;
  const headers = new Headers(suppliedHeaders || {});
  const method = String(fetchOptions.method || "GET").toUpperCase();
  const needsCsrfToken = !SAFE_METHODS.has(method);

  if (body !== undefined && !(body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (needsCsrfToken) {
    headers.set("X-CSRF-Token", await getCsrfToken());
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...fetchOptions,
    headers,
    ...(body !== undefined ? { body } : {})
  });

  const data = await parseResponse(response);
  captureCsrfToken(data);

  if (!response.ok) {
    if (
      needsCsrfToken &&
      allowCsrfRetry &&
      response.status === 403 &&
      data.code === "CSRF_TOKEN_INVALID"
    ) {
      csrfToken = null;
      await getCsrfToken();
      return request(path, options, false);
    }

    throw requestError(response, data);
  }

  if (path === "/auth/logout") {
    csrfToken = null;
  }

  return data;
}

export const api = {
  me: (options = {}) => request("/auth/me", options),
  register: (body) =>
    request("/auth/register", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  login: (body) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  logout: () =>
    request("/auth/logout", {
      method: "POST"
    }),
  getCommunities: (options = {}) => request("/communities", options),
  getCommunity: (id, options = {}) => request(`/communities/${id}`, options),
  createCommunity: (body) =>
    request("/communities", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  updateCommunity: (id, body) =>
    request(`/communities/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),
  deleteCommunity: (id) =>
    request(`/communities/${id}`, {
      method: "DELETE"
    }),
  joinCommunity: (id) =>
    request(`/communities/${id}/join`, {
      method: "POST"
    }),
  leaveCommunity: (id) =>
    request(`/communities/${id}/leave`, {
      method: "POST"
    }),
  getPosts: (params = {}, options = {}) => {
    const query = new URLSearchParams();
    if (params.community) query.set("community", params.community);
    if (params.linkFlair) query.set("linkFlair", params.linkFlair);
    if (params.search) query.set("search", params.search);
    if (params.sort) query.set("sort", params.sort);
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request(`/posts${suffix}`, options);
  },
  getLinkFlairs: (options = {}) => request("/linkflairs", options),
  createLinkFlair: (body) =>
    request("/linkflairs", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  getPost: (id, options = {}) => request(`/posts/${id}`, options),
  getPostSummary: (id, options = {}) => request(`/posts/${id}/summary`, options),
  viewPost: (id, options = {}) =>
    request(`/posts/${id}/view`, {
      ...options,
      method: "POST"
    }),
  createPost: (body) =>
    request("/posts", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  updatePost: (id, body) =>
    request(`/posts/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),
  deletePost: (id) =>
    request(`/posts/${id}`, {
      method: "DELETE"
    }),
  votePost: (id, voteType) =>
    request(`/posts/${id}/vote`, {
      method: "POST",
      body: JSON.stringify({ voteType })
    }),
  savePost: (id) =>
    request(`/users/me/saved-posts/${id}`, {
      method: "POST"
    }),
  unsavePost: (id) =>
    request(`/users/me/saved-posts/${id}`, {
      method: "DELETE"
    }),
  createComment: (body) =>
    request("/comments", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  updateComment: (id, body) =>
    request(`/comments/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),
  deleteComment: (id) =>
    request(`/comments/${id}`, {
      method: "DELETE"
    }),
  voteComment: (id, voteType) =>
    request(`/comments/${id}/vote`, {
      method: "POST",
      body: JSON.stringify({ voteType })
    }),
  reportPost: (id, body) =>
    request(`/reports/posts/${id}`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  listReports: (params = {}, options = {}) => {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request(`/reports${suffix}`, options);
  },
  resolveReport: (id, body) =>
    request(`/reports/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  getProfileContent: (id, options = {}) => request(`/users/${id}/profile-content`, options),
  getPublicProfile: (id, options = {}) => request(`/users/${id}/public`, options),
  listUsers: (options = {}) => request("/users", options),
  deleteUser: (id) =>
    request(`/users/${id}`, {
      method: "DELETE"
    })
};
