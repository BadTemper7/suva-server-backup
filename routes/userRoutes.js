import express from "express";
import {
  createUser, // Changed from registerUser
  loginUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  deleteManyUsers,
  unlockUserAccount,
  getUserLoginStats,
  requestPasswordReset,
  resetPassword,
  getCurrentUser,
  changePassword,
} from "../controllers/userController.js";

import {
  protect,
  receptionistOrAdmin,
  adminOnly,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// Public routes
router.post("/login", loginUser);
router.post("/reset-password-request", requestPasswordReset);
router.post("/reset-password", resetPassword);

// Protected routes (require authentication)
router.get("/me", protect, getCurrentUser);
router.get("/", protect, receptionistOrAdmin, getUsers);
router.get("/stats/login", protect, adminOnly, getUserLoginStats);
router.post("/change-password", protect, changePassword);
router.get("/:id", protect, adminOnly, getUserById);

// Superadmin only routes (create, update, delete users)
router.post("/", protect, adminOnly, createUser); // Changed from /register to /
router.put("/:id", protect, adminOnly, updateUser);
router.patch("/:id/unlock", protect, adminOnly, unlockUserAccount);
router.delete("/:id", protect, adminOnly, deleteUser);
router.delete("/", protect, adminOnly, deleteManyUsers);

export default router;
