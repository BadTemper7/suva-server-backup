import mongoose from "mongoose";

const { Schema } = mongoose;

const paymentTypeSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true, // Ensures no duplicates
      trim: true, // Remove leading/trailing spaces
    },
    isReceipt: {
      type: Boolean,
      default: false, // Defaults to false (meaning no receipt is required by default)
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Optional — shown to guests during payment so they can scan it (WT-06).
    qrCodeUrl: {
      type: String,
      default: null,
    },
    qrCodePublicId: {
      type: String,
      default: null,
    },
  },
  { timestamps: true } // Automatically add createdAt and updatedAt
);

const PaymentType = mongoose.model("PaymentType", paymentTypeSchema);

export default PaymentType;
