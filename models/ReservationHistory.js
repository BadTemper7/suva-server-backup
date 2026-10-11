// models/ReservationHistory.js
import mongoose from "mongoose";

const { Schema } = mongoose;

// Append-only audit trail of who changed what on a reservation (see WT-04).
// No update/delete routes are ever added for this model — entries are
// write-once so history can't be edited after the fact.
const reservationHistorySchema = new Schema(
  {
    reservationId: {
      type: Schema.Types.ObjectId,
      ref: "Reservation",
      required: true,
      index: true,
    },
    // null = system/cron-driven change (e.g. auto-expiry), not a staff action.
    actorUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Denormalized snapshot so history still reads correctly if the user
    // account is later deleted or renamed.
    actorLabel: {
      type: String,
      default: "System",
    },
    action: {
      type: String,
      enum: [
        "status_changed",
        "dates_changed",
        "room_added",
        "room_removed",
        "room_transferred",
        "addon_changed",
      ],
      required: true,
    },
    summary: {
      type: String,
      required: true,
    },
    changes: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true },
);

reservationHistorySchema.index({ reservationId: 1, createdAt: -1 });

const ReservationHistory = mongoose.model(
  "ReservationHistory",
  reservationHistorySchema,
);
export default ReservationHistory;
