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
  processRefund,
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
router.post("/:billingId/refund", processRefund);
router.get("/:reservationId", getBillingByReservation);
// Add this route to billingRoutes.js
router.patch("/:billingId/status", async (req, res) => {
  try {
    const { billingId } = req.params;
    const { status } = req.body;

    if (!["unpaid", "partial", "paid", "refunded", "voided"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const billing = await Billing.findByIdAndUpdate(
      billingId,
      { status },
      { new: true },
    );

    if (!billing) {
      return res.status(404).json({ error: "Billing not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Billing status updated successfully",
      billing,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
export default router;
