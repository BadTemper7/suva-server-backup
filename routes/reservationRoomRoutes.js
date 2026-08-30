// routes/reservationRoomRoutes.js
import express from "express";
import {
  addReservationRooms,
  removeReservationRooms,
  getRoomsByReservationId,
  deleteMultipleReservationRooms,
  updateReservationRoom,
  addAddOnsToRoom,
  removeAddOnsFromRoom,
  updateAddOnQuantity,
  transferReservationRoom,
} from "../controllers/reservationRoomController.js";
import { protect, receptionistOrAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// Get rooms by reservation ID
router.get("/:reservationId/", getRoomsByReservationId);

router.post(
  "/:reservationRoomId/transfer",
  protect,
  receptionistOrAdmin,
  transferReservationRoom,
);

// Add multiple rooms to a reservation
router.post("/", addReservationRooms);

// Update room add-ons
router.put("/:reservationRoomId", updateReservationRoom);

// Add add-ons to a specific room
router.post("/:reservationRoomId/add-ons", addAddOnsToRoom);

// Remove add-ons from a specific room
router.delete("/:reservationRoomId/add-ons", removeAddOnsFromRoom);

// Update add-on quantity in a room
router.patch("/:reservationRoomId/add-ons/:addOnId", updateAddOnQuantity);

// Remove multiple rooms from a reservation
router.delete("/delete-many", deleteMultipleReservationRooms);
router.post("/remove", removeReservationRooms);

export default router;
