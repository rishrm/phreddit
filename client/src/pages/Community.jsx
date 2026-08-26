import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import SortButtons from "../components/SortButtons.jsx";
import PostCard from "../components/PostCard.jsx";
import RichText from "../components/RichText.jsx";
import { displayNameOfUser, formatDate } from "../utils/format.jsx";

const PAGE_SIZE = 20;

export default function Community() {
  const { user, showMessage, refreshCurrentUser, refreshToken } = useOutletContext();
  const { communityId } = useParams();
  const navigate = useNavigate();

  const [community, setCommunity] = useState(null);
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [communityLoading, setCommunityLoading] = useState(true);
  const [communityError, setCommunityError] = useState("");
  const [postsError, setPostsError] = useState("");
  const [currentSort, setCurrentSort] = useState("newest");
  const [membershipPending, setMembershipPending] = useState(false);
  const postsRequestRef = useRef(0);

  useEffect(() => {
    if (!communityId) return;
    const controller = new AbortController();
    setCommunity(null);
    setCommunityLoading(true);
    setCommunityError("");
    api
      .getCommunity(communityId, { signal: controller.signal })
      .then((data) => setCommunity(data.community))
      .catch((error) => {
        if (error.name === "AbortError") return;
        setCommunityError(error.message);
        showMessage(error.message, "error");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCommunityLoading(false);
      });
    return () => controller.abort();
  }, [communityId, showMessage]);

  const loadPosts = useCallback(
    async (targetPage, append, signal) => {
      if (!communityId) return;
      const requestId = ++postsRequestRef.current;
      try {
        setLoading(true);
        setPostsError("");
        const data = await api.getPosts({
          community: communityId,
          sort: currentSort,
          page: targetPage,
          limit: PAGE_SIZE
        }, { signal });
        if (requestId !== postsRequestRef.current) return;
        setPosts((previous) =>
          append ? [...previous, ...(data.posts || [])] : data.posts || []
        );
        setPage(data.page || targetPage);
        setTotal(data.total ?? 0);
        setHasMore(Boolean(data.hasMore));
      } catch (error) {
        if (error.name === "AbortError" || requestId !== postsRequestRef.current) return;
        setPostsError(error.message);
        showMessage(error.message, "error");
      } finally {
        if (requestId === postsRequestRef.current) setLoading(false);
      }
    },
    [communityId, currentSort, showMessage]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadPosts(1, false, controller.signal);
    return () => controller.abort();
  }, [loadPosts, refreshToken]);

  const isJoined = Boolean(user && community?.isJoined);

  async function toggleMembership() {
    if (!community || membershipPending) return;
    const joining = !isJoined;
    try {
      setMembershipPending(true);
      if (!joining) {
        await api.leaveCommunity(community._id);
        showMessage("Left community successfully.", "success");
      } else {
        await api.joinCommunity(community._id);
        showMessage("Joined community successfully.", "success");
      }
      setCommunity((current) => current ? {
        ...current,
        isJoined: joining,
        memberCount: Math.max(0, (current.memberCount ?? 0) + (joining ? 1 : -1))
      } : current);
      await refreshCurrentUser();
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      setMembershipPending(false);
    }
  }

  if (!community) {
    return (
      <main className="card">
        <h1>Community</h1>
        {communityError ? (
          <div className="error-state" role="alert">
            <p>{communityError}</p>
            <button type="button" onClick={() => navigate("/home")}>Back Home</button>
          </div>
        ) : communityLoading ? (
          <p>Loading community...</p>
        ) : (
          <p>This community is unavailable.</p>
        )}
      </main>
    );
  }

  return (
    <main className="card" aria-label="Community Page">
      <div className="page-header">
        <div>
          <h1>{community.name}</h1>
          <div className="page-subtitle">
            <RichText text={community.description} />
          </div>
        </div>
        <SortButtons currentSort={currentSort} onSortChange={setCurrentSort} />
      </div>
      <p className="meta-row">
        <span>Creator: {displayNameOfUser(community.creator)}</span>
        <span>Created: {formatDate(community.createdAt)}</span>
        <span>Members: {community.memberCount ?? 0}</span>
      </p>
      {user && (
        <button type="button" disabled={membershipPending} onClick={toggleMembership}>
          {membershipPending
            ? "Updating..."
            : isJoined
              ? "Leave Community"
              : "Join Community"}
        </button>
      )}
      <button onClick={() => navigate("/home")}>Back Home</button>
      <p className="post-count">Showing {posts.length} of {total} posts</p>
      {postsError && (
        <p className="error-state" role="alert">
          {postsError}{" "}
          <button type="button" onClick={() => loadPosts(1, false)}>Retry</button>
        </p>
      )}
      <div className="list-column">
        {loading && posts.length === 0 ? (
          <p className="muted">Loading posts...</p>
        ) : posts.length === 0 ? (
          <p>No posts in this community yet.</p>
        ) : (
          posts.map((post) => (
            <PostCard
              key={post._id}
              post={post}
              user={user}
              showMessage={showMessage}
              onUserRefresh={refreshCurrentUser}
              showCommunity={false}
            />
          ))
        )}
      </div>
      {hasMore && (
        <button type="button" disabled={loading} onClick={() => loadPosts(page + 1, true)}>
          {loading ? "Loading..." : "Load more posts"}
        </button>
      )}
    </main>
  );
}
