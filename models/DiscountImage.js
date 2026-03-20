import mongoose from "mongoose";

const { Schema } = mongoose;

const discountImageSchema = new Schema(
  {
    url: {
      type: String,
      required: true,
    },

    publicId: {
      type: String,
      required: true,
    },

    discountId: {
      type: Schema.Types.ObjectId,
      ref: "Discount",
      required: true,
      index: true,
    },

    // New reference to billing
    billingId: {
      type: Schema.Types.ObjectId,
      ref: "Billing",
      default: null,
      index: true,
    },

    status: {
      type: String,
      enum: ["pending", "confirmed", "rejected"],
      default: "pending",
      index: true,
    },

    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    rejectionReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

const DiscountImg = mongoose.model("DiscountImg", discountImageSchema);

export default DiscountImg;
