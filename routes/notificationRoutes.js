// routes/notificationRoutes.js
import express from "express";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteMultipleNotifications,
} from "../controllers/notificationController.js";

const router = express.Router();

router.get("/", getNotifications);
router.patch("/:id/read", markAsRead);
router.patch("/read-all", markAllAsRead);
router.delete("/bulk", deleteMultipleNotifications);
router.delete("/:id", deleteNotification);

export default router;
