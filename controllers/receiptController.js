import Receipt from "../models/Receipt.js";
import Billing from "../models/Billing.js";
import cloudinary from "../config/cloudinary.js";
import mongoose from "mongoose";
import { createNotification } from "../models/Notification.js";
import ReservationModels from "../models/Reservation.js";
const { Reservation, ReservationRoom } = ReservationModels;

/**
 * Upload buffer to Cloudinary using upload_stream
 */
const uploadBufferToCloudinary = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      },
    );
    stream.end(buffer);
  });
};

/* -------------------- UPDATE RECEIPT STATUS -------------------- */
export const updateReceiptStatus = async (req, res) => {
  try {
    const { status, reservationId, reason } = req.body;
    const validStatuses = ["pending", "confirmed", "rejected"];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        message: "Valid status is required",
        validStatuses,
      });
    }

    const receipt = await Receipt.findById(req.params.id).populate(
      "paymentType billingId",
    );
    if (!receipt) return res.status(404).json({ message: "Receipt not found" });

    const previousStatus = receipt.status;

    if (previousStatus === status) {
      return res.json({
        message: `Receipt status is already ${status}`,
        receipt,
        previousStatus,
        newStatus: status,
      });
    }

    receipt.status = status;

    if (status === "rejected") {
      receipt.notes = reason ? `Rejected: ${reason}` : receipt.notes;
    }

    await receipt.save();

    let updatedReservation = null;
    let reservationStatusUpdate = null;

    // IF STATUS IS CONFIRMED AND RESERVATION ID IS PROVIDED, UPDATE RESERVATION STATUS
    if (status === "confirmed" && reservationId) {
      // Find and update the reservation
      const reservation = await Reservation.findById(reservationId);

      if (reservation) {
        const previousReservationStatus = reservation.status;

        // Update reservation to confirmed if not already
        if (previousReservationStatus !== "confirmed") {
          reservation.status = "confirmed";
          await reservation.save();
          updatedReservation = reservation;
          reservationStatusUpdate = {
            from: previousReservationStatus,
            to: "confirmed",
            receiptId: receipt._id,
          };

          console.log(
            `✅ Reservation ${reservation._id} (${reservation.reservationNumber}) status updated from ${previousReservationStatus} to confirmed`,
          );
        } else {
          console.log(`ℹ️ Reservation ${reservation._id} already confirmed`);
        }
      } else {
        console.log(`❌ Reservation not found for ID: ${reservationId}`);
      }
    }

    const billingNumber =
      receipt.billingId?.billingNumber || receipt.billingId?._id?.toString?.();
    const paymentTypeName = receipt.paymentType?.name || "Payment Type";

    await createNotification({
      actorUserId: req.user?._id || null,
      type: "billing",
      title:
        status === "confirmed" && reservationStatusUpdate
          ? "Receipt Confirmed & Reservation Updated"
          : "Receipt Status Updated",
      description: `Receipt for billing ${
        billingNumber || "N/A"
      } (${paymentTypeName}) changed from ${previousStatus} to ${status}.${
        receipt.referenceNumber ? ` Ref: ${receipt.referenceNumber}` : ""
      }${reservationStatusUpdate ? ` ✅ Reservation ${updatedReservation?.reservationNumber} status updated from ${reservationStatusUpdate.from} to ${reservationStatusUpdate.to}.` : ""}`,
      source: "Billing",
      entity: { kind: "Receipt", id: receipt._id },
    });

    return res.json({
      message:
        status === "confirmed" && reservationStatusUpdate
          ? `Receipt confirmed and reservation ${updatedReservation?.reservationNumber} confirmed successfully`
          : `Receipt status updated from ${previousStatus} to ${status}`,
      receipt,
      previousStatus,
      newStatus: status,
      reservationUpdated: !!updatedReservation,
      updatedReservation: updatedReservation
        ? {
            _id: updatedReservation._id,
            reservationNumber: updatedReservation.reservationNumber,
            status: updatedReservation.status,
            previousStatus: reservationStatusUpdate?.from,
          }
        : null,
      reservationStatusUpdate,
    });
  } catch (error) {
    console.error("Error updating receipt status:", error);
    return res.status(500).json({ message: error.message });
  }
};

// Create receipt with conditional validation
export const createReceipt = async (req, res) => {
  try {
    const {
      billingId,
      paymentType,
      amountPaid,
      amountReceived,
      status = "pending",
      notes,
      referenceNumber,
      isAdminInitiated = false,
    } = req.body;

    // Check if user is admin
    const role = req.user?.role;
    const isAdmin = role === "admin" || role === "superadmin";

    // Validation
    if (
      !billingId ||
      !paymentType ||
      !amountPaid ||
      amountReceived === undefined
    ) {
      return res.status(400).json({
        message:
          "Billing ID, payment type, amount paid, and amount received are required",
      });
    }

    // Validate amounts
    const paid = parseFloat(amountPaid);
    const received = parseFloat(amountReceived);

    if (paid <= 0) {
      return res
        .status(400)
        .json({ message: "Amount paid must be greater than 0" });
    }

    if (received < paid) {
      return res.status(400).json({
        message: "Amount received cannot be less than amount paid",
      });
    }

    const billing = await Billing.findById(billingId);
    if (!billing) return res.status(404).json({ message: "Billing not found" });

    const change = Math.max(0, received - paid);

    let receiptImages = [];

    // Get payment type to check requirements
    const PaymentType = mongoose.model("PaymentType");
    const paymentTypeDoc = await PaymentType.findById(paymentType);

    if (!paymentTypeDoc) {
      return res.status(404).json({ message: "Payment type not found" });
    }

    const requiresReceipt = paymentTypeDoc.isReceipt;

    // Determine if this is admin-initiated
    const isAdminAction = isAdminInitiated || isAdmin;

    // Receipt-required payment types must include an uploaded image.
    if (requiresReceipt) {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({
          message: `Receipt image is required for ${paymentTypeDoc.name}`,
        });
      }

      const result = await uploadBufferToCloudinary(
        req.file.buffer,
        "receipts",
      );
      receiptImages.push({
        url: result.secure_url,
        publicId: result.public_id,
      });
    } else {
      // Payment type doesn't require receipt
      if (req.file && req.file.buffer) {
        // If file was uploaded but payment type doesn't require receipt
        return res.status(400).json({
          message: `${paymentTypeDoc.name} does not require a receipt upload`,
        });
      }

      // Reference number is optional for non-receipt payment types
    }

    // Create receipt
    const receipt = new Receipt({
      billingId,
      paymentType,
      amountPaid: paid,
      amountReceived: received,
      status,
      change,
      receiptImages,
      referenceNumber: referenceNumber || null,
      notes: notes || "",
    });

    await receipt.save();

    const paymentTypeName = paymentTypeDoc?.name || "Payment Type";
    const createdBy = isAdminAction ? "Admin" : "User";

    await createNotification({
      actorUserId: req.user?._id || null,
      type: "billing",
      title: "New Receipt Created",
      description: `A receipt was created by ${createdBy} for billing ${billing.billingNumber}. Payment: ${paymentTypeName}. Amount paid: ${paid}. Status: ${status}.${
        referenceNumber ? ` Ref: ${referenceNumber}` : ""
      }${receiptImages.length > 0 ? " (with image)" : ""}`,
      source: "Billing",
      entity: { kind: "Receipt", id: receipt._id },
    });

    return res.status(201).json({
      message: "Receipt created successfully",
      receipt,
      createdBy,
      requiresReceipt,
      hasImage: receiptImages.length > 0,
      referenceNumber: referenceNumber || null,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Failed to create receipt",
      error: error.message,
    });
  }
};

// Get receipts by billing
export const getReceiptsByBilling = async (req, res) => {
  try {
    const { billingId } = req.params;
    const receipts = await Receipt.find({ billingId })
      .populate("paymentType billingId")
      .sort({ createdAt: -1 });

    return res.json(receipts);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Confirm receipt
export const confirmReceipt = async (req, res) => {
  try {
    const receipt = await Receipt.findById(req.params.id).populate(
      "paymentType billingId",
    );
    if (!receipt) {
      return res.status(404).json({ message: "Receipt not found" });
    }

    const previousStatus = receipt.status;

    receipt.status = "confirmed";
    await receipt.save();

    const billingNumber =
      receipt.billingId?.billingNumber || receipt.billingId?._id?.toString?.();
    const paymentTypeName = receipt.paymentType?.name || "Payment Type";

    await createNotification({
      actorUserId: req.user?._id || null,
      type: "billing",
      title: "Receipt Confirmed",
      description: `Receipt for billing ${
        billingNumber || "N/A"
      } (${paymentTypeName}) was confirmed (from ${previousStatus}).${
        receipt.referenceNumber ? ` Ref: ${receipt.referenceNumber}` : ""
      }${receipt.receiptImages?.length > 0 ? " (with image)" : ""}`,
      source: "Billing",
      entity: { kind: "Receipt", id: receipt._id },
    });

    return res.json({
      message: "Receipt confirmed",
      receipt,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

// Reject receipt
export const rejectReceipt = async (req, res) => {
  try {
    const { reason } = req.body;
    const receipt = await Receipt.findById(req.params.id).populate(
      "paymentType billingId",
    );
    if (!receipt) return res.status(404).json({ message: "Receipt not found" });

    const previousStatus = receipt.status;

    receipt.status = "rejected";
    receipt.notes = reason ? `Rejected: ${reason}` : receipt.notes;
    await receipt.save();

    const billingNumber =
      receipt.billingId?.billingNumber || receipt.billingId?._id?.toString?.();
    const paymentTypeName = receipt.paymentType?.name || "Payment Type";

    await createNotification({
      actorUserId: req.user?._id || null,
      type: "billing",
      title: "Receipt Rejected",
      description: `Receipt for billing ${
        billingNumber || "N/A"
      } (${paymentTypeName}) was rejected (from ${previousStatus})${
        reason ? `. Reason: ${reason}` : "."
      }${receipt.referenceNumber ? ` Ref: ${receipt.referenceNumber}` : ""}${
        receipt.receiptImages?.length > 0 ? " (with image)" : ""
      }`,
      source: "Billing",
      entity: { kind: "Receipt", id: receipt._id },
    });

    return res.json({
      message: "Receipt rejected",
      receipt,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Get receipt by ID
export const getReceiptById = async (req, res) => {
  try {
    const receipt = await Receipt.findById(req.params.id).populate(
      "paymentType billingId",
    );
    if (!receipt) return res.status(404).json({ message: "Receipt not found" });

    return res.json(receipt);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Delete receipt
export const deleteReceipt = async (req, res) => {
  try {
    const receipt = await Receipt.findById(req.params.id).populate(
      "paymentType billingId",
    );
    if (!receipt) return res.status(404).json({ message: "Receipt not found" });

    const billingNumber =
      receipt.billingId?.billingNumber || receipt.billingId?._id?.toString?.();
    const paymentTypeName = receipt.paymentType?.name || "Payment Type";

    // Delete image from Cloudinary if exists
    if (receipt.receiptImages?.length > 0) {
      for (const image of receipt.receiptImages) {
        if (image.publicId) {
          await cloudinary.uploader.destroy(image.publicId);
        }
      }
    }

    await receipt.deleteOne();

    await createNotification({
      actorUserId: req.user?._id || null,
      type: "billing",
      title: "Receipt Deleted",
      description: `Receipt for billing ${
        billingNumber || "N/A"
      } (${paymentTypeName}) was deleted. Status was: ${receipt.status}.${
        receipt.referenceNumber ? ` Ref: ${receipt.referenceNumber}` : ""
      }`,
      source: "Billing",
      entity: { kind: "Receipt", id: receipt._id },
    });

    return res.json({
      message: "Receipt deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Bulk delete receipts
export const deleteMultipleReceipts = async (req, res) => {
  try {
    const { receiptIds } = req.body;

    if (!Array.isArray(receiptIds) || receiptIds.length === 0) {
      return res.status(400).json({
        message: "receiptIds must be a non-empty array",
      });
    }

    const validIds = receiptIds.filter((id) =>
      mongoose.Types.ObjectId.isValid(id),
    );
    if (validIds.length === 0) {
      return res.status(400).json({
        message: "No valid receipt IDs provided",
      });
    }

    const receipts = await Receipt.find({ _id: { $in: validIds } }).populate(
      "paymentType billingId",
    );

    if (receipts.length === 0) {
      return res.status(404).json({
        message: "No receipts found with the provided IDs",
      });
    }

    const labels = [];
    const cloudinaryDeletions = [];

    for (const receipt of receipts) {
      const billingNumber =
        receipt.billingId?.billingNumber ||
        receipt.billingId?._id?.toString?.() ||
        "N/A";
      const paymentTypeName = receipt.paymentType?.name || "Payment Type";
      const refInfo = receipt.referenceNumber
        ? ` (Ref: ${receipt.referenceNumber})`
        : "";
      const imageInfo =
        receipt.receiptImages?.length > 0 ? " (with image)" : "";
      labels.push(
        `${billingNumber} (${paymentTypeName})${refInfo}${imageInfo}`,
      );

      if (receipt.receiptImages?.length > 0) {
        for (const image of receipt.receiptImages) {
          if (image.publicId) cloudinaryDeletions.push(image.publicId);
        }
      }
    }

    if (cloudinaryDeletions.length > 0) {
      try {
        const chunkSize = 100;
        for (let i = 0; i < cloudinaryDeletions.length; i += chunkSize) {
          const chunk = cloudinaryDeletions.slice(i, i + chunkSize);
          await cloudinary.api.delete_resources(chunk);
        }
      } catch (cloudinaryError) {
        console.error("Error deleting from Cloudinary:", cloudinaryError);
      }
    }

    const deleteResult = await Receipt.deleteMany({ _id: { $in: validIds } });

    await createNotification({
      actorUserId: req.user?._id || null,
      type: "billing",
      title: "Receipts Deleted",
      description:
        labels.length <= 10
          ? `Deleted ${deleteResult.deletedCount} receipt(s): ${labels.join(
              ", ",
            )}.`
          : `Deleted ${deleteResult.deletedCount} receipt(s). Example: ${labels
              .slice(0, 5)
              .join(", ")}...`,
      source: "Billing",
      entity: { kind: "Receipt", id: null },
    });

    return res.json({
      message: `${deleteResult.deletedCount} receipt(s) deleted successfully`,
      deletedCount: deleteResult.deletedCount,
    });
  } catch (error) {
    console.error("Bulk delete error:", error);
    return res.status(500).json({
      message: "Failed to delete receipts",
      error: error.message,
    });
  }
};

// Bulk confirm receipts
export const confirmMultipleReceipts = async (req, res) => {
  try {
    const { receiptIds } = req.body;

    if (!Array.isArray(receiptIds) || receiptIds.length === 0) {
      return res.status(400).json({
        message: "receiptIds must be a non-empty array",
      });
    }

    const validIds = receiptIds.filter((id) =>
      mongoose.Types.ObjectId.isValid(id),
    );
    if (validIds.length === 0) {
      return res.status(400).json({
        message: "No valid receipt IDs provided",
      });
    }

    const receipts = await Receipt.find({
      _id: { $in: validIds },
      status: { $ne: "confirmed" },
    }).populate("paymentType billingId");

    if (receipts.length === 0) {
      return res.status(404).json({
        message: "No pending receipts found with the provided IDs",
      });
    }

    const billingMap = {};
    for (const receipt of receipts) {
      const key =
        receipt.billingId?._id?.toString?.() || receipt.billingId.toString();
      if (!billingMap[key]) billingMap[key] = [];
      billingMap[key].push(receipt);
    }

    for (const billingId of Object.keys(billingMap)) {
      const billing = await Billing.findById(billingId);
      if (!billing) continue;

      const currentConfirmed = await Receipt.find({
        billingId,
        status: "confirmed",
      });

      const currentTotalPaid = currentConfirmed.reduce(
        (sum, r) => sum + Number(r.amountPaid || 0),
        0,
      );

      const receiptsToConfirm = billingMap[billingId];
      const newPaymentsTotal = receiptsToConfirm.reduce(
        (sum, r) => sum + Number(r.amountPaid || 0),
        0,
      );

      const newTotalPaid = currentTotalPaid + newPaymentsTotal;

      if (billing.amountDueNow && billing.amountDueNow > 0) {
        if (newTotalPaid < billing.amountDueNow) {
          return res.status(400).json({
            message: `Minimum payment required for billing ${
              billing.billingNumber
            } is ${billing.amountDueNow.toFixed(
              2,
            )}. Cannot confirm these receipts.`,
          });
        }
      }
    }

    const updateResult = await Receipt.updateMany(
      { _id: { $in: receipts.map((r) => r._id) } },
      { $set: { status: "confirmed" } },
    );

    const labels = receipts.map((r) => {
      const billingNumber =
        r.billingId?.billingNumber || r.billingId?._id?.toString?.() || "N/A";
      const paymentTypeName = r.paymentType?.name || "Payment Type";
      const refInfo = r.referenceNumber ? ` (Ref: ${r.referenceNumber})` : "";
      const imageInfo = r.receiptImages?.length > 0 ? " (with image)" : "";
      return `${billingNumber} (${paymentTypeName})${refInfo}${imageInfo}`;
    });

    await createNotification({
      actorUserId: req.user?._id || null,
      type: "billing",
      title: "Receipts Confirmed",
      description:
        labels.length <= 10
          ? `Confirmed ${updateResult.modifiedCount} receipt(s): ${labels.join(
              ", ",
            )}.`
          : `Confirmed ${updateResult.modifiedCount} receipt(s). Example: ${labels
              .slice(0, 5)
              .join(", ")}...`,
      source: "Billing",
      entity: { kind: "Receipt", id: null },
    });

    const updatedReceipts = await Receipt.find({
      _id: { $in: receipts.map((r) => r._id) },
    }).populate("paymentType billingId");

    return res.json({
      message: `${updateResult.modifiedCount} receipt(s) confirmed successfully`,
      modifiedCount: updateResult.modifiedCount,
      receipts: updatedReceipts,
    });
  } catch (error) {
    console.error("Bulk confirm error:", error);
    return res.status(500).json({
      message: "Failed to confirm receipts",
      error: error.message,
    });
  }
};

// Bulk reject receipts
export const rejectMultipleReceipts = async (req, res) => {
  try {
    const { receiptIds, reason } = req.body;

    if (!Array.isArray(receiptIds) || receiptIds.length === 0) {
      return res.status(400).json({
        message: "receiptIds must be a non-empty array",
      });
    }

    const validIds = receiptIds.filter((id) =>
      mongoose.Types.ObjectId.isValid(id),
    );
    if (validIds.length === 0) {
      return res.status(400).json({
        message: "No valid receipt IDs provided",
      });
    }

    const receipts = await Receipt.find({ _id: { $in: validIds } }).populate(
      "paymentType billingId",
    );

    if (receipts.length === 0) {
      return res.status(404).json({
        message: "No receipts found with the provided IDs",
      });
    }

    const updateResult = await Receipt.updateMany(
      { _id: { $in: receipts.map((r) => r._id) } },
      {
        $set: {
          status: "rejected",
          notes: reason ? `Bulk rejected: ${reason}` : "Bulk rejected",
        },
      },
    );

    const labels = receipts.map((r) => {
      const billingNumber =
        r.billingId?.billingNumber || r.billingId?._id?.toString?.() || "N/A";
      const paymentTypeName = r.paymentType?.name || "Payment Type";
      const refInfo = r.referenceNumber ? ` (Ref: ${r.referenceNumber})` : "";
      const imageInfo = r.receiptImages?.length > 0 ? " (with image)" : "";
      return `${billingNumber} (${paymentTypeName})${refInfo}${imageInfo}`;
    });

    await createNotification({
      actorUserId: req.user?._id || null,
      type: "billing",
      title: "Receipts Rejected",
      description:
        labels.length <= 10
          ? `Rejected ${updateResult.modifiedCount} receipt(s): ${labels.join(
              ", ",
            )}.${reason ? ` Reason: ${reason}.` : ""}`
          : `Rejected ${updateResult.modifiedCount} receipt(s). Example: ${labels
              .slice(0, 5)
              .join(", ")}...${reason ? ` Reason: ${reason}.` : ""}`,
      source: "Billing",
      entity: { kind: "Receipt", id: null },
    });

    return res.json({
      message: `${updateResult.modifiedCount} receipt(s) rejected successfully`,
      modifiedCount: updateResult.modifiedCount,
    });
  } catch (error) {
    console.error("Bulk reject error:", error);
    return res.status(500).json({
      message: "Failed to reject receipts",
      error: error.message,
    });
  }
};

// Helper: Get billing with receipts
export const getBillingWithReceipts = async (req, res) => {
  try {
    const { billingId } = req.params;
    const billing = await Billing.findById(billingId)
      .populate("reservationId")
      .populate({
        path: "receipts",
        populate: { path: "paymentType" },
      });

    if (!billing) {
      return res.status(404).json({ message: "Billing not found" });
    }

    return res.json(billing);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
  