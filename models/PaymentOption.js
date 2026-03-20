import mongoose from "mongoose";

const { Schema } = mongoose;

const paymentOptionSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true, // Ensures no duplicates
      trim: true, // Remove leading/trailing spaces
    },
    paymentType: {
      type: String,
      enum: ["full", "partial"], // Only 'full' or 'partial' are allowed
      required: true,
    },
    amount: {
      type: Number,
      required: function () {
        return this.paymentType === "partial"; // 'amount' is required only for partial payments
      },
      min: 0,
      max: 100,
      validate: {
        validator: function (v) {
          // If the payment type is partial, the amount should be between 0 and 100 (percentage)
          if (this.paymentType === "partial" && (v <= 0 || v > 100)) {
            return false;
          }
          return true;
        },
        message:
          "Amount must be between 1 and 100 for partial payments (percentage)",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true } // Automatically add createdAt and updatedAt fields
);

const PaymentOption = mongoose.model("PaymentOption", paymentOptionSchema);

export default PaymentOption;
