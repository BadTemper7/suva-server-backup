// routes/addOnRoutes.js
import express from "express";
import {
  createAddOn,
  getAddOns,
  getAddOnById,
  updateAddOn,
  deleteAddOn,
  deleteMultipleAddOns,
  updateAddOnStock,
} from "../controllers/addOnController.js";

const router = express.Router();

// Add-On routes
router.post("/", createAddOn);
router.get("/", getAddOns);
router.delete("/bulk", deleteMultipleAddOns);
router.patch("/:id/stock", updateAddOnStock); // Update stock separately
router.get("/:id", getAddOnById);
router.put("/:id", updateAddOn);
router.delete("/:id", deleteAddOn);

export default router;
