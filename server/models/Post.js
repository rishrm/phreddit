import mongoose from "mongoose";

const voteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    voteType: {
      type: String,
      enum: ["upvote", "downvote"],
      required: true
    }
  },
  { _id: false }
);

const postSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20000
    },
    linkFlair: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LinkFlair",
      default: null
    },
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    community: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Community",
      required: true
    },
    views: {
      type: Number,
      default: 0
    },
    comments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Comment"
      }
    ],
    commentCount: {
      type: Number,
      min: 0,
      default: 0
    },
    latestCommentAt: {
      type: Date,
      default: null
    },
    upvotes: {
      type: Number,
      default: 0
    },
    downvotes: {
      type: Number,
      default: 0
    },
    votedBy: [voteSchema]
  },
  { timestamps: true }
);

postSchema.index({ title: "text", content: "text" });
postSchema.index({ community: 1, createdAt: -1 });
postSchema.index({ createdAt: -1, _id: -1 });
postSchema.index({ linkFlair: 1, createdAt: -1 });
postSchema.index({ postedBy: 1, createdAt: -1 });
postSchema.index({ latestCommentAt: -1, createdAt: -1, _id: -1 });
postSchema.index({ "votedBy.user": 1 });

export default mongoose.model("Post", postSchema);
