// jobs/scheduler.js
import cron from "node-cron";
import { cancelExpiredReservations } from "./cancelExpiredReservations.js";
import { cancelExpiredReceipts } from "./cancelExpiredReceipts.js";

// Initialize all scheduled jobs
export function initScheduler() {
  console.log("\n🕐 Initializing job scheduler...");

  // Cancel expired reservations - every 2 hours
  cron.schedule("0 */2 * * *", async () => {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] 🔄 Running: Cancel Expired Reservations`);
    try {
      const result = await cancelExpiredReservations();
      if (result.modified > 0) {
        console.log(`✅ ${result.modified} expired reservations cancelled`);
        if (result.deletedImagesCount) {
          console.log(
            `   - Deleted ${result.deletedImagesCount} images from Cloudinary`,
          );
        }
      }
    } catch (error) {
      console.error(
        "❌ Error in cancelExpiredReservations job:",
        error.message,
      );
    }
  });

  // Cancel expired receipts - every 6 hours
  cron.schedule("0 */6 * * *", async () => {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] 🔄 Running: Cancel Expired Receipts`);
    try {
      const result = await cancelExpiredReceipts();
      if (result.deletedCount > 0) {
        console.log(`✅ ${result.deletedCount} expired receipts deleted`);
        if (result.deletedImagesCount) {
          console.log(
            `   - Deleted ${result.deletedImagesCount} images from Cloudinary`,
          );
        }
        if (result.recalculatedBillings) {
          console.log(
            `   - Recalculated ${result.recalculatedBillings} billings`,
          );
        }
      }
    } catch (error) {
      console.error("❌ Error in cancelExpiredReceipts job:", error.message);
    }
  });

  console.log("✅ Job scheduler initialized");
  console.log("   - Expired reservations: every 2 hours");
  console.log("   - Expired receipts: every 6 hours");
}

// Run jobs immediately on startup
export async function runJobsNow() {
  console.log("\n🚀 Running initial cleanup jobs...");

  let reservationResult = { modified: 0, message: "Skipped" };
  let receiptResult = { deletedCount: 0, message: "Skipped" };

  try {
    reservationResult = await cancelExpiredReservations();
  } catch (error) {
    console.error("❌ Error running cancelExpiredReservations:", error.message);
  }

  try {
    receiptResult = await cancelExpiredReceipts();
  } catch (error) {
    console.error("❌ Error running cancelExpiredReceipts:", error.message);
  }

  return {
    reservations: reservationResult,
    receipts: receiptResult,
  };
}
