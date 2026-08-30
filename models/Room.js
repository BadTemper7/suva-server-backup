// models/Room.js
import mongoose from "mongoose";

const roomSchema = new mongoose.Schema(
  {
    roomNumber: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },

    images: [
      {
        url: { type: String, required: true },
        publicId: { type: String, required: true }, // for Cloudinary delete
      },
    ],

    roomType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RoomType",
    },

    capacity: {
      type: Number,
      required: true,
      min: 1,
    },
    category: {
      type: String,
      enum: ["room", "cottage"],
      default: "room",
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
    },
    hourlyRates: {
      hours3: { type: Number, default: 0, min: 0 },
      hours6: { type: Number, default: 0, min: 0 },
      hours12: { type: Number, default: 0, min: 0 },
    },

    // Add description field
    description: {
      type: String,
      trim: true,
      default: "",
    },

    status: {
      type: String,
      enum: ["active", "maintenance", "clean", "to-clean"],
      default: "active",
    },

    maintenanceReason: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true },
);

const Room = mongoose.model("Room", roomSchema);
export default Room;
