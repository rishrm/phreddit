import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      maxlength: 254
    },
    displayName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
      maxlength: 50
    },
    passwordHash: {
      type: String,
      required: true,
      select: false
    },
    reputation: {
      type: Number,
      default: 100
    },
    isAdmin: {
      type: Boolean,
      default: false
    },
    joinedCommunities: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Community"
      }
    ],
    createdCommunities: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Community"
      }
    ],
    createdPosts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post"
      }
    ],
    createdComments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Comment"
      }
    ],
    savedPosts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post"
      }
    ]
  },
  { timestamps: true }
);

userSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model("User", userSchema);
