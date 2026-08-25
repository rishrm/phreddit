import Sidebar from "./Sidebar.jsx";

export default function AppShell({
  user,
  communities,
  selectedCommunityId,
  onHome,
  onOpenCommunity,
  onCreateCommunity,
  onCreatePost,
  children
}) {
  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        communities={communities}
        selectedCommunityId={selectedCommunityId}
        onHome={onHome}
        onOpenCommunity={onOpenCommunity}
        onCreateCommunity={onCreateCommunity}
        onCreatePost={onCreatePost}
      />
      <div id="main-content" className="view-stack" tabIndex={-1}>{children}</div>
    </div>
  );
}
