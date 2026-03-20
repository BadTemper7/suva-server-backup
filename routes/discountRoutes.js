import express from "express";
import {
  createDiscount,
  getDiscounts,
  getDiscountById,
  updateDiscount,
  deleteDiscount,
  deleteMultipleDiscounts,
} from "../controllers/discountController.js";

const router = express.Router();

// Create a new discount
router.post("/", createDiscount);

// Get all discounts (optional filter by isActive)
router.get("/", getDiscounts);

// Get a single discount by ID
router.get("/:id", getDiscountById);

// Update a discount by ID
router.patch("/:id", updateDiscount);

// Delete a discount by ID
router.delete("/bulk", deleteMultipleDiscounts);
router.delete("/:id", deleteDiscount);

export default router;
