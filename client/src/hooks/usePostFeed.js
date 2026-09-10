import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client.js";
import { appendUniquePosts } from "../utils/posts.js";

export default function usePostFeed({
  community,
  search,
  linkFlair,
  sort,
  enabled = true,
  refreshToken
}) {
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const requestRef = useRef(null);

  const load = useCallback(async (cursor = null) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setError("");
    if (!cursor) {
      setPosts([]);
      setTotal(0);
      setNextCursor(null);
      setSearchTruncated(false);
    }
    setLoading(enabled);
    if (!enabled) return;

    try {
      const data = await api.getPosts({
        community, search, linkFlair, sort, cursor: cursor || undefined, limit: 20
      }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setPosts((previous) => cursor
        ? appendUniquePosts(previous, data.posts)
        : data.posts || []);
      if (Number.isSafeInteger(data.total)) setTotal(data.total);
      setNextCursor(data.nextCursor || null);
      setSearchTruncated(Boolean(data.searchTruncated));
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setError(loadError.code === "INVALID_POST_CURSOR"
        ? "This feed has changed. Retry to refresh the posts."
        : loadError.message);
      if (loadError.code === "INVALID_POST_CURSOR") setNextCursor(null);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [community, search, linkFlair, sort, enabled]);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load, refreshToken]);

  return {
    posts, total: Math.max(total, posts.length), nextCursor, searchTruncated, loading, error,
    retry: () => load(),
    loadMore: () => { if (!loading && nextCursor) void load(nextCursor); }
  };
}
