import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import EditableItemRow from "../components/EditableItemRow.jsx";
import RichText from "../components/RichText.jsx";
import { formatDate } from "../utils/format.jsx";

const REPORT_FILTERS = [
  { id: "pending", label: "Pending" },
  { id: "dismissed", label: "Dismissed" },
  { id: "content_removed", label: "Removed" },
  { id: "all", label: "All activity" }
];

const REPORT_STATUS_LABELS = {
  pending: "Pending",
  processing: "In progress",
  dismissed: "Dismissed",
  content_removed: "Content removed"
};

export default function Profile() {
  const { user, showMessage, refreshCurrentUser, refreshToken } = useOutletContext();
  const { userId: viewedUserId } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [reportStatus, setReportStatus] = useState("pending");
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState("");
  const [activeTab, setActiveTab] = useState("posts");
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [localRefresh, setLocalRefresh] = useState(0);
  const [profileError, setProfileError] = useState("");

  const isViewingOther = Boolean(viewedUserId) && String(viewedUserId) !== String(user?._id || "");
  const profileTargetId = viewedUserId || user?._id;

  useEffect(() => {
    setActiveTab(user?.isAdmin && !isViewingOther ? "users" : "posts");
    setEditing(null);
  }, [viewedUserId, user?.isAdmin, isViewingOther]);

  useEffect(() => {
    if (!profileTargetId) return;
    const controller = new AbortController();
    setProfile(null);
    setProfileError("");
    api
      .getProfileContent(profileTargetId, { signal: controller.signal })
      .then((data) => setProfile(data))
      .catch((error) => {
        if (error.name === "AbortError") return;
        setProfileError(error.message);
        showMessage(error.message, "error");
      });
    return () => controller.abort();
  }, [profileTargetId, showMessage, refreshToken, localRefresh]);

  useEffect(() => {
    if (!user?.isAdmin) return;
    const controller = new AbortController();
    api
      .listUsers({ signal: controller.signal })
      .then((data) => setUsers(data.users || []))
      .catch((error) => {
        if (error.name !== "AbortError") showMessage(error.message, "error");
      });
    return () => controller.abort();
  }, [user, showMessage, refreshToken, localRefresh]);

  useEffect(() => {
    if (!user?.isAdmin || isViewingOther) return;
    const controller = new AbortController();
    setReports([]);
    setReportsLoading(true);
    setReportsError("");
    api
      .listReports({ status: reportStatus }, { signal: controller.signal })
      .then((data) => setReports(data.reports || []))
      .catch((error) => {
        if (error.name === "AbortError") return;
        setReportsError(error.message);
        showMessage(error.message, "error");
      })
      .finally(() => {
        if (!controller.signal.aborted) setReportsLoading(false);
      });
    return () => controller.abort();
  }, [
    user,
    isViewingOther,
    reportStatus,
    showMessage,
    refreshToken,
    localRefresh
  ]);

  function refresh() {
    setLocalRefresh((n) => n + 1);
  }

  async function runConfirm(note) {
    const pending = confirm;
    setConfirm(null);
    if (!pending) return;
    try {
      await pending.run(note);
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  function requestDeleteUser(targetUser) {
    setConfirm({
      title: `Delete user ${targetUser.displayName}?`,
      body: "All of their communities, posts, and comments will also be deleted. This cannot be undone.",
      danger: true,
      run: async () => {
        await api.deleteUser(targetUser._id);
        showMessage("User deleted successfully.", "success");
        if (String(viewedUserId) === String(targetUser._id)) {
          navigate("/profile");
        }
        refresh();
        refreshCurrentUser();
      }
    });
  }

  function requestDelete(kind, item) {
    const label =
      kind === "post" ? `post "${item.title}"` :
      kind === "community" ? `community "${item.name}"` :
      "this comment";
    const body =
      kind === "community"
        ? "Its posts and comments will also be deleted. This cannot be undone."
        : "This cannot be undone.";
    setConfirm({
      title: `Delete ${label}?`,
      body,
      danger: true,
      run: async () => {
        if (kind === "post") await api.deletePost(item._id);
        else if (kind === "community") await api.deleteCommunity(item._id);
        else await api.deleteComment(item._id);
        showMessage(`${kind[0].toUpperCase() + kind.slice(1)} deleted successfully.`, "success");
        refresh();
        refreshCurrentUser();
      }
    });
  }

  function requestResolveReport(report, action) {
    const reportedTitle = report.targetPost?.title || report.contentSnapshot?.title || "removed post";
    setConfirm({
      title: action === "delete_post"
        ? `Delete reported post "${reportedTitle}"?`
        : "Dismiss this report?",
      body: action === "delete_post"
        ? "The post and all of its comments will be removed."
        : `Report reason: ${report.reason}.`,
      danger: action === "delete_post",
      showNote: true,
      noteLabel: "Resolution note (optional, visible to admins)",
      run: async (note) => {
        const data = await api.resolveReport(report._id, {
          action,
          ...(note ? { note } : {})
        });
        showMessage(data.message, "success");
        refresh();
        refreshCurrentUser();
      }
    });
  }

  async function submitEdit(event) {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      if (editing.kind === "post") {
        await api.updatePost(editing.item._id, {
          title: form.get("title"),
          content: form.get("content")
        });
      } else if (editing.kind === "community") {
        await api.updateCommunity(editing.item._id, {
          name: form.get("name"),
          description: form.get("description")
        });
      } else {
        await api.updateComment(editing.item._id, {
          content: form.get("content")
        });
      }
      showMessage(`${editing.kind[0].toUpperCase() + editing.kind.slice(1)} updated successfully.`, "success");
      setEditing(null);
      refresh();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  async function removeSavedPost(post) {
    try {
      await api.unsavePost(post._id);
      showMessage("Post removed from saved posts.", "success");
      refresh();
      refreshCurrentUser();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  if (!user) {
    return (
      <main className="card">
        <h1>Guest Profile</h1>
        <p>You are browsing as a guest. Log in to see your profile.</p>
      </main>
    );
  }

  const displayUser = isViewingOther ? profile?.user : user;

  const tabs = [
    { id: "posts", label: "Posts" },
    { id: "saved", label: "Saved" },
    { id: "communities", label: "Communities" },
    { id: "comments", label: "Comments" },
    ...(user.isAdmin && !isViewingOther ? [{ id: "moderation", label: "Moderation" }] : []),
    ...(user.isAdmin && !isViewingOther ? [{ id: "users", label: "Users" }] : [])
  ];

  function moveTab(event, index) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let targetIndex = index;
    if (event.key === "ArrowLeft") targetIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "ArrowRight") targetIndex = (index + 1) % tabs.length;
    if (event.key === "Home") targetIndex = 0;
    if (event.key === "End") targetIndex = tabs.length - 1;
    const target = tabs[targetIndex];
    setActiveTab(target.id);
    document.getElementById(`profile-tab-${target.id}`)?.focus();
  }

  return (
    <main className="card" aria-label="Profile Page">
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title || ""}
        body={confirm?.body}
        danger={confirm?.danger}
        showNote={confirm?.showNote}
        noteLabel={confirm?.noteLabel}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />

      {isViewingOther && (
        <button onClick={() => navigate("/profile")}>
          Back to your admin profile
        </button>
      )}
      <h1>{isViewingOther ? `${displayUser?.displayName || "User"}'s Profile` : "Profile"}</h1>
      {displayUser ? (
        <>
          <p><strong>Display name:</strong> {displayUser.displayName}</p>
          <p><strong>Email:</strong> {displayUser.email}</p>
          <p><strong>Member since:</strong> {formatDate(displayUser.createdAt)}</p>
          <p><strong>Reputation:</strong> {displayUser.reputation}</p>
        </>
      ) : (
        <p className="muted">Loading profile...</p>
      )}

      <div className="tab-row" role="tablist">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`profile-tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`profile-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={activeTab === tab.id ? "tab active" : "tab"}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => moveTab(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {editing && (
        <form className="edit-form" onSubmit={submitEdit}>
          <h3>Edit {editing.kind}</h3>
          {editing.kind === "post" && (
            <>
              <label>Title<input name="title" defaultValue={editing.item.title} required maxLength={100} /></label>
              <label>Content<textarea name="content" defaultValue={editing.item.content} required maxLength={20000} /></label>
            </>
          )}
          {editing.kind === "community" && (
            <>
              <label>Name<input name="name" defaultValue={editing.item.name} required maxLength={100} /></label>
              <label>Description<textarea name="description" defaultValue={editing.item.description} required maxLength={500} /></label>
            </>
          )}
          {editing.kind === "comment" && (
            <label>Content<textarea name="content" defaultValue={editing.item.content} required maxLength={500} /></label>
          )}
          <div className="row-card-actions">
            <button className="primary" type="submit">Save</button>
            <button type="button" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      {profileError && (
        <p className="error-state" role="alert">
          {profileError}{" "}
          <button type="button" onClick={refresh}>Retry</button>
        </p>
      )}

      {activeTab === "posts" && (
        <div
          id="profile-panel-posts"
          className="list-column"
          role="tabpanel"
          aria-labelledby="profile-tab-posts"
        >
          {(profile?.posts || []).length === 0 ? <p>No posts yet.</p> :
            profile.posts.map((post) => (
              <EditableItemRow
                key={post._id}
                title={post.title}
                subtitle={post.community?.name ? `in ${post.community.name}` : ""}
                onEdit={() => setEditing({ kind: "post", item: post })}
                onDelete={() => requestDelete("post", post)}
              />
            ))}
        </div>
      )}

      {activeTab === "communities" && (
        <div
          id="profile-panel-communities"
          className="list-column"
          role="tabpanel"
          aria-labelledby="profile-tab-communities"
        >
          {(profile?.communities || []).length === 0 ? <p>No communities yet.</p> :
            profile.communities.map((community) => (
              <EditableItemRow
                key={community._id}
                title={community.name}
                subtitle={community.description}
                onEdit={() => setEditing({ kind: "community", item: community })}
                onDelete={() => requestDelete("community", community)}
              />
            ))}
        </div>
      )}

      {activeTab === "saved" && (
        <div
          id="profile-panel-saved"
          className="list-column"
          role="tabpanel"
          aria-labelledby="profile-tab-saved"
        >
          {(profile?.savedPosts || []).length === 0 ? <p>No saved posts yet.</p> :
            profile.savedPosts.map((post) => (
              <div key={post._id} className="row-card">
                <div className="row-card-text">
                  <span className="row-card-title">{post.title}</span>
                  <span className="row-card-subtitle">
                    {post.community?.name ? `in ${post.community.name}` : "Saved post"} | Comments: {post.commentCount ?? 0}
                  </span>
                </div>
                <div className="row-card-actions">
                  <button onClick={() => navigate(`/posts/${post._id}`)}>Open</button>
                  {!isViewingOther && (
                    <button onClick={() => removeSavedPost(post)}>Remove</button>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}

      {activeTab === "comments" && (
        <div
          id="profile-panel-comments"
          className="list-column"
          role="tabpanel"
          aria-labelledby="profile-tab-comments"
        >
          {(profile?.comments || []).length === 0 ? <p>No comments yet.</p> :
            profile.comments.map((comment) => (
              <EditableItemRow
                key={comment._id}
                title={comment.post?.title || "Deleted post"}
                subtitle={comment.content.length > 20 ? `${comment.content.slice(0, 20)}...` : comment.content}
                onEdit={() => setEditing({ kind: "comment", item: comment })}
                onDelete={() => requestDelete("comment", comment)}
              />
            ))}
        </div>
      )}

      {activeTab === "users" && user.isAdmin && !isViewingOther && (
        <div
          id="profile-panel-users"
          className="list-column"
          role="tabpanel"
          aria-labelledby="profile-tab-users"
        >
          {users.length === 0 ? (
            <p>No users found.</p>
          ) : (
            users.map((listedUser) => (
              <div key={listedUser._id} className="row-card">
                <div className="row-card-text">
                  <span className="row-card-title">{listedUser.displayName}</span>
                  <span className="row-card-subtitle">{listedUser.email} | Rep: {listedUser.reputation}</span>
                </div>
                <div className="row-card-actions">
                  <button onClick={() => navigate(`/profile/${listedUser._id}`)}>Manage content</button>
                  <button className="danger" onClick={() => requestDeleteUser(listedUser)}>Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "moderation" && user.isAdmin && !isViewingOther && (
        <div
          id="profile-panel-moderation"
          className="list-column"
          role="tabpanel"
          aria-labelledby="profile-tab-moderation"
        >
          <div className="moderation-toolbar">
            <span className="muted">Review queue and resolution history</span>
            <div className="action-row" role="group" aria-label="Filter moderation activity">
              {REPORT_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={reportStatus === filter.id}
                  className={reportStatus === filter.id ? "active" : ""}
                  onClick={() => setReportStatus(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          {reportsError ? (
            <p className="error-state" role="alert">
              {reportsError}{" "}
              <button type="button" onClick={refresh}>Retry</button>
            </p>
          ) : reportsLoading ? (
            <p className="muted" role="status">Loading moderation activity...</p>
          ) : reports.length === 0 ? (
            <p>No moderation activity matches this filter.</p>
          ) : (
            reports.map((report) => {
              const snapshot = report.contentSnapshot || {};
              const title = report.targetPost?.title || snapshot.title || "Removed post";
              const communityName = report.targetPost?.community?.name || snapshot.communityName;
              const content = report.targetPost?.content || snapshot.content;
              const processing = report.status === "processing";
              const resolved = ["dismissed", "content_removed"].includes(report.status);
              return (
                <div key={report._id} className="row-card moderation-card">
                  <div className="row-card-text">
                    <span className="row-card-title">{title}</span>
                    <span className={`moderation-status moderation-status--${report.status}`}>
                      {REPORT_STATUS_LABELS[report.status] || report.status}
                    </span>
                    <span className="row-card-subtitle">
                      {report.reason} report from {report.reportedBy?.displayName || "Unknown user"}
                      {communityName ? ` in ${communityName}` : ""}
                    </span>
                    {content && <RichText text={content.slice(0, 500)} />}
                    {report.details && <span className="row-card-subtitle">{report.details}</span>}
                    {processing && <span className="row-card-subtitle">Resolution in progress...</span>}
                    {resolved && (
                      <span className="row-card-subtitle">
                        Resolved {formatDate(report.resolvedAt)}
                        {report.resolvedBy?.displayName
                          ? ` by ${report.resolvedBy.displayName}`
                          : ""}
                      </span>
                    )}
                    {report.resolutionNote && (
                      <span className="row-card-subtitle">
                        Resolution note: {report.resolutionNote}
                      </span>
                    )}
                  </div>
                  <div className="row-card-actions">
                    {report.targetPost && (
                      <button onClick={() => navigate(`/posts/${report.targetPost._id}`)}>Open</button>
                    )}
                    {!resolved && (
                      <>
                        <button
                          disabled={processing}
                          onClick={() => requestResolveReport(report, "dismiss")}
                        >
                          Dismiss
                        </button>
                        <button
                          className="danger"
                          disabled={processing}
                          onClick={() => requestResolveReport(report, "delete_post")}
                        >
                          Delete post
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </main>
  );
}
