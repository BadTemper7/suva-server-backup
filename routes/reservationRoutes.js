// routes/reservationRoutes.js
import express from "express";
import {
  addReservation,
  getReservations,
  checkAvailableRooms,
  getReservationById,
  deleteMultipleReservations,
  updateReservation,
  generatePDFReport,
  generateExcelReport,
  generateReservationConfirmation,
  updateReservationStatus,
  deleteReservation,
  getReservationsByGuest,
  getUpcomingReservationsByGuest,
  getPastReservationsByGuest,
  getReservationHistory,
} from "../controllers/reservationController.js";
import { protect, canManageReservations } from "../middleware/authMiddleware.js";

const router = express.Router();

// ==================== PUBLIC/GUEST ROUTES ====================
// Get reservations by guest ID (with full details)
router.get("/guest/:guestId", getReservationsByGuest);
router.get("/guest/:guestId/upcoming", getUpcomingReservationsByGuest);
router.get("/guest/:guestId/past", getPastReservationsByGuest);

// Check available rooms (public)
router.get("/rooms", checkAvailableRooms);

// ==================== RESERVATION CRUD ====================
// Create a new reservation
router.post("/", addReservation);

// Reschedule reservation (see WT-09)
router.put("/", protect, canManageReservations, updateReservation);

// Get all reservations (with optional query params for filtering) - Admin only
router.get("/", getReservations);

// Get a single reservation by ID
router.get("/:id", getReservationById);

// Update reservation status
router.patch("/:id/status", updateReservationStatus);

// Reservation change history (see WT-04)
router.get("/:id/history", getReservationHistory);

// ==================== REPORT GENERATION ====================
// Report generation routes
router.get("/reports/pdf", generatePDFReport);
router.get("/reports/excel", generateExcelReport);
router.get("/:id/confirmation", generateReservationConfirmation);

// ==================== DELETE OPERATIONS ====================
// Bulk delete reservations
router.delete("/delete-many", deleteMultipleReservations);
router.delete("/:id", deleteReservation);

export default router;
