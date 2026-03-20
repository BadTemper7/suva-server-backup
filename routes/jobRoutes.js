import express from "express";
import { triggerJobsManually } from "../jobs/scheduler.js";

const router = express.Router();

// Protect these routes in production
if (process.env.NODE_ENV === "development") {
  router.get("/cancel-unpaid", async (req, res) => {
    try {
      const result = await triggerJobsManually.cancelUnpaidReservations();
      res.json({
        success: true,
        message: "Unpaid reservation cleanup job executed",
        result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to execute job",
        error: error.message,
      });
    }
  });

  router.get("/no-show", async (req, res) => {
    try {
      const result = await triggerJobsManually.markNoShowReservations();
      res.json({
        success: true,
        message: "No-show reservation job executed",
        result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to execute job",
        error: error.message,
      });
    }
  });

  router.get("/all", async (req, res) => {
    try {
      const results = {
        unpaid: await triggerJobsManually.cancelUnpaidReservations(),
        noShow: await triggerJobsManually.markNoShowReservations(),
        oldUnpaid: await triggerJobsManually.cancelOldUnpaidReservations(24),
        noShowAfterCheckOut:
          await triggerJobsManually.markNoShowAfterCheckOut(),
      };

      res.json({
        success: true,
        message: "All jobs executed",
        results,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to execute jobs",
        error: error.message,
      });
    }
  });
}

export default router;
