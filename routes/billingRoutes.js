// routes/billingRoutes.js
import express from "express";
import {
  generateBilling,
  getBillingByReservation,
  getBillingById,
  getBillings,
  updateBillingCalc,
  generateBillingReport,
  exportBillingReport,
} from "../controllers/billingController.js";

const router = express.Router();

// Generate or update billing for a reservation
// POST /api/billing
router.get("/", getBillings);
router.post("/", generateBilling);
router.get("/reports", generateBillingReport);
router.get("/reports/export", exportBillingReport);
router.put("/calculate/:billingId", updateBillingCalc);
router.get("/id/:billingId", getBillingById);
// Get billing by reservation ID
// GET /api/billing/:reservationId
router.get("/:reservationId", getBillingByReservation);

export default router;
