import { useId } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { displayNameOfUser, formatDate, userIdOf } from "../utils/format.jsx";
import RichText from "./RichText.jsx";

export default function CommentItem({ comment, user, postId, depth = 0, showMessage, onReload }) {
  const canVote = Boolean(user) && (user.reputation ?? 0) >= 50;
  const isOwnComment =
    user && String(userIdOf(comment.commentedBy)) === String(user._id);
  const voteHint = !canVote
    ? "Voting requires a reputation of at least 50."
    : isOwnComment
      ? "You cannot vote on your own comment."
      : undefined;
  const authorId = userIdOf(comment.commentedBy);
  const voteHintId = useId();
  const voteCountId = useId();

  async function vote(voteType) {
    if (!canVote || isOwnComment) return;
    try {
      const data = await api.voteComment(comment._id, voteType);
      showMessage(data.message, "success");
      await onReload();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  return (
    <article className={`comment-card comment-depth-${Math.min(depth, 6)}`}>
      <div className="meta-row">
        {authorId ? (
          <Link className="inline-link" to={`/users/${authorId}`}>
            <strong>{displayNameOfUser(comment.commentedBy)}</strong>
          </Link>
        ) : (
          <strong>{displayNameOfUser(comment.commentedBy)}</strong>
        )}
        <span>{formatDate(comment.createdAt)}</span>
      </div>
      <RichText text={comment.content} />
      {user && (
        <div className="action-row">
          <button
            type="button"
            aria-label="Upvote"
            aria-pressed={comment.userVote === "upvote"}
            aria-disabled={!canVote || isOwnComment}
            aria-describedby={`${voteCountId}${voteHint ? ` ${voteHintId}` : ""}`}
            className={comment.userVote === "upvote" ? "vote-btn active" : "vote-btn"}
            onClick={() => vote("upvote")}
          >
            ▲ {comment.upvotes ?? 0}
          </button>
          <button
            type="button"
            aria-label="Downvote"
            aria-pressed={comment.userVote === "downvote"}
            aria-disabled={!canVote || isOwnComment}
            aria-describedby={`${voteCountId}${voteHint ? ` ${voteHintId}` : ""}`}
            className={comment.userVote === "downvote" ? "vote-btn active" : "vote-btn"}
            onClick={() => vote("downvote")}
          >
            ▼ {comment.downvotes ?? 0}
          </button>
          <Link
            className="button-link"
            to={`/posts/${postId}/comments/new?parent=${comment._id}`}
          >
            Reply
          </Link>
        </div>
      )}
      <span id={voteCountId} className="sr-only">
        {comment.upvotes ?? 0} upvotes and {comment.downvotes ?? 0} downvotes.
      </span>
      {voteHint && <span id={voteHintId} className="sr-only">{voteHint}</span>}
      {!user && (
        <div className="meta-row">
          <span>Up: {comment.upvotes ?? 0}</span>
          <span>Down: {comment.downvotes ?? 0}</span>
        </div>
      )}
    </article>
  );
}
