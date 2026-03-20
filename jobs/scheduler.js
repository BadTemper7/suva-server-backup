import cron from "node-cron";
import {
  cancelUnpaidReservationsJob,
  cancelOldUnpaidReservations,
} from "./reservationCleanupJob.js";
import {
  markNoShowReservationsJob,
  markNoShowAfterCheckOutJob,
} from "./noShowJob.js";

/**
 * Initialize and schedule all background jobs
 */
export const initializeJobs = () => {
  console.log("Initializing background jobs...");

  // 1. Cancel unpaid pending reservations - Run every hour
  cron.schedule("0 * * * *", async () => {
    console.log("Running unpaid reservation cleanup job...");
    try {
      await cancelUnpaidReservationsJob();
    } catch (error) {
      console.error("Failed to run unpaid reservation cleanup job:", error);
    }
  });

  // 2. Cancel old unpaid reservations (24+ hours old) - Run daily at 2 AM
  cron.schedule("0 2 * * *", async () => {
    console.log("Running old unpaid reservation cleanup job...");
    try {
      await cancelOldUnpaidReservations(24); // 24 hours old
    } catch (error) {
      console.error("Failed to run old unpaid reservation cleanup job:", error);
    }
  });

  // 3. Mark no-show reservations - Run daily at 6 PM (after check-in time)
  cron.schedule("0 18 * * *", async () => {
    console.log("Running no-show reservation job...");
    try {
      await markNoShowReservationsJob();
    } catch (error) {
      console.error("Failed to run no-show reservation job:", error);
    }
  });

  // 4. Mark no-show after check-out - Run daily at midnight
  cron.schedule("0 0 * * *", async () => {
    console.log("Running no-show after check-out job...");
    try {
      await markNoShowAfterCheckOutJob();
    } catch (error) {
      console.error("Failed to run no-show after check-out job:", error);
    }
  });

  console.log("Background jobs initialized and scheduled");
  console.log("Scheduled jobs:");
  console.log("- Unpaid reservation cleanup: Every hour");
  console.log("- Old unpaid reservation cleanup: Daily at 2 AM");
  console.log("- No-show reservation check: Daily at 6 PM");
  console.log("- No-show after check-out: Daily at midnight");
};

/**
 * Manual trigger for testing/debugging
 */
export const triggerJobsManually = {
  cancelUnpaidReservations: async () => {
    console.log("Manually triggering unpaid reservation cleanup...");
    return await cancelUnpaidReservationsJob();
  },

  cancelOldUnpaidReservations: async (hours = 24) => {
    console.log(
      `Manually triggering old unpaid reservation cleanup (older than ${hours} hours)...`,
    );
    return await cancelOldUnpaidReservations(hours);
  },

  markNoShowReservations: async () => {
    console.log("Manually triggering no-show reservation check...");
    return await markNoShowReservationsJob();
  },

  markNoShowAfterCheckOut: async () => {
    console.log("Manually triggering no-show after check-out check...");
    return await markNoShowAfterCheckOutJob();
  },
};
