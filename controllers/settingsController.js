// src/controllers/settingsController.js
import Setting from "../models/Settings.js";
import mongoose from "mongoose";
import cloudinary from "../config/cloudinary.js";

// Initialize default settings if they don't exist
const DEFAULT_SETTINGS = [
  // System Settings
  {
    settingType: "system",
    key: "systemName",
    value: "Suva's Place Resort",
    label: "System Name",
    description: "The name of your hotel/resort system",
    dataType: "string",
    category: "appearance",
    order: 1,
  },
  {
    settingType: "system",
    key: "systemLogo",
    value: "",
    label: "System Logo",
    description: "Upload your hotel/resort logo",
    dataType: "file",
    category: "appearance",
    order: 2,
  },
  {
    settingType: "system",
    key: "systemFavicon",
    value: "",
    label: "System Favicon",
    description: "Upload your favicon (16x16 or 32x32 PNG)",
    dataType: "file",
    category: "appearance",
    order: 3,
  },

  // Security Settings
  {
    settingType: "security",
    key: "sessionTimeout",
    value: 15, // in minutes
    label: "Session Timeout",
    description: "How long before a user is logged out due to inactivity",
    dataType: "number",
    options: ["15", "30", "60", "120", "480"], // minutes
    category: "security",
    order: 1,
  },
  {
    settingType: "security",
    key: "sessionWarningTime",
    value: 1, // in minutes
    label: "Session Warning Time",
    description: "How long before logout to show warning (in minutes)",
    dataType: "number",
    options: ["1", "2", "5"],
    category: "security",
    order: 4,
  },
  {
    settingType: "security",
    key: "maxLoginAttempts",
    value: 5,
    label: "Maximum Login Attempts",
    description:
      "Maximum number of failed login attempts before account is locked",
    dataType: "number",
    category: "security",
    order: 2,
  },
  {
    settingType: "security",
    key: "lockoutDuration",
    value: 15, // in minutes
    label: "Account Lockout Duration",
    description:
      "How long an account remains locked after too many failed attempts",
    dataType: "number",
    category: "security",
    order: 3,
  },

  // General Settings
  {
    settingType: "system",
    key: "timezone",
    value: "Asia/Manila",
    label: "Timezone",
    description: "System timezone",
    dataType: "string",
    options: [
      "Asia/Manila",
      "UTC",
      "America/New_York",
      "Europe/London",
      "Asia/Tokyo",
    ],
    category: "general",
    order: 1,
  },
  {
    settingType: "system",
    key: "dateFormat",
    value: "MM/DD/YYYY",
    label: "Date Format",
    description: "How dates are displayed",
    dataType: "string",
    options: ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"],
    category: "general",
    order: 2,
  },
  {
    settingType: "system",
    key: "timeFormat",
    value: "12h",
    label: "Time Format",
    description: "12-hour or 24-hour clock",
    dataType: "string",
    options: ["12h", "24h"],
    category: "general",
    order: 3,
  },
];

// Initialize default settings
// Update the initializeSettings function in settingsController.js
export const initializeSettings = async () => {
  try {
    const count = await Setting.countDocuments();

    if (count === 0) {
      await Setting.insertMany(DEFAULT_SETTINGS);
      console.log("✅ Default settings initialized");
    } else {
      console.log(`✅ Settings already exist (${count} settings found)`);
    }
  } catch (error) {
    console.error("❌ Error initializing settings:", error.message);
    // Don't throw error to prevent server crash
  }
};

// Get all settings
export const getSettings = async (req, res) => {
  try {
    // Group settings by category
    const settings = await Setting.find({})
      .sort({ category: 1, order: 1 })
      .populate("lastModifiedBy", "username email firstName lastName");

    // Group by category
    const groupedSettings = settings.reduce((acc, setting) => {
      if (!acc[setting.category]) {
        acc[setting.category] = [];
      }
      acc[setting.category].push(setting);
      return acc;
    }, {});

    // Also create a flat key-value object for easy access
    const flatSettings = settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});

    return res.status(200).json({
      success: true,
      settings: groupedSettings,
      flatSettings,
      categories: Object.keys(groupedSettings),
    });
  } catch (error) {
    console.error("Error getting settings:", error);
    return res.status(500).json({ error: error.message });
  }
};

// Get single setting by key
export const getSetting = async (req, res) => {
  try {
    const { key } = req.params;

    const setting = await Setting.findOne({ key }).populate(
      "lastModifiedBy",
      "username email firstName lastName",
    );

    if (!setting) {
      return res.status(404).json({ error: "Setting not found" });
    }

    return res.status(200).json({
      success: true,
      setting,
    });
  } catch (error) {
    console.error("Error getting setting:", error);
    return res.status(500).json({ error: error.message });
  }
};

// Update settings
export const updateSettings = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const updates = req.body.updates; // { key: value }
    const userId = req.user?._id;

    if (!updates || typeof updates !== "object") {
      return res.status(400).json({ error: "Invalid updates format" });
    }

    const results = [];

    for (const [key, value] of Object.entries(updates)) {
      const setting = await Setting.findOne({ key }).session(session);

      if (!setting) {
        await session.abortTransaction();
        return res.status(404).json({ error: `Setting "${key}" not found` });
      }

      // Validate based on data type
      switch (setting.dataType) {
        case "number":
          if (isNaN(Number(value))) {
            await session.abortTransaction();
            return res
              .status(400)
              .json({ error: `Setting "${key}" must be a number` });
          }
          break;

        case "boolean":
          if (typeof value !== "boolean") {
            await session.abortTransaction();
            return res
              .status(400)
              .json({ error: `Setting "${key}" must be a boolean` });
          }
          break;

        case "json":
          try {
            JSON.parse(value);
          } catch {
            await session.abortTransaction();
            return res
              .status(400)
              .json({ error: `Setting "${key}" must be valid JSON` });
          }
          break;
      }

      // If setting has options, validate against them
      if (setting.options && setting.options.length > 0) {
        if (!setting.options.includes(String(value))) {
          await session.abortTransaction();
          return res.status(400).json({
            error: `Invalid value for "${key}". Must be one of: ${setting.options.join(", ")}`,
          });
        }
      }

      // Update the setting
      setting.value = value;
      setting.lastModifiedBy = userId;
      await setting.save({ session });

      results.push(setting);
    }

    await session.commitTransaction();
    session.endSession();

    // Get updated settings
    const settings = await Setting.find({})
      .sort({ category: 1, order: 1 })
      .populate("lastModifiedBy", "username email firstName lastName");

    return res.status(200).json({
      success: true,
      message: "Settings updated successfully",
      updatedCount: results.length,
      settings,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error updating settings:", error);
    return res.status(500).json({ error: error.message });
  }
};

// Upload system logo
export const uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "system/logos",
      public_id: `logo_${Date.now()}`,
      overwrite: true,
      transformation: [
        { width: 200, height: 200, crop: "limit" },
        { quality: "auto:good" },
      ],
    });

    // Update setting
    const setting = await Setting.findOneAndUpdate(
      { key: "systemLogo" },
      {
        value: result.secure_url,
        lastModifiedBy: req.user?._id,
      },
      { new: true },
    ).populate("lastModifiedBy", "username email firstName lastName");

    return res.status(200).json({
      success: true,
      message: "Logo uploaded successfully",
      setting,
      imageUrl: result.secure_url,
    });
  } catch (error) {
    console.error("Error uploading logo:", error);
    return res.status(500).json({ error: error.message });
  }
};

// Upload favicon
export const uploadFavicon = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "system/favicons",
      public_id: `favicon_${Date.now()}`,
      overwrite: true,
      transformation: [
        { width: 32, height: 32, crop: "fill" },
        { quality: "auto:best" },
      ],
    });

    // Update setting
    const setting = await Setting.findOneAndUpdate(
      { key: "systemFavicon" },
      {
        value: result.secure_url,
        lastModifiedBy: req.user?._id,
      },
      { new: true },
    ).populate("lastModifiedBy", "username email firstName lastName");

    return res.status(200).json({
      success: true,
      message: "Favicon uploaded successfully",
      setting,
      imageUrl: result.secure_url,
    });
  } catch (error) {
    console.error("Error uploading favicon:", error);
    return res.status(500).json({ error: error.message });
  }
};

// Reset to default settings
export const resetToDefaults = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Delete all existing settings
    await Setting.deleteMany({}).session(session);

    // Insert default settings
    const defaultSettings = DEFAULT_SETTINGS.map((setting) => ({
      ...setting,
      lastModifiedBy: req.user?._id,
    }));

    await Setting.insertMany(defaultSettings, { session });

    await session.commitTransaction();
    session.endSession();

    // Get updated settings
    const settings = await Setting.find({})
      .sort({ category: 1, order: 1 })
      .populate("lastModifiedBy", "username email firstName lastName");

    return res.status(200).json({
      success: true,
      message: "Settings reset to defaults successfully",
      settings,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error resetting settings:", error);
    return res.status(500).json({ error: error.message });
  }
};

// Get specific settings by category
export const getSettingsByCategory = async (req, res) => {
  try {
    const { category } = req.params;

    const settings = await Setting.find({ category })
      .sort({ order: 1 })
      .populate("lastModifiedBy", "username email firstName lastName");

    return res.status(200).json({
      success: true,
      category,
      settings,
    });
  } catch (error) {
    console.error("Error getting settings by category:", error);
    return res.status(500).json({ error: error.message });
  }
};
