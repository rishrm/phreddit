import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";

export default function CreateComment() {
  const { user, showMessage, refreshData } = useOutletContext();
  const { postId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const parentComment = searchParams.get("parent") || null;
  const [postTitle, setPostTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadPostSummary = useCallback(async (signal) => {
    if (!postId) return;
    try {
      setLoading(true);
      setLoadError("");
      const data = await api.getPostSummary(postId, { signal });
      setPostTitle(data.post?.title || "Post");
    } catch (error) {
      if (error.name === "AbortError") return;
      setLoadError(error.message);
      showMessage(error.message, "error");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [postId, showMessage]);

  useEffect(() => {
    const controller = new AbortController();
    void loadPostSummary(controller.signal);
    return () => controller.abort();
  }, [loadPostSummary]);

  async function submit(event) {
    event.preventDefault();
    if (!content.trim()) return;
    try {
      setSubmitting(true);
      await api.createComment({
        post: postId,
        content: content.trim(),
        ...(parentComment ? { parentComment } : {})
      });
      refreshData();
      showMessage(parentComment ? "Reply added successfully." : "Comment added successfully.", "success");
      navigate(`/posts/${postId}`);
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) {
    return (
      <main className="card form-page">
        <h1>New Comment</h1>
        <p>You must be logged in to comment.</p>
        <Link className="inline-link" to={`/posts/${postId}`}>Return to post</Link>
      </main>
    );
  }

  return (
    <main className="card form-page" aria-label="New Comment Page">
      <p className="eyebrow">{parentComment ? "Replying in" : "Commenting on"}</p>
      <h1>New Comment</h1>
      <p className="page-subtitle">{postTitle || (loading ? "Loading post..." : "Post")}</p>
      {loadError && (
        <p className="error-state" role="alert">
          {loadError}{" "}
          <button type="button" onClick={() => loadPostSummary()}>Retry</button>
        </p>
      )}
      <form onSubmit={submit}>
        <label htmlFor="commentContent">Comment* (max 500 characters)</label>
        <textarea
          id="commentContent"
          autoFocus
          required
          maxLength={500}
          placeholder={parentComment ? "Write your reply" : "Share your response"}
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
        <p className="field-hint">{content.length}/500</p>
        <div className="action-row">
          <button
            className="primary"
            type="submit"
            disabled={loading || Boolean(loadError) || submitting || !content.trim()}
          >
            {submitting ? "Submitting..." : "Submit Comment"}
          </button>
          <button type="button" onClick={() => navigate(`/posts/${postId}`)}>
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}
