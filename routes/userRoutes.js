import express from "express";
import {
  registerUser,
  loginUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  deleteManyUsers,
  unlockUserAccount,
  getUserLoginStats,
} from "../controllers/userController.js";

import {
  protect,
  receptionistOrAdmin,
  adminOnly,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// Register (Admin only)
router.post("/register", protect, adminOnly, registerUser);

// Login
router.post("/login", loginUser);

// CRUD (Admin only)
router.get("/", protect, receptionistOrAdmin, getUsers);
router.get("/stats/login", protect, adminOnly, getUserLoginStats);
router.get("/:id", protect, adminOnly, getUserById);
router.put("/:id", protect, adminOnly, updateUser);
router.patch("/:id/unlock", protect, adminOnly, unlockUserAccount);
router.delete("/:id", protect, adminOnly, deleteUser);
router.delete("/", protect, adminOnly, deleteManyUsers);

export default router;
