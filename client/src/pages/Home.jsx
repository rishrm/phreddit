import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../api/client.js";
import SortButtons from "../components/SortButtons.jsx";
import PostList from "../components/PostList.jsx";
import usePostFeed from "../hooks/usePostFeed.js";

export default function Home() {
  const { user, showMessage, refreshCurrentUser, refreshToken } = useOutletContext();
  const [flairs, setFlairs] = useState([]);
  const [selectedFlair, setSelectedFlair] = useState("");
  const [currentSort, setCurrentSort] = useState("newest");
  const { posts, total, nextCursor, loading, error, retry, loadMore } = usePostFeed({
    linkFlair: selectedFlair || undefined, sort: currentSort, refreshToken
  });

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
          <button type="button" onClick={retry}>Retry</button>
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
      {nextCursor && (
        <button type="button" disabled={loading} onClick={loadMore}>
          {loading ? "Loading..." : "Load more posts"}
        </button>
      )}
    </main>
  );
}
