import mongoose from "mongoose";

const roomTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      required: true,
    },
  },
  { timestamps: true }
);

const RoomType = mongoose.model("RoomType", roomTypeSchema);
export default RoomType;
