// jobs/cancelExpiredReceipts.js
import mongoose from "mongoose";
import Receipt from "../models/Receipt.js";
import Billing from "../models/Billing.js";
import { createNotification } from "../models/Notification.js";
import { broadcast } from "../wsServer.js";
import cloudinary from "../config/cloudinary.js";

/**
 * Cancel expired pending receipts
 * Runs automatically to clean up receipts that have been pending for too long
 */
export async function cancelExpiredReceipts() {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const now = new Date();
    const expirationHours = process.env.RECEIPT_EXPIRATION_HOURS || 24; // Default 24 hours
    const expirationTime = new Date(
      now.getTime() - expirationHours * 60 * 60 * 1000,
    );

    // Find all expired pending receipts (older than expiration time)
    const expiredReceipts = await Receipt.find({
      status: "pending",
      createdAt: { $lte: expirationTime },
    })
      .populate({
        path: "billingId",
        populate: {
          path: "reservationId",
          populate: {
            path: "guestId",
            select: "firstName lastName email",
          },
        },
      })
      .populate("paymentType")
      .session(session);

    if (expiredReceipts.length === 0) {
      console.log("✅ No expired pending receipts found");
      await session.commitTransaction();
      session.endSession();
      return {
        success: true,
        matched: 0,
        modified: 0,
        message: "No expired receipts to cancel",
      };
    }

    console.log(
      `🔍 Found ${expiredReceipts.length} expired pending receipt(s) (older than ${expirationHours} hours)`,
    );

    // Delete images from Cloudinary for expired receipts
    let deletedImagesCount = 0;
    for (const receipt of expiredReceipts) {
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

    // Get unique billing IDs for recalculation
    const uniqueBillingIds = [
      ...new Set(expiredReceipts.map((r) => r.billingId?._id).filter(Boolean)),
    ];

    // Delete expired receipts
    const result = await Receipt.deleteMany(
      {
        _id: { $in: expiredReceipts.map((r) => r._id) },
        status: "pending",
        createdAt: { $lte: expirationTime },
      },
      { session },
    );

    // Recalculate all affected billings
    let recalculatedBillings = 0;
    for (const billingId of uniqueBillingIds) {
      try {
        await fetch(
          `${process.env.API_URL || "http://localhost:5000"}/api/billings/calculate/${billingId}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
        recalculatedBillings++;
      } catch (calcErr) {
        console.error(
          `Failed to recalculate billing ${billingId}:`,
          calcErr.message,
        );
      }
    }

    // Create notifications for each expired receipt
    for (const receipt of expiredReceipts) {
      const guestName = receipt.billingId?.reservationId?.guestId
        ? `${receipt.billingId.reservationId.guestId.firstName} ${receipt.billingId.reservationId.guestId.lastName}`.trim()
        : "Guest";
      const guestEmail = receipt.billingId?.reservationId?.guestId?.email;
      const billingNumber = receipt.billingId?.billingNumber || "N/A";
      const paymentTypeName = receipt.paymentType?.name || "Unknown";

      // Create notification for admin/staff
      await createNotification({
        actorUserId: null,
        type: "billing",
        title: "Expired Pending Receipt Deleted",
        description: `Receipt for billing ${billingNumber} (${paymentTypeName}) from ${guestName} has been automatically deleted after being pending for ${expirationHours} hours. Amount: ${receipt.amountPaid}.`,
        source: "System",
        entity: { kind: "Receipt", id: receipt._id },
        priority: "low",
      });

      // Queue email notification to admin (optional)
      if (process.env.ADMIN_EMAIL) {
        try {
          // You could add an email queue here for admin notification
          console.log(
            `📧 Admin notification queued for expired receipt from ${guestName}`,
          );
        } catch (emailErr) {
          console.error("Failed to queue admin notification:", emailErr);
        }
      }

      // Broadcast receipt deletion via WebSocket
      broadcast({
        type: "RECEIPT_DELETED",
        action: "auto_delete",
        receipt: {
          _id: receipt._id,
          billingId: receipt.billingId?._id,
          amountPaid: receipt.amountPaid,
          reason: `Expired after ${expirationHours} hours pending`,
        },
      });
    }

    await session.commitTransaction();
    session.endSession();

    console.log(
      `✅ Successfully deleted ${result.deletedCount} expired receipts`,
    );
    console.log(`   - Deleted ${deletedImagesCount} images from Cloudinary`);
    console.log(`   - Recalculated ${recalculatedBillings} billings`);

    return {
      success: true,
      deletedCount: result.deletedCount,
      deletedImagesCount,
      recalculatedBillings,
      message: `${result.deletedCount} expired pending receipt(s) deleted successfully`,
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ Error canceling expired receipts:", error);
    return {
      success: false,
      error: error.message,
      message: "Failed to process expired receipts",
    };
  }
}

// For scheduled jobs (cron)
export const cancelExpiredReceiptsJob = {
  name: "Cancel Expired Receipts",
  schedule: "0 */6 * * *", // Run every 6 hours
  handler: cancelExpiredReceipts,
};
