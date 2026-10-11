import express from "express";
import multer from "multer";
import {
  createPaymentType,
  getPaymentTypes,
  getPaymentTypeById,
  updatePaymentType,
  deletePaymentType,
  deleteMultiplePaymentTypes,
} from "../controllers/paymentTypeController.js";

const router = express.Router();

const storage = multer.diskStorage({});
const upload = multer({ storage });

// Create a new payment type
router.post("/", upload.single("qrCode"), createPaymentType);

// Get all payment types
router.get("/", getPaymentTypes);

// Get a payment type by ID
router.get("/:id", getPaymentTypeById);

// Update a payment type by ID
router.patch("/:id", upload.single("qrCode"), updatePaymentType);

// Delete a payment type by ID
router.delete("/:id", deletePaymentType);
router.delete("/bulk", deleteMultiplePaymentTypes);

export default router;
