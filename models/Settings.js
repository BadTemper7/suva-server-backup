// src/models/Settings.js
import mongoose from "mongoose";

const settingSchema = new mongoose.Schema(
  {
    settingType: {
      type: String,
      required: true,
      enum: ["system", "security"],
      default: "system",
    },
    key: {
      type: String,
      required: true,
      unique: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    label: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    dataType: {
      type: String,
      enum: ["string", "number", "boolean", "json", "file"],
      default: "string",
    },
    isEditable: {
      type: Boolean,
      default: true,
    },
    options: {
      type: [String],
      default: undefined,
    },
    category: {
      type: String,
      enum: ["general", "appearance", "security", "notifications", "advanced"],
      default: "general",
    },
    order: {
      type: Number,
      default: 0,
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for faster queries
settingSchema.index({ settingType: 1, key: 1 }, { unique: true });
settingSchema.index({ category: 1 });

// Pre-save hook to update timestamp
settingSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to get all settings
settingSchema.statics.getAllSettings = async function () {
  const settings = await this.find({}).sort({ category: 1, order: 1 });
  return settings.reduce((acc, setting) => {
    acc[setting.key] = setting.value;
    return acc;
  }, {});
};

// Static method to update multiple settings
settingSchema.statics.updateSettings = async function (updates, userId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const results = [];

    for (const [key, value] of Object.entries(updates)) {
      const setting = await this.findOneAndUpdate(
        { key },
        {
          value,
          lastModifiedBy: userId,
          updatedAt: Date.now(),
        },
        { new: true, session },
      );

      if (!setting) {
        throw new Error(`Setting "${key}" not found`);
      }

      results.push(setting);
    }

    await session.commitTransaction();
    session.endSession();

    return results;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

export default mongoose.model("Setting", settingSchema);
