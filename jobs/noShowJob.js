import mongoose from "mongoose";
import ReservationModel from "../models/Reservation.js";
const { Reservation } = ReservationModel;

/**
 * Job to mark reservations as no-show if not checked in by check-in date
 * Runs daily to check for no-show reservations
 */
export const markNoShowReservationsJob = async () => {
  try {
    console.log(
      `[${new Date().toISOString()}] Starting no-show reservation check...`,
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today

    // Find confirmed reservations where:
    // 1. Status is "confirmed" (not pending, cancelled, etc.)
    // 2. Check-in date is today or in the past
    // 3. Not already checked in
    const potentialNoShows = await Reservation.find({
      status: "confirmed",
      checkIn: { $lte: today },
      $or: [
        { checkOut: { $gt: today } }, // Check-out is after today
        { checkOut: { $gte: today } }, // Or check-out is today
      ],
    });

    console.log(
      `Found ${potentialNoShows.length} potential no-show reservations`,
    );

    let noShowCount = 0;
    let failedCount = 0;

    for (const reservation of potentialNoShows) {
      try {
        // Calculate if check-in time has passed (e.g., 2PM check-in time)
        const checkInDate = new Date(reservation.checkIn);
        const checkInTime = new Date(checkInDate);

        // Set check-in time to 2:00 PM (14:00) as standard check-in time
        checkInTime.setHours(14, 0, 0, 0);

        const now = new Date();

        // If current time is past check-in time + grace period (e.g., 2 hours)
        const gracePeriod = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
        const checkInDeadline = new Date(checkInTime.getTime() + gracePeriod);

        if (now > checkInDeadline) {
          // Mark as no-show
          reservation.status = "no_show";
          await reservation.save();

          console.log(
            `Marked reservation ${reservation.reservationNumber} as no-show (Check-in: ${checkInDate.toDateString()})`,
          );
          noShowCount++;
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
      `[${new Date().toISOString()}] No-show job completed: ${noShowCount} marked as no-show, ${failedCount} failed`,
    );

    return {
      totalProcessed: potentialNoShows.length,
      noShow: noShowCount,
      failed: failedCount,
    };
  } catch (error) {
    console.error("Error in no-show reservation job:", error);
    throw error;
  }
};

/**
 * Alternative: Mark reservations as no-show based on check-out date
 * For reservations that never checked in and check-out date has passed
 */
export const markNoShowAfterCheckOutJob = async () => {
  try {
    console.log(
      `[${new Date().toISOString()}] Starting no-show after check-out check...`,
    );

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999); // End of yesterday

    // Find confirmed reservations where:
    // 1. Status is "confirmed"
    // 2. Check-out date is in the past (yesterday or earlier)
    // 3. Never checked in
    const missedReservations = await Reservation.find({
      status: "confirmed",
      checkOut: { $lte: yesterday },
    });

    console.log(`Found ${missedReservations.length} missed reservations`);

    let noShowCount = 0;
    let failedCount = 0;

    for (const reservation of missedReservations) {
      try {
        // Mark as no-show
        reservation.status = "no_show";
        await reservation.save();

        console.log(
          `Marked reservation ${reservation.reservationNumber} as no-show (Check-out passed: ${reservation.checkOut.toDateString()})`,
        );
        noShowCount++;
      } catch (error) {
        console.error(
          `Error processing missed reservation ${reservation.reservationNumber}:`,
          error,
        );
        failedCount++;
      }
    }

    console.log(
      `[${new Date().toISOString()}] No-show after check-out job completed: ${noShowCount} marked as no-show, ${failedCount} failed`,
    );

    return {
      totalProcessed: missedReservations.length,
      noShow: noShowCount,
      failed: failedCount,
    };
  } catch (error) {
    console.error("Error in no-show after check-out job:", error);
    throw error;
  }
};
