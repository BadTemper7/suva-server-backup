// routes/discountImageRoutes.js
import express from "express";
import multer from "multer";
import {
  createDiscountImage,
  confirmDiscountImage,
  rejectDiscountImage,
  getDiscountImagesByBilling,
  getAllDiscountImages,
  getDiscountImageById,
  deleteDiscountImage,
  deleteMultipleDiscountImages,
} from "../controllers/discountImageController.js";

const router = express.Router();

// Configure multer for file upload
const storage = multer.diskStorage({});
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only images
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

// =========================
// GET ROUTES (place before routes with parameters)
// =========================

// Get all discount images with filters
// Example: /api/discount-images?status=pending&billingId=xxx
router.get("/", getAllDiscountImages);

// Get discount images by billing ID
router.get("/billing/:billingId", getDiscountImagesByBilling);

// Get single discount image by ID
router.get("/:id", getDiscountImageById);

// =========================
// POST ROUTES
// =========================

// Upload a new discount image
router.post("/", upload.single("image"), createDiscountImage);

// =========================
// PATCH ROUTES
// =========================

// Confirm a discount image (applies discount to billing if linked)
router.patch("/confirm", confirmDiscountImage);

// Reject a discount image
router.patch("/reject", rejectDiscountImage);

// =========================
// DELETE ROUTES
// =========================

// Delete multiple discount images (bulk delete)
router.delete("/bulk", deleteMultipleDiscountImages);

// Delete single discount image
router.delete("/:id", deleteDiscountImage);

export default router;
