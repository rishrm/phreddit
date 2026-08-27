import mongoose from "mongoose";

const communitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 100,
      index: true
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],
    posts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post"
      }
    ]
  },
  { timestamps: true }
);

communitySchema.index(
  { name: "text", description: "text" },
  { weights: { name: 5, description: 1 }, name: "community_discovery" }
);

export default mongoose.model("Community", communitySchema);
