import express from "express";
import {
  createPaymentOption,
  getPaymentOptions,
  getPaymentOptionById,
  updatePaymentOption,
  deletePaymentOption,
  deleteMultiplePaymentOptions,
} from "../controllers/paymentOptionController.js";

const router = express.Router();

// Create a new payment option
router.post("/", createPaymentOption);

// Get all payment options
router.get("/", getPaymentOptions);

// Get a payment option by ID
router.get("/:id", getPaymentOptionById);

// Update a payment option by ID
router.patch("/:id", updatePaymentOption);

// Delete a payment option by ID
router.delete("/bulk", deleteMultiplePaymentOptions);
router.delete("/:id", deletePaymentOption);

export default router;
