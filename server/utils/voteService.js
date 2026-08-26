import { reputationDeltaForVote } from "./voting.js";

// Applies a vote to a Post or Comment document atomically.
// Semantics: same vote again -> remove (toggle off); opposite vote -> switch; no vote -> add.
// Each branch is a single conditional findOneAndUpdate, so concurrent requests
// cannot double-count: a request whose precondition no longer holds simply
// falls through, and the final branch's `$ne` guard rejects duplicate inserts.
export async function applyVote(Model, docId, userId, voteType, { session = null } = {}) {
  const incField = voteType === "upvote" ? "upvotes" : "downvotes";
  const decField = voteType === "upvote" ? "downvotes" : "upvotes";
  const otherType = voteType === "upvote" ? "downvote" : "upvote";

  const removed = await Model.findOneAndUpdate(
    { _id: docId, votedBy: { $elemMatch: { user: userId, voteType } } },
    { $pull: { votedBy: { user: userId } }, $inc: { [incField]: -1 } },
    { new: true, ...(session ? { session } : {}) }
  );
  if (removed) {
    return {
      action: "removed",
      doc: removed,
      repDelta: -reputationDeltaForVote(voteType)
    };
  }

  const switched = await Model.findOneAndUpdate(
    { _id: docId, votedBy: { $elemMatch: { user: userId, voteType: otherType } } },
    {
      $set: { "votedBy.$.voteType": voteType },
      $inc: { [incField]: 1, [decField]: -1 }
    },
    { new: true, ...(session ? { session } : {}) }
  );
  if (switched) {
    return {
      action: "switched",
      doc: switched,
      repDelta: reputationDeltaForVote(voteType) - reputationDeltaForVote(otherType)
    };
  }

  const added = await Model.findOneAndUpdate(
    { _id: docId, "votedBy.user": { $ne: userId } },
    { $push: { votedBy: { user: userId, voteType } }, $inc: { [incField]: 1 } },
    { new: true, ...(session ? { session } : {}) }
  );
  if (added) {
    return {
      action: "added",
      doc: added,
      repDelta: reputationDeltaForVote(voteType)
    };
  }

  return null;
}
