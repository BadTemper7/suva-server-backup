import mongoose from "mongoose";

const billingSchema = new mongoose.Schema(
  {
    billingNumber: {
      type: String,
      unique: true,
      index: true,
      sparse: true, // Allows null values for uniqueness
    },
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reservation",
      required: true,
      unique: true,
      index: true,
    },

    subTotal: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    // Running totals (computed when receipts change)
    amountPaid: { type: Number, default: 0, min: 0 },
    balance: { type: Number, default: 0, min: 0 },

    status: {
      type: String,
      enum: ["unpaid", "partial", "paid", "free", "refunded", "voided"],
      default: "unpaid",
      index: true,
    },
    refundAmount: { type: Number, default: 0, min: 0 },
    isRefundable: { type: Boolean, default: false },
    isComplimentary: { type: Boolean, default: false, index: true },
    amountDueNow: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtual populate receipts
billingSchema.virtual("receipts", {
  ref: "Receipt",
  localField: "_id",
  foreignField: "billingId",
  justOne: false,
});

billingSchema.pre("save", function (next) {
  // If status is already refunded, don't change it
  if (this.status === "refunded" || this.status === "voided") {
    return next();
  }

  this.totalAmount = Number(this.totalAmount || 0);
  this.amountPaid = Number(this.amountPaid || 0);
  // Preserve explicit complimentary flag while still auto-marking zero-amount bills.
  this.isComplimentary = Boolean(this.isComplimentary) || this.totalAmount <= 0;

  // Complimentary billings should have an explicit "free" status for UI clarity.
  if (this.isComplimentary) {
    this.balance = 0;
    this.amountDueNow = 0;
    this.status = "free";
    return next();
  }

  // Compute balance
  this.balance = Math.max(0, this.totalAmount - this.amountPaid);

  // Determine billing status based on amountDueNow
  if (this.amountPaid <= 0) this.status = "unpaid";
  else if (this.amountPaid >= this.totalAmount) this.status = "paid";
  else if (this.amountPaid >= (this.amountDueNow || 0)) this.status = "partial";
  else this.status = "unpaid";

  next();
});
// Generate billing number
billingSchema.statics.generateBillingNumber = async function () {
  const currentYear = new Date().getFullYear();
  const prefix = `BILL-${currentYear}-`;

  // Find the highest billing number for this year
  const lastBilling = await this.findOne({
    billingNumber: new RegExp(`^${prefix}`),
  }).sort({ billingNumber: -1 });

  let sequence = 1;
  if (lastBilling && lastBilling.billingNumber) {
    const lastSequence = parseInt(lastBilling.billingNumber.split("-").pop());
    if (!isNaN(lastSequence)) {
      sequence = lastSequence + 1;
    }
  }

  // Format sequence with leading zeros (4 digits)
  const formattedSequence = sequence.toString().padStart(4, "0");
  return `${prefix}${formattedSequence}`;
};

const Billing = mongoose.model("Billing", billingSchema);
export default Billing;
