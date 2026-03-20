import mongoose from "mongoose";

const { Schema } = mongoose;

const discountSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    discountPercent: { type: Number, min: 0, max: 100 },
    isActive: { type: Boolean, default: true },

    appliesToAllRooms: { type: Boolean, default: false },
    maxRoomCount: { type: Number, default: null },

    discountPriority: {
      type: String,
      enum: ["highest", "lowest"],
      default: "highest",
    },

    isPerId: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const Discount = mongoose.model("Discount", discountSchema);
export default Discount;
