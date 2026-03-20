import express from "express";
import {
  createAmenity,
  getAmenities,
  getAmenityById,
  updateAmenity,
  deleteAmenity,
  deleteMultipleAmenities,
} from "../controllers/amenityController.js";

const router = express.Router();

// Amenities
router.post("/", createAmenity);
router.get("/", getAmenities);
router.delete("/bulk", deleteMultipleAmenities);
router.get("/:id", getAmenityById);
router.put("/:id", updateAmenity);
router.delete("/:id", deleteAmenity);

export default router;
