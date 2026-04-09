import DiscountImg from "../models/DiscountImage.js";
import Billing from "../models/Billing.js";
import ReservationModels from "../models/Reservation.js";
import Discount from "../models/Discount.js";
import cloudinary from "../config/cloudinary.js";
import mongoose from "mongoose";
import PaymentOption from "../models/PaymentOption.js";

const { Reservation, ReservationRoom } = ReservationModels;

/**
 * ---------------------------------------------
 * CREATE DISCOUNT IMAGE
 * ---------------------------------------------
 */
export const createDiscountImage = async (req, res) => {
  try {
    const { discountId, billingId, status = "pending" } = req.body;

    if (!discountId)
      return res.status(400).json({ error: "discountId is required" });

    if (!req.file)
      return res.status(400).json({ error: "Image file is required" });

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "discount",
    });

    const discountImage = new DiscountImg({
      discountId,
      billingId: billingId || null,
      url: result.secure_url,
      publicId: result.public_id,
      status,
    });

    await discountImage.save();

    // Auto-apply discount if admin confirms immediately
    if (status === "confirmed" && billingId) {
      await applyDiscountsToBilling(billingId);
    }

    return res.status(201).json({
      message: "Discount image uploaded successfully",
      discountImage: {
        _id: discountImage._id,
        ...discountImage.toObject(),
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * ---------------------------------------------
 * CONFIRM DISCOUNT IMAGE
 * ---------------------------------------------
 */
export const confirmDiscountImage = async (req, res) => {
  try {
    const { discountImageId, userId } = req.body;

    if (!mongoose.isValidObjectId(discountImageId))
      return res.status(400).json({ error: "Invalid discountImageId" });

    const discountImage = await DiscountImg.findById(discountImageId);
    if (!discountImage)
      return res.status(404).json({ error: "Discount image not found" });

    if (discountImage.status === "confirmed")
      return res.status(400).json({ error: "Discount already confirmed" });

    discountImage.status = "confirmed";
    discountImage.reviewedBy = userId || null;
    discountImage.reviewedAt = new Date();
    await discountImage.save();

    if (discountImage.billingId) {
      await applyDiscountsToBilling(discountImage.billingId);
    }

    return res.status(200).json({
      message: "Discount image confirmed and billing updated",
      discountImage,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * ---------------------------------------------
 * REJECT DISCOUNT IMAGE
 * ---------------------------------------------
 */
export const rejectDiscountImage = async (req, res) => {
  try {
    const { discountImageId, userId, reason } = req.body;

    if (!mongoose.isValidObjectId(discountImageId))
      return res.status(400).json({ error: "Invalid discountImageId" });

    const discountImage = await DiscountImg.findById(discountImageId);
    if (!discountImage)
      return res.status(404).json({ error: "Discount image not found" });

    discountImage.status = "rejected";
    discountImage.reviewedBy = userId || null;
    discountImage.reviewedAt = new Date();
    discountImage.rejectionReason = reason || null;

    await discountImage.save();

    if (discountImage.billingId) {
      await applyDiscountsToBilling(discountImage.billingId);
    }

    return res.status(200).json({
      message: "Discount image rejected and billing updated",
      discountImage,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * ---------------------------------------------
 * CORE DISCOUNT + BILLING LOGIC
 * ---------------------------------------------
 */
const applyDiscountsToBilling = async (billingId) => {
  const billing = await Billing.findById(billingId);
  if (!billing) return;

  const reservation = await Reservation.findById(
    billing.reservationId,
  ).populate("paymentOption");
  if (!reservation) return;

  const partialPercentRaw = reservation.paymentOption?.depositPercent ?? 100;
  const partialRate =
    Math.max(0, Math.min(100, Number(partialPercentRaw))) / 100;
  const amountPaid = Number(billing.amountPaid || 0);

  // Fetch rooms + addOns (not amenities)
  const reservationRooms = await ReservationRoom.find({
    reservationId: billing.reservationId,
  })
    .populate("roomId")
    .populate("addOns.addOnId"); // Changed from amenities to addOns

  // Build room subtotals with addOns
  const roomTotals = reservationRooms.map((r) => {
    let subtotal = Number(r.roomId?.rate || 0);

    r.addOns.forEach((a) => {
      subtotal += Number(a.addOnId?.rate || 0) * Number(a.quantity || 0);
    });

    return {
      reservationRoomId: r._id.toString(),
      subtotal,
    };
  });

  const subTotal = roomTotals.reduce((sum, r) => sum + r.subtotal, 0);

  // Fetch confirmed discount images
  const confirmedDiscountImages = await DiscountImg.find({
    billingId,
    status: "confirmed",
  }).populate("discountId");

  let totalDiscountAmount = 0;
  const discountedRooms = new Set();

  const resDiscId = reservation.discountId;
  if (resDiscId) {
    const resDiscount = await Discount.findById(resDiscId).lean();
    if (resDiscount?.isActive && resDiscount.isPerId) {
      const totalPax = Math.max(
        1,
        Number(reservation.adults || 0) + Number(reservation.children || 0),
      );
      const declared = Math.min(
        Math.max(
          0,
          Number(reservation.seniorCitizenCount || 0) +
            Number(reservation.pwdCount || 0),
        ),
        totalPax,
      );
      const maxCap =
        resDiscount.maxRoomCount != null
          ? Math.min(declared, resDiscount.maxRoomCount)
          : declared;
      const rid = String(resDiscId);
      const confirmedCount = confirmedDiscountImages.filter((img) => {
        const did = img.discountId?._id || img.discountId;
        return did && String(did) === rid;
      }).length;
      const n = Math.min(maxCap, confirmedCount);
      const pct = Number(resDiscount.discountPercent || 20) / 100;
      totalDiscountAmount += Math.floor((subTotal / totalPax) * pct * n);
    }
  }

  // Apply discounts
  for (const dImg of confirmedDiscountImages) {
    const discount = dImg.discountId;
    if (!discount || !discount.isActive) continue;

    if (
      discount.isPerId &&
      resDiscId &&
      String(discount._id || discount) === String(resDiscId)
    ) {
      continue;
    }

    let eligibleRooms = roomTotals.filter(
      (r) => !discountedRooms.has(r.reservationRoomId),
    );
    if (!eligibleRooms.length) continue;

    if (discount.appliesToAllRooms) {
      const discountValue = Math.floor(
        (subTotal * discount.discountPercent) / 100,
      );
      totalDiscountAmount += discountValue;
      break;
    }

    if (discount.discountPriority === "highest") {
      eligibleRooms.sort((a, b) => b.subtotal - a.subtotal);
    } else if (discount.discountPriority === "lowest") {
      eligibleRooms.sort((a, b) => a.subtotal - b.subtotal);
    }

    if (discount.maxRoomCount) {
      eligibleRooms = eligibleRooms.slice(0, discount.maxRoomCount);
    }

    const targetRoom = eligibleRooms[0];
    if (targetRoom) {
      const roomDiscount = Math.floor(
        (targetRoom.subtotal * discount.discountPercent) / 100,
      );
      totalDiscountAmount += roomDiscount;
      discountedRooms.add(targetRoom.reservationRoomId);
    }
  }

  const totalAmount = Math.max(0, Math.floor(subTotal - totalDiscountAmount));
  const amountDue = Math.max(0, Math.floor(totalAmount * partialRate));
  const balance = Math.max(0, amountDue - amountPaid);
  const change = amountPaid > amountDue ? amountPaid - amountDue : 0;

  billing.subTotal = Math.floor(subTotal);
  billing.discountAmount = Math.floor(totalDiscountAmount);
  billing.totalAmount = totalAmount;
  billing.amountDue = amountDue;
  billing.amountPaid = amountPaid;
  billing.balance = balance;
  billing.change = change;

  if (amountPaid >= amountDue) {
    billing.status = "paid";
  } else {
    billing.status = amountPaid > 0 ? "partial" : "unpaid";
  }

  await billing.save();
};

/**
 * ---------------------------------------------
 * GET DISCOUNT IMAGES BY BILLING ID
 * ---------------------------------------------
 */
export const getDiscountImagesByBilling = async (req, res) => {
  try {
    const { billingId } = req.params;

    if (!mongoose.isValidObjectId(billingId)) {
      return res.status(400).json({ error: "Invalid billingId" });
    }

    const discountImages = await DiscountImg.find({ billingId })
      .populate("discountId")
      .populate("reviewedBy", "firstName lastName username")
      .sort({ createdAt: -1 });

    return res.status(200).json(discountImages);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * ---------------------------------------------
 * GET ALL DISCOUNT IMAGES (with filters)
 * ---------------------------------------------
 */
export const getAllDiscountImages = async (req, res) => {
  try {
    const { status, discountId, billingId } = req.query;

    let filter = {};
    if (status) filter.status = status;
    if (discountId) filter.discountId = discountId;
    if (billingId) filter.billingId = billingId;

    const discountImages = await DiscountImg.find(filter)
      .populate("discountId")
      .populate("billingId")
      .populate("reviewedBy", "firstName lastName username")
      .sort({ createdAt: -1 });

    return res.status(200).json(discountImages);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * ---------------------------------------------
 * GET SINGLE DISCOUNT IMAGE
 * ---------------------------------------------
 */
export const getDiscountImageById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid discount image id" });
    }

    const discountImage = await DiscountImg.findById(id)
      .populate("discountId")
      .populate("billingId")
      .populate("reviewedBy", "firstName lastName username");

    if (!discountImage) {
      return res.status(404).json({ error: "Discount image not found" });
    }

    return res.status(200).json(discountImage);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * ---------------------------------------------
 * DELETE DISCOUNT IMAGE
 * ---------------------------------------------
 */
export const deleteDiscountImage = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid discount image id" });
    }

    const discountImage = await DiscountImg.findById(id);
    if (!discountImage) {
      return res.status(404).json({ error: "Discount image not found" });
    }

    // Delete from cloudinary
    if (discountImage.publicId) {
      await cloudinary.uploader.destroy(discountImage.publicId);
    }

    await discountImage.deleteOne();

    return res.status(200).json({
      message: "Discount image deleted successfully",
      discountImage,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * ---------------------------------------------
 * DELETE MULTIPLE DISCOUNT IMAGES
 * ---------------------------------------------
 */
export const deleteMultipleDiscountImages = async (req, res) => {
  try {
    const { discountImageIds } = req.body;

    if (
      !discountImageIds ||
      !Array.isArray(discountImageIds) ||
      discountImageIds.length === 0
    ) {
      return res
        .status(400)
        .json({ error: "discountImageIds must be a non-empty array" });
    }

    // Validate all IDs
    for (const id of discountImageIds) {
      if (!mongoose.isValidObjectId(id)) {
        return res
          .status(400)
          .json({ error: `Invalid discount image id: ${id}` });
      }
    }

    // Get images to delete from cloudinary
    const imagesToDelete = await DiscountImg.find({
      _id: { $in: discountImageIds },
    });

    // Delete from cloudinary
    for (const image of imagesToDelete) {
      if (image.publicId) {
        await cloudinary.uploader.destroy(image.publicId);
      }
    }

    // Delete from database
    const result = await DiscountImg.deleteMany({
      _id: { $in: discountImageIds },
    });

    return res.status(200).json({
      message: `${result.deletedCount} discount image(s) deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};
