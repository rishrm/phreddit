// Converts a votable document (post or comment) into a client-safe object:
// strips the votedBy list (who voted is private) and exposes only the
// current user's own vote as `userVote`.
export function presentVotable(doc, currentUserId) {
  const plain =
    typeof doc?.toObject === "function" ? doc.toObject() : { ...doc };
  const votedBy = Array.isArray(plain.votedBy) ? plain.votedBy : [];

  let userVote = null;
  if (currentUserId) {
    const existing = votedBy.find(
      (vote) => String(vote.user) === String(currentUserId)
    );
    userVote = existing ? existing.voteType : null;
  }

  delete plain.votedBy;
  delete plain.__v;
  delete plain.id;
  return { ...plain, userVote };
}
