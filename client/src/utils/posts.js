function countCommentTree(comments) {
  let total = 0;
  const stack = [...(comments || [])];
  while (stack.length > 0) {
    const comment = stack.pop();
    total += 1;
    if (Array.isArray(comment?.replies)) stack.push(...comment.replies);
  }
  return total;
}

export function commentCountOf(post) {
  const numericCount = Number(post.commentCount);
  if (Number.isFinite(numericCount)) {
    return numericCount;
  }

  return Array.isArray(post.comments) ? countCommentTree(post.comments) : 0;
}

export function isPostSavedByUser(user, postId) {
  if (!user || !postId) return false;
  return (user.savedPosts || []).some((savedPost) => (
    String(savedPost?._id || savedPost) === String(postId)
  ));
}

export function getJoinedCommunityIdSet(user) {
  const ids = (user?.joinedCommunities || [])
    .map((community) => String(community?._id || community))
    .filter(Boolean);
  return new Set(ids);
}

export function splitPostsByMembership(posts, user) {
  if (!user) {
    return { joinedPosts: [], otherPosts: posts };
  }
  const joinedIds = getJoinedCommunityIdSet(user);
  const joinedPosts = [];
  const otherPosts = [];
  for (const post of posts) {
    const communityId = String(post?.community?._id || post?.community || "");
    if (joinedIds.has(communityId)) {
      joinedPosts.push(post);
    } else {
      otherPosts.push(post);
    }
  }
  return { joinedPosts, otherPosts };
}

function scoreOf(comment) {
  return (comment.upvotes ?? 0) - (comment.downvotes ?? 0);
}

function createdTime(item) {
  const time = new Date(item.createdAt || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function sortComments(comments, mode = "newest") {
  const compare = mode === "top"
    ? (a, b) => scoreOf(b) - scoreOf(a) || createdTime(b) - createdTime(a)
    : (a, b) => createdTime(b) - createdTime(a);
  const pairs = (comments || []).map((comment) => ({
    source: comment,
    target: { ...comment, replies: [] }
  }));
  const roots = pairs.map(({ target }) => target);
  roots.sort(compare);

  const stack = [...pairs];
  while (stack.length > 0) {
    const { source, target } = stack.pop();
    const sourceReplies = Array.isArray(source?.replies) ? source.replies : [];
    const targetReplies = sourceReplies.map((reply) => ({ ...reply, replies: [] }));
    targetReplies.sort(compare);
    target.replies = targetReplies;
    for (let index = 0; index < sourceReplies.length; index += 1) {
      stack.push({ source: sourceReplies[index], target: targetReplies[index] });
    }
  }

  return roots;
}

export function flattenComments(comments) {
  const flattened = [];
  const stack = [...(comments || [])]
    .reverse()
    .map((comment) => ({ comment, depth: 0 }));

  while (stack.length > 0) {
    const item = stack.pop();
    flattened.push(item);
    const replies = Array.isArray(item.comment?.replies)
      ? item.comment.replies
      : [];
    for (let index = replies.length - 1; index >= 0; index -= 1) {
      stack.push({ comment: replies[index], depth: item.depth + 1 });
    }
  }
  return flattened;
}
