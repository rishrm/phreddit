import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../api/client.js";
import SortButtons from "../components/SortButtons.jsx";
import PostList from "../components/PostList.jsx";

const PAGE_SIZE = 20;

export default function Home() {
  const { user, showMessage, refreshCurrentUser, refreshToken } = useOutletContext();
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flairs, setFlairs] = useState([]);
  const [selectedFlair, setSelectedFlair] = useState("");
  const [currentSort, setCurrentSort] = useState("newest");
  const requestIdRef = useRef(0);

  const load = useCallback(
    async (targetPage, append, signal) => {
      const requestId = ++requestIdRef.current;
      try {
        setLoading(true);
        setError("");
        const data = await api.getPosts({
          linkFlair: selectedFlair || undefined,
          sort: currentSort,
          page: targetPage,
          limit: PAGE_SIZE
        }, { signal });
        if (requestId !== requestIdRef.current) return;
        setPosts((previous) =>
          append ? [...previous, ...(data.posts || [])] : data.posts || []
        );
        setPage(data.page || targetPage);
        setTotal(data.total ?? 0);
        setHasMore(Boolean(data.hasMore));
      } catch (loadError) {
        if (loadError.name === "AbortError" || requestId !== requestIdRef.current) return;
        setError(loadError.message);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [selectedFlair, currentSort]
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(1, false, controller.signal);
    return () => controller.abort();
  }, [load, refreshToken]);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getLinkFlairs({ signal: controller.signal })
      .then((data) => setFlairs(data.linkFlairs || []))
      .catch((loadError) => {
        if (loadError.name !== "AbortError") setFlairs([]);
      });
    return () => controller.abort();
  }, [refreshToken]);

  return (
    <main className="card" aria-label="Home Page">
      <div className="page-header">
        <div>
          <h1>All Posts</h1>
          <p className="page-subtitle">Browse the latest conversations across Phreddit.</p>
        </div>
        <SortButtons currentSort={currentSort} onSortChange={setCurrentSort} />
      </div>
      <div className="filter-row">
        <label htmlFor="homeFlair">Flair</label>
        <select
          id="homeFlair"
          value={selectedFlair}
          onChange={(event) => setSelectedFlair(event.target.value)}
        >
          <option value="">All flairs</option>
          {flairs.map((flair) => (
            <option key={flair._id} value={flair._id}>{flair.content}</option>
          ))}
        </select>
        {selectedFlair && (
          <button type="button" onClick={() => setSelectedFlair("")}>Clear</button>
        )}
      </div>
      <p className="post-count">Showing {posts.length} of {total} posts</p>
      {error && (
        <p className="error-state" role="alert">
          {error}{" "}
          <button type="button" onClick={() => load(1, false)}>Retry</button>
        </p>
      )}
      {loading && posts.length === 0 ? (
        <p className="muted">Loading posts...</p>
      ) : (
        <div className="list-column">
          <PostList
            posts={posts}
            user={user}
            showMessage={showMessage}
            onUserRefresh={refreshCurrentUser}
          />
        </div>
      )}
      {hasMore && (
        <button type="button" disabled={loading} onClick={() => load(page + 1, true)}>
          {loading ? "Loading..." : "Load more posts"}
        </button>
      )}
    </main>
  );
}
