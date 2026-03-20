import mongoose from "mongoose";
import Billing from "../models/Billing.js";
import ReservationModel from "../models/Reservation.js";
const { Reservation } = ReservationModel;
/**
 * Job to cancel pending reservations with unpaid billings
 * Runs every hour to check for pending reservations that should be cancelled
 */
export const cancelUnpaidReservationsJob = async () => {
  try {
    console.log(
      `[${new Date().toISOString()}] Starting unpaid reservation cleanup job...`,
    );

    // Find pending reservations that have expired (expiresAt is in the past)
    const expiredPendingReservations = await Reservation.find({
      status: "pending",
      expiresAt: { $lte: new Date() },
    });

    console.log(
      `Found ${expiredPendingReservations.length} expired pending reservations`,
    );

    let cancelledCount = 0;
    let failedCount = 0;

    for (const reservation of expiredPendingReservations) {
      try {
        // Check if billing exists and is still unpaid
        const billing = await Billing.findOne({
          reservationId: reservation._id,
          status: { $in: ["unpaid", "partial"] }, // Only unpaid or partially paid
        });

        if (billing) {
          // Update reservation status to cancelled
          reservation.status = "cancelled";
          reservation.expiresAt = null; // Clear expiration date
          await reservation.save();

          // Optionally, you can also update the billing status
          billing.status = "voided";
          await billing.save();

          console.log(
            `Cancelled reservation ${reservation.reservationNumber} (Billing unpaid)`,
          );
          cancelledCount++;
        } else {
          // No billing found or billing is already paid - just update reservation
          reservation.status = "expired";
          reservation.expiresAt = null;
          await reservation.save();
          console.log(
            `Marked reservation ${reservation.reservationNumber} as expired`,
          );
        }
      } catch (error) {
        console.error(
          `Error processing reservation ${reservation.reservationNumber}:`,
          error,
        );
        failedCount++;
      }
    }

    console.log(
      `[${new Date().toISOString()}] Cleanup job completed: ${cancelledCount} cancelled, ${failedCount} failed`,
    );

    return {
      totalProcessed: expiredPendingReservations.length,
      cancelled: cancelledCount,
      failed: failedCount,
    };
  } catch (error) {
    console.error("Error in unpaid reservation cleanup job:", error);
    throw error;
  }
};

/**
 * Alternative: Cancel reservations older than X hours with unpaid billing
 * @param {number} hoursOld - Hours after which pending reservations should be cancelled
 */
export const cancelOldUnpaidReservations = async (hoursOld = 24) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursOld);

    console.log(
      `[${new Date().toISOString()}] Starting old unpaid reservation cleanup (older than ${hoursOld} hours)...`,
    );

    // Find pending reservations created before cutoff date
    const oldPendingReservations = await Reservation.find({
      status: "pending",
      createdAt: { $lte: cutoffDate },
    });

    console.log(
      `Found ${oldPendingReservations.length} old pending reservations`,
    );

    let cancelledCount = 0;
    let failedCount = 0;

    for (const reservation of oldPendingReservations) {
      try {
        // Check billing status
        const billing = await Billing.findOne({
          reservationId: reservation._id,
          status: { $in: ["unpaid", "partial"] },
        });

        if (billing) {
          reservation.status = "cancelled";
          reservation.expiresAt = null;
          await reservation.save();

          billing.status = "voided";
          await billing.save();

          console.log(
            `Cancelled old reservation ${reservation.reservationNumber}`,
          );
          cancelledCount++;
        }
      } catch (error) {
        console.error(
          `Error processing old reservation ${reservation.reservationNumber}:`,
          error,
        );
        failedCount++;
      }
    }

    console.log(
      `[${new Date().toISOString()}] Old reservation cleanup completed: ${cancelledCount} cancelled, ${failedCount} failed`,
    );

    return {
      totalProcessed: oldPendingReservations.length,
      cancelled: cancelledCount,
      failed: failedCount,
    };
  } catch (error) {
    console.error("Error in old unpaid reservation cleanup job:", error);
    throw error;
  }
};
