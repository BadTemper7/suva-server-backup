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
} from "../controllers/reservationRoomController.js";

const router = express.Router();

// Get rooms by reservation ID
router.get("/:reservationId/", getRoomsByReservationId);

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
