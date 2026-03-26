// jobs/cancelExpiredReservations.js
import mongoose from "mongoose";
import Billing from "../models/Billing.js";
import Receipt from "../models/Receipt.js";
import ReservationModel from "../models/Reservation.js";
import { createNotification } from "../models/Notification.js";
import { emailQueue } from "../utils/emailQueue.js";
import { broadcast } from "../wsServer.js";
const { Reservation, ReservationRoom } = ReservationModel;
/**
 * Cancel expired pending reservations
 * Runs automatically to clean up reservations that have been pending for too long
 */
export async function cancelExpiredReservations() {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const now = new Date();
    const expirationHours = process.env.RESERVATION_EXPIRATION_HOURS || 24; // Default 24 hours
    const expirationTime = new Date(
      now.getTime() - expirationHours * 60 * 60 * 1000,
    );

    // Find all expired pending reservations
    const expiredReservations = await Reservation.find({
      status: "pending",
      expiresAt: { $ne: null, $lte: now },
    })
      .populate("guestId", "firstName lastName email contactNumber")
      .populate("paymentOption")
      .session(session);

    if (expiredReservations.length === 0) {
      console.log("✅ No expired pending reservations found");
      await session.commitTransaction();
      session.endSession();
      return {
        success: true,
        matched: 0,
        modified: 0,
        message: "No expired reservations to cancel",
      };
    }

    console.log(
      `🔍 Found ${expiredReservations.length} expired pending reservation(s) (pending for > ${expirationHours} hours)`,
    );

    // Get all reservation IDs for related data cleanup
    const reservationIds = expiredReservations.map((r) => r._id);

    // Find related billings
    const billings = await Billing.find({
      reservationId: { $in: reservationIds },
    }).session(session);
    const billingIds = billings.map((b) => b._id);

    // Delete receipt images from Cloudinary
    let deletedImagesCount = 0;
    if (billingIds.length > 0) {
      const receipts = await Receipt.find({
        billingId: { $in: billingIds },
      }).session(session);

      for (const receipt of receipts) {
        if (receipt.receiptImages && receipt.receiptImages.length > 0) {
          for (const image of receipt.receiptImages) {
            if (image.publicId) {
              try {
                await cloudinary.uploader.destroy(image.publicId);
                deletedImagesCount++;
              } catch (cloudinaryErr) {
                console.warn(
                  `Failed to delete Cloudinary image ${image.publicId}:`,
                  cloudinaryErr.message,
                );
              }
            }
          }
        }
      }

      // Delete receipts
      await Receipt.deleteMany({ billingId: { $in: billingIds } }).session(
        session,
      );
    }

    // Delete billings
    if (billingIds.length > 0) {
      await Billing.deleteMany({ _id: { $in: billingIds } }).session(session);
    }

    // Delete reservation rooms
    await ReservationRoom.deleteMany({
      reservationId: { $in: reservationIds },
    }).session(session);

    // Update reservations to cancelled
    const result = await Reservation.updateMany(
      {
        _id: { $in: reservationIds },
        status: "pending",
        expiresAt: { $ne: null, $lte: now },
      },
      {
        $set: {
          status: "cancelled",
          expiresAt: null,
          cancelledAt: now,
          cancellationReason: `Expired - No confirmation within ${expirationHours} hours`,
        },
      },
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    // Create notifications and queue emails (outside transaction)
    for (const reservation of expiredReservations) {
      const guestName = reservation.guestId
        ? `${reservation.guestId.firstName || ""} ${reservation.guestId.lastName || ""}`.trim()
        : "Guest";

      // Create notification for admin/staff
      await createNotification({
        actorUserId: null,
        type: "reservation",
        title: "Reservation Expired & Cancelled",
        description: `Reservation ${reservation.reservationNumber} for ${guestName} has been automatically cancelled after being pending for ${expirationHours} hours.`,
        source: "System",
        entity: { kind: "Reservation", id: reservation._id },
        priority: "medium",
      });

      // Queue email notification to guest
      if (reservation.guestId?.email) {
        emailQueue.add({
          reservation: {
            ...reservation.toObject(),
            status: "cancelled",
            cancellationReason: `Expired - No confirmation within ${expirationHours} hours`,
          },
          guest: reservation.guestId,
          oldStatus: "pending",
          newStatus: "cancelled",
          retryCount: 0,
        });
        console.log(
          `📧 Email queued for expired reservation: ${reservation.reservationNumber}`,
        );
      }

      // Broadcast cancellation via WebSocket
      broadcast({
        type: "RESERVATION_UPDATED",
        action: "auto_cancel",
        reservation: {
          _id: reservation._id,
          reservationNumber: reservation.reservationNumber,
          status: "cancelled",
          reason: `Expired after ${expirationHours} hours pending`,
        },
      });
    }

    console.log(
      `✅ Successfully cancelled ${result.modifiedCount} expired reservations`,
    );
    console.log(`   - Deleted ${deletedImagesCount} images from Cloudinary`);
    console.log(`   - Deleted ${billings.length} related billings`);
    console.log(
      `   - Deleted ${billingIds.length > 0 ? receipts?.length || 0 : 0} receipts`,
    );

    return {
      success: true,
      matched: result.matchedCount,
      modified: result.modifiedCount,
      deletedImagesCount,
      deletedBillings: billings.length,
      message: `${result.modifiedCount} expired reservation(s) cancelled successfully`,
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ Error canceling expired reservations:", error);
    return {
      success: false,
      error: error.message,
      message: "Failed to process expired reservations",
    };
  }
}

// For scheduled jobs (cron)
export const cancelExpiredReservationsJob = {
  name: "Cancel Expired Reservations",
  schedule: "0 */2 * * *", // Run every 2 hours
  handler: cancelExpiredReservations,
};
