// routes/reportRoutes.js
import express from "express";
import {
  getReservationsReport,
  getReservationStatusReport,
  getRoomOccupancyReport,
  getRevenueReport,
  getPaymentReport,
  getRefundReport,
  getOutstandingBalanceReport,
  exportReportToExcel,
  exportReportToPDF,
} from "../controllers/reportController.js";

const router = express.Router();

// Reservation Reports
router.get("/reservations", getReservationsReport);
router.get("/reservation-status", getReservationStatusReport);
router.get("/occupancy", getRoomOccupancyReport);

// Billing Reports
router.get("/revenue", getRevenueReport);
router.get("/payments", getPaymentReport);
router.get("/refunds", getRefundReport);
router.get("/outstanding-balances", getOutstandingBalanceReport);

// Export Reports
router.get("/export/excel", exportReportToExcel);
router.get("/export/pdf", exportReportToPDF);

export default router;
