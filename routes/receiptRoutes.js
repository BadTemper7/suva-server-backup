// routes/receiptRoutes.js
import express from "express";
import multer from "multer";
import {
  createReceipt,
  confirmReceipt,
  rejectReceipt,
  deleteReceipt,
  getReceiptsByBilling,
  deleteMultipleReceipts,
  confirmMultipleReceipts,
  rejectMultipleReceipts,
  getReceiptById,
  updateReceiptStatus,
} from "../controllers/receiptController.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// GET routes
router.get("/billing/:billingId", getReceiptsByBilling);
router.get("/:id", getReceiptById);

// POST routes
router.post("/upload", upload.single("receiptImage"), createReceipt);

// PATCH routes
router.patch("/:id/status", updateReceiptStatus);
router.patch("/:id/confirm", confirmReceipt);
router.patch("/:id/reject", rejectReceipt);
router.patch("/bulk/confirm", confirmMultipleReceipts);
router.patch("/bulk/reject", rejectMultipleReceipts);

// DELETE routes
router.delete("/bulk", deleteMultipleReceipts); // Changed to just /bulk
router.delete("/:id", deleteReceipt);

export default router;
