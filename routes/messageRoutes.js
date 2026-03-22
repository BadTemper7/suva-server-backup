// routes/messageRoutes.js
import express from "express";
import {
  createMessage,
  getMessages,
  getMessageById,
  replyToMessage,
  updateMessageStatus,
  deleteMessage,
  deleteMultipleMessages,
  getMessageStats,
} from "../controllers/messageController.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";
import { protectGuest } from "../middleware/guestAuthMiddleware.js";

const router = express.Router();

// Public routes with optional guest authentication
router.post("/", protectGuest, createMessage);

// Protected admin routes
router.get("/", protect, adminOnly, getMessages);
router.get("/stats", protect, adminOnly, getMessageStats);
router.get("/:id", protect, adminOnly, getMessageById);
router.put("/:id/reply", protect, adminOnly, replyToMessage);
router.put("/:id/status", protect, adminOnly, updateMessageStatus);
router.delete("/:id", protect, adminOnly, deleteMessage);
router.delete("/bulk/delete", protect, adminOnly, deleteMultipleMessages);

export default router;
