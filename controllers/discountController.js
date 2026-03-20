// controllers/discountController.js
import Discount from "../models/Discount.js";
import mongoose from "mongoose";

// Create a new discount
export const createDiscount = async (req, res) => {
  try {
    const {
      name,
      discountPercent,
      isActive = true,
      appliesToAllRooms = false,
      maxRoomCount = null,
      discountPriority = "highest",
      isPerId = false,
    } = req.body;

    if (!name) return res.status(400).json({ error: "Name is required" });
    if (discountPercent == null)
      return res.status(400).json({ error: "discountPercent is required" });
    if (discountPercent < 0 || discountPercent > 100)
      return res
        .status(400)
        .json({ error: "discountPercent must be between 0 and 100" });

    const discount = new Discount({
      name,
      discountPercent,
      isActive,
      appliesToAllRooms,
      maxRoomCount,
      discountPriority,
      isPerId,
    });

    const savedDiscount = await discount.save();
    return res.status(201).json({
      message: "Discount created successfully",
      discount: savedDiscount,
    });
  } catch (error) {
    if (error.code === 11000)
      return res.status(409).json({ error: "Discount name already exists" });
    return res.status(500).json({ error: error.message });
  }
};

// Get all discounts (optional: filter by isActive)
export const getDiscounts = async (req, res) => {
  try {
    const { isActive } = req.query;
    const filter = {};
    if (isActive != null) filter.isActive = isActive === "true";

    const discounts = await Discount.find(filter).sort({ createdAt: -1 });
    return res.status(200).json(discounts);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Get a discount by ID
export const getDiscountById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ error: "Invalid discount ID" });

    const discount = await Discount.findById(id);
    if (!discount) return res.status(404).json({ error: "Discount not found" });

    return res.status(200).json(discount);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Update a discount
export const updateDiscount = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ error: "Invalid discount ID" });

    const updatedDiscount = await Discount.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!updatedDiscount)
      return res.status(404).json({ error: "Discount not found" });

    return res.status(200).json({
      message: "Discount updated successfully",
      discount: updatedDiscount,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Delete a discount
export const deleteDiscount = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ error: "Invalid discount ID" });

    const deleted = await Discount.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: "Discount not found" });

    return res.status(200).json({ message: "Discount deleted successfully" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Activate / Deactivate a discount
export const toggleDiscountStatus = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ error: "Invalid discount ID" });

    const discount = await Discount.findById(id);
    if (!discount) return res.status(404).json({ error: "Discount not found" });

    discount.isActive = !discount.isActive;
    await discount.save();

    return res.status(200).json({
      message: `Discount is now ${discount.isActive ? "active" : "inactive"}`,
      discount,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// DELETE /discounts/bulk
export const deleteMultipleDiscounts = async (req, res) => {
  try {
    const { discountIds } = req.body;
    if (!Array.isArray(discountIds) || discountIds.length === 0) {
      return res.status(400).json({
        error: "Array of discount IDs is required",
      });
    }

    const result = await Discount.deleteMany({
      _id: { $in: discountIds },
    });

    return res.json({
      message: `${result.deletedCount} discount(s) deleted successfully.`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
