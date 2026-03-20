// src/routes/settingsRoutes.js
import express from "express";
import {
  getSettings,
  getSetting,
  updateSettings,
  uploadLogo,
  uploadFavicon,
  resetToDefaults,
  getSettingsByCategory,
} from "../controllers/settingsController.js";
import upload from "../config/multer.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public routes (no auth required - for frontend to get settings)
router.get("/", getSettings);
router.get("/category/:category", getSettingsByCategory);
router.get("/:key", getSetting);

// Protected admin routes (require auth - for modifying settings)
router.put("/update", protect, adminOnly, updateSettings);
router.post(
  "/upload-logo",
  protect,
  adminOnly,
  upload.single("logo"),
  uploadLogo,
);
router.post(
  "/upload-favicon",
  protect,
  adminOnly,
  upload.single("favicon"),
  uploadFavicon,
);
router.post("/reset-defaults", protect, adminOnly, resetToDefaults);

export default router;
