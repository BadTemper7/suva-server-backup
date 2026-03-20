import express from "express";
import {
  addReservationRooms,
  removeReservationRooms,
  getRoomsByReservationId,
  deleteMultipleReservationRooms,
  updateReservationRoom,
} from "../controllers/reservationRoomController.js";

const router = express.Router();

router.get("/:reservationId/", getRoomsByReservationId);
// Add multiple rooms to a reservation
router.post("/", addReservationRooms);
router.put("/:reservationRoomId", updateReservationRoom);

// Remove multiple rooms from a reservation
router.delete("/delete-many", deleteMultipleReservationRooms);
router.post("/remove", removeReservationRooms);
export default router;
