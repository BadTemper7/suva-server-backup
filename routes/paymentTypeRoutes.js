import express from "express";
import {
  createPaymentType,
  getPaymentTypes,
  getPaymentTypeById,
  updatePaymentType,
  deletePaymentType,
  deleteMultiplePaymentTypes,
} from "../controllers/paymentTypeController.js";

const router = express.Router();

// Create a new payment type
router.post("/", createPaymentType);

// Get all payment types
router.get("/", getPaymentTypes);

// Get a payment type by ID
router.get("/:id", getPaymentTypeById);

// Update a payment type by ID
router.patch("/:id", updatePaymentType);

// Delete a payment type by ID
router.delete("/:id", deletePaymentType);
router.delete("/bulk", deleteMultiplePaymentTypes);

export default router;
