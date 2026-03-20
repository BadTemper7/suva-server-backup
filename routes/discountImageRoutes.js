import express from "express";
import multer from "multer";
import {
  createDiscountImage,
  confirmDiscountImage,
  rejectDiscountImage,
} from "../controllers/discountImageController.js";

const router = express.Router();

// Configure multer for file upload
const storage = multer.diskStorage({});
const upload = multer({ storage });

// Upload a new discount image
router.post("/", upload.single("image"), createDiscountImage);

// Confirm a discount image (applies discount to billing if linked)
router.patch("/confirm", confirmDiscountImage);

// Reject a discount image
router.patch("/reject", rejectDiscountImage);

export default router;
