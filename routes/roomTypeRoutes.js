import express from "express";
import {
  createRoomType,
  getRoomTypes,
  getRoomTypeById,
  updateRoomType,
  updateRoomTypeStatus,
  deleteRoomType,
} from "../controllers/roomTypeController.js";

const router = express.Router();

// Admin routes
router.post("/", createRoomType);
router.get("/", getRoomTypes);
router.get("/:id", getRoomTypeById);
router.put("/:id", updateRoomType);
router.patch("/:id/status", updateRoomTypeStatus);
router.delete("/:id", deleteRoomType);

export default router;
