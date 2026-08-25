export default function Sidebar({
  user,
  communities,
  selectedCommunityId,
  onHome,
  onOpenCommunity,
  onCreateCommunity,
  onCreatePost
}) {
  return (
    <aside className="sidebar">
      <h3>Navigation</h3>
      <button onClick={onHome}>Home</button>
      <button disabled={!user} onClick={onCreateCommunity}>
        Create Community
      </button>
      <button disabled={!user} onClick={onCreatePost}>
        Create Post
      </button>
      <h3>Communities</h3>
      <div className="list-column">
        {communities.length === 0 ? (
          <p className="muted">No communities yet.</p>
        ) : (
          communities.map((community) => (
            <button
              key={community._id}
              aria-current={String(selectedCommunityId) === String(community._id) ? "page" : undefined}
              className={String(selectedCommunityId) === String(community._id) ? "link-button active" : "link-button"}
              onClick={() => onOpenCommunity(community._id)}
            >
              {community.name}
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
