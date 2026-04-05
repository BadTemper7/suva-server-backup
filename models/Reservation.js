// models/Reservation.js
import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

const { Schema } = mongoose;

const reservationRoomSchema = new Schema(
  {
    reservationId: {
      type: Schema.Types.ObjectId,
      ref: "Reservation",
      required: true,
    },
    roomId: {
      type: Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    // Array of add-ons for this room with quantity
    addOns: [
      {
        addOnId: {
          type: Schema.Types.ObjectId,
          ref: "AddOn",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
      },
    ],
  },
  { _id: true },
);

const reservationSchema = new Schema(
  {
    reservationNumber: {
      type: String,
      unique: true,
      index: true,
    },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },

    adults: { type: Number, required: true, min: 1 },
    children: { type: Number, default: 0, min: 0 },

    guestId: { type: Schema.Types.ObjectId, ref: "Guest", required: true },
    notes: { type: String, default: "" },

    paymentOption: {
      type: Schema.Types.ObjectId,
      ref: "PaymentOption",
      required: true,
    },

    nights: { type: Number, required: true, min: 1 },

    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "cancelled",
        "checked_in",
        "checked_out",
        "expired",
        "no_show",
      ],
      default: "pending",
      index: true,
    },
    cancelReason: { type: String, default: "", trim: true, maxlength: 500 },
    discountId: { type: Schema.Types.ObjectId, ref: "Discount" },
    expiresAt: {
      type: Date,
      default: null,
    },

    userId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// Middleware to set reservationNumber
reservationSchema.pre("save", function (next) {
  if (!this.reservationNumber) {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0");
    this.reservationNumber = `RES-${timestamp}${random}`;
  }

  next();
});

// Create indexes separately (avoids duplicate index warnings)
reservationSchema.index({ checkIn: 1, checkOut: 1 });
reservationSchema.index({ guestId: 1, createdAt: -1 });

// TTL index for expired pending reservations - ONLY define it here
reservationSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { status: "pending" },
  },
);

// Export models for Reservation, ReservationRoom, and ReservationAddOn
const Reservation = mongoose.model("Reservation", reservationSchema);
const ReservationRoom = mongoose.model(
  "ReservationRoom",
  reservationRoomSchema,
);

export default { Reservation, ReservationRoom };
