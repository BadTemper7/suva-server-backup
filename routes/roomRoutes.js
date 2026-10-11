import express from "express";
import multer from "multer";
import {
  createRoom,
  getRooms,
  getOperationLogs,
  getRoomById,
  updateRoom,
  deleteRoom,
  deleteMultipleRooms,
  bulkUpdateRoomStatus,
} from "../controllers/roomController.js";
import {
  protect,
  adminOnly,
  receptionistOrAdmin,
  optionalAuth,
} from "../middleware/authMiddleware.js";

const router = express.Router();

/* -------------------- MULTER -------------------- */
const storage = multer.diskStorage({});
const upload = multer({ storage });

/* -------------------- ROUTES -------------------- */
router.post("/", protect, adminOnly, upload.array("images"), createRoom);
router.get("/operations-logs", protect, receptionistOrAdmin, getOperationLogs);
router.get("/", optionalAuth, getRooms);
router.get("/:id", protect, receptionistOrAdmin, getRoomById);
router.put("/:id", protect, receptionistOrAdmin, upload.array("images"), updateRoom);
router.delete("/:id", protect, adminOnly, deleteRoom);

// New: Delete multiple rooms
router.post("/delete-multiple", protect, adminOnly, deleteMultipleRooms);

// New: Bulk status update (rooms/cottages) — see WT-05
router.post(
  "/bulk-status",
  protect,
  receptionistOrAdmin,
  bulkUpdateRoomStatus,
);

export default router;
