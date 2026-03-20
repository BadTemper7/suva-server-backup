import DiscountImg from "../models/DiscountImage.js";
import Billing from "../models/Billing.js";
import ReservationModels from "../models/Reservation.js";
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

    return res.status(200).json({
      message: "Discount image rejected",
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

  // ✅ Fetch reservation + payment option (where the percentage lives)
  const reservation = await Reservation.findById(
    billing.reservationId
  ).populate("paymentOption");
  if (!reservation) return;

  // ---- IMPORTANT: change this to your real field name ----
  // Example: paymentOption.depositPercent is 50 meaning 50%
  const partialPercentRaw = reservation.paymentOption?.depositPercent ?? 100; // fallback to full payment
  const partialRate =
    Math.max(0, Math.min(100, Number(partialPercentRaw))) / 100;
  // --------------------------------------------------------

  // Normalize paid amount
  const amountPaid = Number(billing.amountPaid || 0);

  // 1) Fetch rooms + amenities
  const reservationRooms = await ReservationRoom.find({
    reservationId: billing.reservationId,
  })
    .populate("roomId")
    .populate("amenities.amenityId");

  // 2) Build room subtotals
  const roomTotals = reservationRooms.map((r) => {
    let subtotal = Number(r.roomId?.rate || 0);

    r.amenities.forEach((a) => {
      subtotal += Number(a.amenityId?.rate || 0) * Number(a.quantity || 0);
    });

    return {
      reservationRoomId: r._id.toString(),
      subtotal,
    };
  });

  const subTotal = roomTotals.reduce((sum, r) => sum + r.subtotal, 0);

  // 3) Fetch confirmed discount images
  const confirmedDiscountImages = await DiscountImg.find({
    billingId,
    status: "confirmed",
  }).populate("discountId");

  let totalDiscountAmount = 0;
  const discountedRooms = new Set();

  // 4) Apply discounts
  for (const dImg of confirmedDiscountImages) {
    const discount = dImg.discountId;
    if (!discount || !discount.isActive) continue;

    let eligibleRooms = roomTotals.filter(
      (r) => !discountedRooms.has(r.reservationRoomId)
    );
    if (!eligibleRooms.length) continue;

    // Applies to all rooms (only once)
    if (discount.appliesToAllRooms) {
      const discountValue = Math.floor(
        (subTotal * discount.discountPercent) / 100
      );
      totalDiscountAmount += discountValue;
      break;
    }

    // Sort by priority
    if (discount.discountPriority === "highest") {
      eligibleRooms.sort((a, b) => b.subtotal - a.subtotal);
    } else if (discount.discountPriority === "lowest") {
      eligibleRooms.sort((a, b) => a.subtotal - b.subtotal);
    }

    // Limit eligible rooms
    if (discount.maxRoomCount) {
      eligibleRooms = eligibleRooms.slice(0, discount.maxRoomCount);
    }

    // One room per discount image
    const targetRoom = eligibleRooms[0];
    if (targetRoom) {
      const roomDiscount = Math.floor(
        (targetRoom.subtotal * discount.discountPercent) / 100
      );
      totalDiscountAmount += roomDiscount;
      discountedRooms.add(targetRoom.reservationRoomId);
    }
  }

  // 5) Update billing totals
  const totalAmount = Math.max(0, Math.floor(subTotal - totalDiscountAmount));

  // ✅ amountDue is partial % of totalAmount (deposit/downpayment)
  const amountDue = Math.max(0, Math.floor(totalAmount * partialRate));

  // ✅ balance is what remains to be paid (based on amountDue, not totalAmount)
  const balance = Math.max(0, amountDue - amountPaid);
  const change = amountPaid > amountDue ? amountPaid - amountDue : 0;

  billing.subTotal = Math.floor(subTotal);
  billing.discountAmount = Math.floor(totalDiscountAmount);
  billing.totalAmount = totalAmount;

  billing.amountDue = amountDue; // ✅ key line

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
