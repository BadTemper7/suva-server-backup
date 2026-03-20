// routes/emailTestRoutes.js
import express from "express";
import { sendReservationStatusEmail } from "../config/email.js";
import Guest from "../models/Guest.js";
import Reservation from "../models/Reservation.js";

const router = express.Router();

router.post("/test-reservation-email", async (req, res) => {
  try {
    const { reservationId, status } = req.body;

    const reservation =
      await Reservation.findById(reservationId).populate("guestId");
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    const result = await sendReservationStatusEmail(
      reservation,
      reservation.guestId,
      "pending",
      status || reservation.status,
    );

    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
