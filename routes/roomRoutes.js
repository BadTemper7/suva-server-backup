import express from "express";
import multer from "multer";
import {
  createRoom,
  getRooms,
  getRoomById,
  updateRoom,
  deleteRoom,
  deleteMultipleRooms,
} from "../controllers/roomController.js";
import {
  protect,
  adminOnly,
  receptionistOrAdmin,
} from "../middleware/authMiddleware.js";

const router = express.Router();

/* -------------------- MULTER -------------------- */
const storage = multer.diskStorage({});
const upload = multer({ storage });

/* -------------------- ROUTES -------------------- */
router.post("/", protect, adminOnly, upload.array("images"), createRoom);
router.get("/", getRooms);
router.get("/:id", protect, receptionistOrAdmin, getRoomById);
router.put("/:id", protect, adminOnly, upload.array("images"), updateRoom);
router.delete("/:id", protect, adminOnly, deleteRoom);

// New: Delete multiple rooms
router.post("/delete-multiple", protect, adminOnly, deleteMultipleRooms);

export default router;
