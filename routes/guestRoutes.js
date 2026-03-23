import express from "express";
import {
  createGuest,
  getGuests,
  getGuestById,
  updateGuest,
  deleteGuest,
  findOrCreateGuestByEmail,
  deleteMultipleGuests,
  getGuestByEmail,
  registerGuest,
  loginGuest,
  upgradeToAccount,
  requestPasswordReset,
  resetPassword,
  changePassword,
  verifyEmail,
  resendVerificationEmail,
} from "../controllers/guestController.js";

const router = express.Router();

// Authentication routes
router.post("/register", registerGuest);
router.post("/login", loginGuest);
router.post("/reset-password-request", requestPasswordReset);
router.post("/reset-password", resetPassword); // In guestRoutes.js
router.post("/change-password", changePassword);

// Guest routes

router.post("/", createGuest);
router.post("/find-or-create-by-email", findOrCreateGuestByEmail);
router.get("/", getGuests);
router.get("/find-by-email", getGuestByEmail);
router.delete("/bulk", deleteMultipleGuests);
router.put("/upgrade-to-account/:id", upgradeToAccount);
router.get("/verify-email/:token", verifyEmail);
router.post("/resend-verification", resendVerificationEmail);
router.get("/:id", getGuestById);
router.put("/:id", updateGuest);
router.delete("/:id", deleteGuest);

export default router;
