import mongoose from "mongoose";

const linkFlairSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      maxlength: 30
    }
  },
  { timestamps: true }
);

linkFlairSchema.index({ content: "text" }, { name: "flair_discovery" });

export default mongoose.model("LinkFlair", linkFlairSchema);
