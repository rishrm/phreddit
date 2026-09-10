import { useCallback, useEffect, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";
import SortButtons from "../components/SortButtons.jsx";
import PostList from "../components/PostList.jsx";
import DiscoveryResults from "../components/DiscoveryResults.jsx";
import usePostFeed from "../hooks/usePostFeed.js";

export default function Search() {
  const { user, showMessage, refreshCurrentUser, refreshToken } = useOutletContext();
  const [searchParams] = useSearchParams();
  const query = (searchParams.get("q") || "").trim();

  const [flairs, setFlairs] = useState([]);
  const [selectedFlair, setSelectedFlair] = useState("");
  const [currentSort, setCurrentSort] = useState("newest");
  const [discovery, setDiscovery] = useState({
    communities: [],
    users: [],
    linkFlairs: []
  });
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryError, setDiscoveryError] = useState("");
  const { posts, total, nextCursor, searchTruncated, loading, error, retry, loadMore } = usePostFeed({
    search: query, linkFlair: selectedFlair || undefined,
    sort: currentSort, enabled: Boolean(query), refreshToken
  });

  const loadDiscovery = useCallback(async (signal) => {
    if (!query) {
      setDiscovery({ communities: [], users: [], linkFlairs: [] });
      setDiscoveryError("");
      setDiscoveryLoading(false);
      return;
    }
    try {
      setDiscoveryLoading(true);
      setDiscoveryError("");
      const data = await api.discover(query, { signal });
      setDiscovery({
        communities: data.communities || [],
        users: data.users || [],
        linkFlairs: data.linkFlairs || []
      });
    } catch (loadError) {
      if (loadError.name === "AbortError") return;
      setDiscoveryError(loadError.message);
    } finally {
      if (!signal?.aborted) setDiscoveryLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDiscovery(controller.signal);
    return () => controller.abort();
  }, [loadDiscovery, refreshToken]);

  useEffect(() => {
    setSelectedFlair("");
  }, [query]);

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

  const headerText = !query
    ? "Type a search above to find posts."
    : total === 0 && !loading
      ? `No post results for: ${query}`
      : `Results for: ${query}`;

  return (
    <main className="card" aria-label="Search Results Page">
      <div className="page-header">
        <div>
          <h1>Search</h1>
          <p className="page-subtitle">{headerText}</p>
        </div>
        <SortButtons currentSort={currentSort} onSortChange={setCurrentSort} />
      </div>
      <div className="filter-row">
        <label htmlFor="searchFlair">Flair</label>
        <select
          id="searchFlair"
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
      {query && (
        <DiscoveryResults
          results={discovery}
          loading={discoveryLoading}
          error={discoveryError}
          onRetry={() => loadDiscovery()}
          onSelectFlair={setSelectedFlair}
        />
      )}
      <p className="post-count">Showing {posts.length} of {total} posts</p>
      {searchTruncated && (
        <p className="muted" role="status">
          Search matched more than 5,000 posts. Refine the query for complete results.
        </p>
      )}
      {error && (
        <p className="error-state" role="alert">
          {error}{" "}
          <button type="button" onClick={retry}>Retry</button>
        </p>
      )}
      {loading && posts.length === 0 ? (
        <p className="muted">Searching...</p>
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
      {nextCursor && (
        <button type="button" disabled={loading} onClick={loadMore}>
          {loading ? "Loading..." : "Load more results"}
        </button>
      )}
    </main>
  );
}
