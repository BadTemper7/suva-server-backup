import mongoose from "mongoose";

const receiptImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false },
);

const receiptSchema = new mongoose.Schema(
  {
    billingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Billing",
      required: true,
      index: true,
    },

    paymentType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentType",
      required: true,
    },

    amountPaid: { type: Number, min: 0, required: true },
    amountReceived: { type: Number, min: 0, required: true },

    status: {
      type: String,
      enum: ["confirmed", "pending", "rejected"],
      default: "pending",
    },

    change: { type: Number, default: 0, min: 0 },

    // Reference number (for GCash, Maya, Bank Transfer, etc.)
    referenceNumber: {
      type: String,
      trim: true,
      default: null,
    },

    receiptImages: { type: [receiptImageSchema], default: [] },

    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

receiptSchema.index({ billingId: 1, createdAt: -1 });
receiptSchema.index({ referenceNumber: 1 });

const Receipt = mongoose.model("Receipt", receiptSchema);
export default Receipt;
