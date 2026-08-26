import { Hash, Home, MessageSquarePlus, Plus, UsersRound } from "lucide-react";

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
      <button className="sidebar-command" onClick={onHome}>
        <Home size={17} aria-hidden="true" /><span>Home</span>
      </button>
      <button className="sidebar-command" disabled={!user} onClick={onCreateCommunity}>
        <UsersRound size={17} aria-hidden="true" /><span>Create Community</span>
      </button>
      <button className="sidebar-command sidebar-create-post" disabled={!user} onClick={onCreatePost}>
        <MessageSquarePlus size={17} aria-hidden="true" /><span>Create Post</span>
      </button>
      <h3><Plus size={13} aria-hidden="true" /> Communities</h3>
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
              <Hash size={15} aria-hidden="true" /><span>{community.name}</span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
