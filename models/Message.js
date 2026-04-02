// models/Message.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const messageSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["unread", "read", "replied"],
      default: "unread",
      index: true,
    },
    repliedAt: {
      type: Date,
    },
    reply: {
      message: String,
      repliedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", // Admin user
      },
      repliedAt: Date,
    },
    guestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Guest", // Reference to Guest model
      // index: true,
    },
    ipAddress: String,
    userAgent: String,
  },
  { timestamps: true },
);

// Add indexes for faster queries
messageSchema.index({ status: 1, createdAt: -1 });
messageSchema.index({ email: 1, createdAt: -1 });
messageSchema.index({ guestId: 1 });

const Message = mongoose.model("Message", messageSchema);
export default Message;
