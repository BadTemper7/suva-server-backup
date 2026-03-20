// models/Notification.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    // Who should see it? (optional: if null, treat as "system-wide")
    recipientUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Who triggered it? (optional)
    actorUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },

    // Matches your UI switch/cases
    type: {
      type: String,
      enum: ["reservation", "maintenance", "billing", "user"],
      required: true,
      index: true,
    },

    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },

    // Matches "Front Desk", "Maintenance", "Billing", "Admin"
    source: { type: String, required: true, trim: true },

    // UI wants "unread" boolean
    unread: { type: Boolean, default: true, index: true },

    // If you want read timestamp
    readAt: { type: Date, default: null },

    // Optional deep-link data (handy later)
    entity: {
      kind: { type: String, default: "" }, // e.g. "Reservation"
      id: { type: Schema.Types.ObjectId, default: null },
    },
  },
  { timestamps: true },
);

notificationSchema.index({ createdAt: -1 });

export const createNotification = async ({
  recipientUserId = null,
  actorUserId = null,
  type,
  title,
  description = "",
  source,
  entity = null,
}) => {
  try {
    const notification = new Notification({
      recipientUserId,
      actorUserId,
      type,
      title,
      description,
      source,
      unread: true,
      entity,
    });

    await notification.save();

    // Broadcast via WebSocket if needed
    // broadcast({ type: 'NEW_NOTIFICATION', notification });

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
  }
};

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
