import ReservationModels from "../models/Reservation.js";
import Billing from "../models/Billing.js";
import Receipt from "../models/Receipt.js";
import DiscountImage from "../models/DiscountImage.js";
import Room from "../models/Room.js";
import PaymentOption from "../models/PaymentOption.js";
import { broadcast } from "../wsServer.js";
import cloudinary from "../config/cloudinary.js";
import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { createNotification } from "../models/Notification.js";
import { sendReservationStatusEmail } from "../config/email.js";
import { emailQueue } from "../utils/emailQueue.js";

const { Reservation, ReservationRoom } = ReservationModels;

const calcNights = (checkIn, checkOut) => {
  const inDate = new Date(checkIn);
  const outDate = new Date(checkOut);

  if (Number.isNaN(inDate.getTime()) || Number.isNaN(outDate.getTime())) {
    return 0;
  }

  // Calculate difference in milliseconds
  const diffTime = outDate - inDate;

  // Convert to days and round up (ceil) to count any partial day as a full night
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  const nights = Math.ceil(diffDays);

  // Log for debugging (remove in production)
  console.log(
    `Nights calculation: ${inDate.toISOString()} to ${outDate.toISOString()} = ${nights} nights`,
  );

  return nights;
};

// Generate unique reservation number
const generateReservationNumber = async () => {
  const year = new Date().getUTCFullYear();
  const prefix = `RES-${year}-`;
  const last = await Reservation.findOne({
    reservationNumber: new RegExp(`^RES-${year}-`),
  })
    .sort({ reservationNumber: -1 })
    .select("reservationNumber");

  let nextNumber = 1;
  if (last) nextNumber = parseInt(last.reservationNumber.split("-")[2]) + 1;
  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
};

// Function to calculate nights
export const checkAvailableRooms = async (req, res) => {
  try {
    const { checkIn, checkOut } = req.query;

    if (!checkIn || !checkOut) {
      return res
        .status(400)
        .json({ error: "checkIn and checkOut are required" });
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    if (
      Number.isNaN(checkInDate.getTime()) ||
      Number.isNaN(checkOutDate.getTime()) ||
      checkOutDate <= checkInDate
    ) {
      return res.status(400).json({ error: "Invalid checkIn/checkOut dates" });
    }

    // 1️⃣ Get all reservations overlapping the requested dates
    const overlappingReservations = await Reservation.find({
      status: { $in: ["pending", "confirmed", "checked_in"] }, // rooms unavailable if reserved
      $or: [{ checkIn: { $lt: checkOutDate }, checkOut: { $gt: checkInDate } }],
    });

    // 2️⃣ Get all booked room IDs in those reservations
    const bookedRoomIds = [];
    for (const reservation of overlappingReservations) {
      const resRooms = await ReservationRoom.find({
        reservationId: reservation._id,
      });
      resRooms.forEach((r) => bookedRoomIds.push(r.roomId.toString()));
    }

    // 3️⃣ Get all rooms that are not booked and populate roomType
    const availableRooms = await Room.find({
      _id: { $nin: bookedRoomIds },
      status: "active",
    }).populate("roomType");

    return res.status(200).json({
      success: true,
      message: "Available rooms retrieved successfully",
      availableRooms,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

// --- CREATE RESERVATION ---
export const addReservation = async (req, res) => {
  try {
    const {
      checkIn,
      checkOut,
      adults,
      children = 0,
      guestId,
      notes = "",
      paymentOption,
      status: reqStatus = "pending",
      userId,
      discountId,
    } = req.body;

    // Basic validation
    if (!checkIn || !checkOut)
      return res
        .status(400)
        .json({ error: "checkIn and checkOut are required" });
    if (!adults) return res.status(400).json({ error: "adults is required" });
    if (!guestId || !mongoose.isValidObjectId(guestId))
      return res.status(400).json({ error: "Invalid guestId" });

    const inDate = new Date(checkIn);
    const outDate = new Date(checkOut);
    if (
      Number.isNaN(inDate.getTime()) ||
      Number.isNaN(outDate.getTime()) ||
      outDate <= inDate
    )
      return res.status(400).json({ error: "Invalid checkIn/checkOut" });

    const nights = calcNights(inDate, outDate);
    if (nights < 1)
      return res
        .status(400)
        .json({ error: "Reservation must be at least 1 night" });

    const paymentOptionDoc = await PaymentOption.findById(paymentOption);
    if (!paymentOptionDoc || !paymentOptionDoc.isActive)
      return res
        .status(400)
        .json({ error: "Invalid or inactive payment option" });

    // --- Determine reservation status ---
    let status = reqStatus;
    if (userId) {
      status = "confirmed"; // auto-confirm if userId exists
    }

    // expiresAt only for pending reservations
    let expiresAt = null;
    if (status === "pending") {
      const HOLD_MINUTES = 60 * 24; // 24 hours
      expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);
    }

    // Generate reservation number
    let reservationNumber;
    for (let i = 0; i < 5; i++) {
      reservationNumber = await generateReservationNumber();
      if (!(await Reservation.exists({ reservationNumber }))) break;
      reservationNumber = null;
    }
    if (!reservationNumber)
      return res
        .status(500)
        .json({ error: "Failed to generate reservation number" });

    // --- Create Reservation ---
    const reservation = new Reservation({
      reservationNumber,
      checkIn: inDate,
      checkOut: outDate,
      adults: Number(adults),
      children: Number(children),
      guestId,
      notes,
      paymentOption: paymentOptionDoc._id,
      nights,
      status,
      userId: userId || null,
      discountId: discountId || null,
      expiresAt,
    });

    const savedReservation = await reservation.save();

    // Populate references for full details
    const fullReservation = await Reservation.findById(savedReservation._id)
      .populate("guestId")
      .populate("paymentOption")
      .populate("userId")
      .populate("discountId");

    // ✅ CREATE NOTIFICATION FOR NEW RESERVATION
    await createNotification({
      actorUserId: req.user?._id || null,
      type: "reservation",
      title: "New Reservation Created",
      description: `Reservation ${fullReservation.reservationNumber} was created for ${fullReservation.guestId?.firstName} ${fullReservation.guestId?.lastName}. Status: ${fullReservation.status}.`,
      source: "Front Desk",
      entity: {
        kind: "Reservation",
        id: fullReservation._id,
      },
    });

    // Broadcast new reservation
    broadcast({
      type: "RESERVATION_UPDATED",
      action: "create",
      reservation: fullReservation,
    });

    // 🚀 ADD EMAIL TO QUEUE INSTEAD OF SENDING DIRECTLY
    if (fullReservation.guestId && fullReservation.guestId.email) {
      emailQueue.add({
        reservation: fullReservation,
        guest: fullReservation.guestId,
        oldStatus: null,
        newStatus: fullReservation.status,
        retryCount: 0,
      });
      console.log(
        `📧 Email queued for new reservation ${fullReservation.reservationNumber}`,
      );
    } else {
      console.warn(
        `⚠️ Cannot queue email: Missing guest email for reservation ${fullReservation.reservationNumber}`,
      );
    }

    return res.status(201).json({
      success: true,
      message: "Reservation created successfully",
      reservation: fullReservation,
      emailQueued: true,
    });
  } catch (error) {
    console.error(error);
    if (error?.code === 11000)
      return res.status(409).json({ error: "Duplicate reservation number" });
    return res.status(500).json({ error: error.message });
  }
};

// --- UPDATE RESERVATION STATUS ---
export const updateReservationStatus = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { status, notes, userId } = req.body;

    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ error: "Invalid reservation ID" });

    const validStatuses = [
      "pending",
      "confirmed",
      "cancelled",
      "checked_in",
      "checked_out",
      "expired",
      "no_show",
    ];

    if (!validStatuses.includes(status))
      return res.status(400).json({ error: "Invalid status", validStatuses });

    const reservation = await Reservation.findById(id)
      .populate("guestId")
      .session(session);

    if (!reservation)
      return res.status(404).json({ error: "Reservation not found" });

    const previousStatus = reservation.status;
    reservation.status = status;

    // Add notes if provided
    if (notes) {
      reservation.notes = reservation.notes || [];
      reservation.notes.push({
        text: notes,
        userId: userId || req.user?._id,
        date: new Date(),
      });
    }

    await reservation.save({ session });
    await session.commitTransaction();
    session.endSession();

    const updatedReservation = await Reservation.findById(reservation._id)
      .populate("guestId")
      .populate("paymentOption")
      .populate("userId")
      .populate("discountId");

    // 🚀 ADD EMAIL TO QUEUE INSTEAD OF SENDING DIRECTLY
    if (updatedReservation.guestId && updatedReservation.guestId.email) {
      emailQueue.add({
        reservation: updatedReservation,
        guest: updatedReservation.guestId,
        oldStatus: previousStatus,
        newStatus: status,
        retryCount: 0,
      });
      console.log(
        `📧 Email queued for reservation ${updatedReservation.reservationNumber}`,
      );
    } else {
      console.warn(
        `⚠️ Cannot queue email: Missing guest email for reservation ${updatedReservation.reservationNumber}`,
      );
    }

    // Create notification
    await createNotification({
      actorUserId: req.user?._id || userId || null,
      type: "reservation",
      title: "Reservation Status Updated",
      description: `Reservation ${updatedReservation.reservationNumber} changed from ${previousStatus} to ${status}. Email notification queued.`,
      source: "Front Desk",
      entity: {
        kind: "Reservation",
        id: updatedReservation._id,
      },
    });

    // Broadcast update
    broadcast({
      type: "RESERVATION_UPDATED",
      action: "status_update",
      reservation: updatedReservation,
      previousStatus,
      newStatus: status,
    });

    return res.status(200).json({
      success: true,
      message: `Reservation status updated from ${previousStatus} to ${status}`,
      reservation: updatedReservation,
      previousStatus,
      newStatus: status,
      emailQueued: true,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error updating reservation status:", error);
    return res.status(500).json({ error: error.message });
  }
};

// --- UPDATE RESERVATION ---
export const updateReservation = async (req, res) => {
  try {
    const { reservationId, checkIn, checkOut } = req.body;

    // Validate reservation exists
    const reservation = await Reservation.findById(reservationId);
    if (!reservation)
      return res.status(404).json({ error: "Reservation not found" });

    // Update reservation details (checkIn/checkOut, etc.)
    reservation.checkIn = new Date(checkIn);
    reservation.checkOut = new Date(checkOut);
    await reservation.save();

    // Recalculate nights
    const nights = calcNights(reservation.checkIn, reservation.checkOut);
    reservation.nights = nights;
    await reservation.save();

    return res.status(200).json({
      message: "Reservation updated and billing recalculated",
      reservation,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

// --- GET RESERVATIONS ---
export const getReservations = async (req, res) => {
  try {
    const { status, startDate, endDate, guestName } = req.query;

    const filter = {};
    if (status) filter.status = status;

    // Filter by checkIn date range
    if (startDate && endDate) {
      filter.checkIn = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    // Optionally add filtering by checkOut date if needed
    if (startDate && !endDate) {
      filter.checkOut = { $gte: new Date(startDate) };
    }

    // Filter by guestName (case-insensitive search)
    if (guestName) {
      filter.guestId = { $regex: guestName, $options: "i" }; // Assuming you're filtering by guestId, not guestName directly
    }

    // Retrieve reservations and populate guest and user data
    const reservations = await Reservation.find(filter)
      .sort({ createdAt: -1 })
      .populate("guestId")
      .populate("paymentOption")
      .populate("discountId")
      .populate("userId");

    return res.json(reservations);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// --- GET RESERVATION BY ID ---
export const getReservationById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate MongoDB ObjectId
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid reservation ID" });
    }

    // Find reservation by ID and populate references
    const reservation = await Reservation.findById(id)
      .populate("guestId")
      .populate("paymentOption")
      .populate("discountId")
      .populate("userId");

    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    return res.status(200).json({
      success: true,
      reservation,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};
// --- DELETE SINGLE RESERVATION ---
export const deleteReservation = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid reservation ID" });
    }

    // Get reservation details before deletion
    const reservationToDelete = await Reservation.findById(id)
      .select("reservationNumber guestId")
      .populate("guestId", "firstName lastName")
      .session(session);

    if (!reservationToDelete) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Reservation not found" });
    }

    const guestName = reservationToDelete.guestId
      ? `${reservationToDelete.guestId.firstName || ""} ${reservationToDelete.guestId.lastName || ""}`.trim()
      : "N/A";
    const reservationLabel = `${reservationToDelete.reservationNumber || id} (${guestName})`;

    // 1️⃣ Get billing for this reservation
    const billing = await Billing.findOne({ reservationId: id }).session(
      session,
    );
    const billingId = billing ? billing._id : null;

    // 2️⃣ Delete receipt images from Cloudinary
    if (billingId) {
      const receipts = await Receipt.find({ billingId: billingId });
      for (const receipt of receipts) {
        if (Array.isArray(receipt.receiptImages)) {
          for (const img of receipt.receiptImages) {
            if (img.publicId) {
              try {
                await cloudinary.uploader.destroy(img.publicId);
              } catch (cloudinaryErr) {
                console.warn(
                  `Failed to delete Cloudinary image: ${img.publicId}`,
                  cloudinaryErr.message,
                );
              }
            }
          }
        }
      }

      // 3️⃣ Delete discount images from Cloudinary
      const discountImages = await DiscountImage.find({ billingId: billingId });
      for (const img of discountImages) {
        if (img.publicId) {
          try {
            await cloudinary.uploader.destroy(img.publicId);
          } catch (cloudinaryErr) {
            console.warn(
              `Failed to delete Cloudinary discount image: ${img.publicId}`,
              cloudinaryErr.message,
            );
          }
        }
      }

      // 4️⃣ Delete receipts, discount images, and billing from DB
      await Receipt.deleteMany({ billingId: billingId }).session(session);
      await DiscountImage.deleteMany({ billingId: billingId }).session(session);
      await Billing.deleteOne({ _id: billingId }).session(session);
    }

    // 5️⃣ Delete reservation rooms (amenities are embedded, so they are removed automatically)
    await ReservationRoom.deleteMany({ reservationId: id }).session(session);

    // 6️⃣ Delete the reservation itself
    const deletedReservation =
      await Reservation.findByIdAndDelete(id).session(session);

    await session.commitTransaction();
    session.endSession();

    // Create notification for deleted reservation
    await createNotification({
      actorUserId: req.user?._id || null,
      type: "reservation",
      title: "Reservation Deleted",
      description: `Deleted reservation: ${reservationLabel}`,
      source: "Front Desk",
      entity: { kind: "Reservation", id: null },
    });

    // Broadcast reservation deletion
    broadcast({
      type: "RESERVATION_DELETED",
      action: "delete",
      reservationId: id,
      reservationNumber: reservationToDelete.reservationNumber,
    });

    return res.status(200).json({
      success: true,
      message:
        "Reservation and all related transactional data deleted successfully",
      deletedReservation: {
        id,
        reservationNumber: reservationToDelete.reservationNumber,
        guestName,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error deleting reservation:", error);
    return res.status(500).json({ error: error.message });
  }
};
export const deleteMultipleReservations = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { reservationIds } = req.body;
    if (!Array.isArray(reservationIds) || reservationIds.length === 0) {
      return res
        .status(400)
        .json({ error: "reservationIds must be a non-empty array" });
    }
    console.log(reservationIds);
    // Validate ObjectIds
    for (const id of reservationIds) {
      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ error: `Invalid reservation ID: ${id}` });
      }
    }
    const reservationsToDelete = await Reservation.find({
      _id: { $in: reservationIds },
    })
      .select("reservationNumber guestId")
      .populate("guestId", "firstName lastName")
      .session(session);

    const deletedLabels = reservationsToDelete.map((r) => {
      const guestName = r.guestId
        ? `${r.guestId.firstName || ""} ${r.guestId.lastName || ""}`.trim()
        : "N/A";
      return `${r.reservationNumber || r._id.toString()} (${guestName})`;
    });
    // 1️⃣ Get all billings for these reservations
    const billings = await Billing.find({
      reservationId: { $in: reservationIds },
    }).session(session);
    const billingIds = billings.map((b) => b._id);

    // 2️⃣ Delete all receipt images from Cloudinary
    const receipts = await Receipt.find({ billingId: { $in: billingIds } });
    for (const receipt of receipts) {
      if (Array.isArray(receipt.receiptImages)) {
        for (const img of receipt.receiptImages) {
          if (img.publicId) await cloudinary.uploader.destroy(img.publicId);
        }
      }
    }

    // 3️⃣ Delete all discount images from Cloudinary
    const discountImages = await DiscountImage.find({
      billingId: { $in: billingIds },
    });
    for (const img of discountImages) {
      if (img.publicId) await cloudinary.uploader.destroy(img.publicId);
    }

    // 4️⃣ Delete receipts, discount images, and billings from DB
    await Receipt.deleteMany({ billingId: { $in: billingIds } }).session(
      session,
    );
    await DiscountImage.deleteMany({ billingId: { $in: billingIds } }).session(
      session,
    );
    await Billing.deleteMany({ _id: { $in: billingIds } }).session(session);

    // 5️⃣ Delete reservation rooms (amenities are embedded, so they are removed automatically)
    await ReservationRoom.deleteMany({
      reservationId: { $in: reservationIds },
    }).session(session);

    // 6️⃣ Delete reservations
    await Reservation.deleteMany({ _id: { $in: reservationIds } }).session(
      session,
    );

    await session.commitTransaction();
    session.endSession();

    await createNotification({
      actorUserId: req.user?._id || null,
      type: "reservation",
      title: "Reservation(s) Deleted",
      description:
        deletedLabels.length <= 10
          ? `Deleted: ${deletedLabels.join(", ")}`
          : `Deleted ${deletedLabels.length} reservations. Example: ${deletedLabels.slice(0, 5).join(", ")}...`,
      source: "Front Desk",
      entity: { kind: "Reservation", id: null },
    });

    return res.status(200).json({
      success: true,
      message:
        "Reservations and all related transactional data deleted successfully",
      deletedCount: reservationIds.length,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

// --- REPORT GENERATION FUNCTIONS ---

// Generate PDF report
export const generatePDFReport = async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;

    const filter = {};
    if (startDate && endDate) {
      filter.checkIn = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    if (status) filter.status = status;

    // Get reservations with populated data
    const reservations = await Reservation.find(filter)
      .sort({ checkIn: 1 })
      .populate("guestId")
      .populate("paymentOption")
      .populate("userId");

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });

    // Set response headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="reservation-report-${Date.now()}.pdf"`,
    );

    // Pipe PDF to response
    doc.pipe(res);

    // Add title
    doc.fontSize(20).text("Reservation Report", { align: "center" });
    doc.moveDown();

    // Add report period
    doc
      .fontSize(12)
      .text(
        `Report Period: ${startDate || "All time"} to ${endDate || "Present"}`,
      );
    if (status) {
      doc.text(`Status Filter: ${status}`);
    }
    doc.text(`Generated: ${new Date().toLocaleString()}`);
    doc.moveDown();

    // Add summary
    doc.fontSize(14).text("Summary", { underline: true });
    doc.fontSize(12);
    doc.text(`Total Reservations: ${reservations.length}`);

    const confirmedCount = reservations.filter(
      (r) => r.status === "confirmed",
    ).length;
    const pendingCount = reservations.filter(
      (r) => r.status === "pending",
    ).length;
    const checkedInCount = reservations.filter(
      (r) => r.status === "checked_in",
    ).length;
    const checkedOutCount = reservations.filter(
      (r) => r.status === "checked_out",
    ).length;

    doc.text(`Confirmed: ${confirmedCount}`);
    doc.text(`Pending: ${pendingCount}`);
    doc.text(`Checked In: ${checkedInCount}`);
    doc.text(`Checked Out: ${checkedOutCount}`);
    doc.moveDown();

    // Add reservations table
    doc.fontSize(14).text("Reservation Details", { underline: true });
    doc.moveDown();

    // Table headers
    const tableTop = doc.y;
    const tableLeft = 50;
    const colWidths = [80, 100, 80, 60, 60, 80];

    // Header row
    doc.fontSize(10).font("Helvetica-Bold");
    doc.text("Reservation #", tableLeft, tableTop);
    doc.text("Guest Name", tableLeft + colWidths[0], tableTop);
    doc.text("Check In", tableLeft + colWidths[0] + colWidths[1], tableTop);
    doc.text(
      "Nights",
      tableLeft + colWidths[0] + colWidths[1] + colWidths[2],
      tableTop,
    );
    doc.text(
      "Adults",
      tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3],
      tableTop,
    );
    doc.text(
      "Status",
      tableLeft +
        colWidths[0] +
        colWidths[1] +
        colWidths[2] +
        colWidths[3] +
        colWidths[4],
      tableTop,
    );

    doc.moveDown();
    doc.font("Helvetica");

    // Table rows
    let y = doc.y;
    reservations.forEach((reservation, index) => {
      if (y > 700) {
        // Add new page if near bottom
        doc.addPage();
        y = 50;
        tableTop = y;
      }

      const guestName = reservation.guestId
        ? `${reservation.guestId.firstName} ${reservation.guestId.lastName}`
        : "N/A";

      doc.fontSize(9);
      doc.text(reservation.reservationNumber || "N/A", tableLeft, y);
      doc.text(guestName, tableLeft + colWidths[0], y, { width: colWidths[1] });
      doc.text(
        reservation.checkIn ? reservation.checkIn.toLocaleDateString() : "N/A",
        tableLeft + colWidths[0] + colWidths[1],
        y,
      );
      doc.text(
        reservation.nights?.toString() || "0",
        tableLeft + colWidths[0] + colWidths[1] + colWidths[2],
        y,
      );
      doc.text(
        reservation.adults?.toString() || "0",
        tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3],
        y,
      );
      doc.text(
        reservation.status || "N/A",
        tableLeft +
          colWidths[0] +
          colWidths[1] +
          colWidths[2] +
          colWidths[3] +
          colWidths[4],
        y,
      );

      y += 20;
    });

    // Add footer
    doc.addPage();
    doc.fontSize(10).text("End of Report", { align: "center" });

    doc.end();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

// Generate Excel report
// Update the generateExcelReport function in your controller

// Generate Excel report
export const generateExcelReport = async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;

    const filter = {};
    if (startDate && endDate) {
      filter.checkIn = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    if (status) filter.status = status;

    // Get reservations with populated data
    const reservations = await Reservation.find(filter)
      .sort({ checkIn: 1 })
      .populate("guestId")
      .populate("paymentOption")
      .populate("userId");

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Reservations");

    // Set columns
    worksheet.columns = [
      { header: "Reservation #", key: "reservationNumber", width: 20 },
      { header: "Guest Name", key: "guestName", width: 25 },
      { header: "Email", key: "email", width: 30 },
      { header: "Phone", key: "phone", width: 15 },
      { header: "Check In", key: "checkIn", width: 15 },
      { header: "Check Out", key: "checkOut", width: 15 },
      { header: "Nights", key: "nights", width: 10 },
      { header: "Adults", key: "adults", width: 10 },
      { header: "Children", key: "children", width: 10 },
      { header: "Status", key: "status", width: 15 },
      { header: "Payment Method", key: "paymentMethod", width: 20 },
      { header: "Created At", key: "createdAt", width: 20 },
      { header: "Notes", key: "notes", width: 30 },
    ];

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    // Add data rows
    for (const reservation of reservations) {
      const guestName = reservation.guestId
        ? `${reservation.guestId.firstName || ""} ${reservation.guestId.lastName || ""}`.trim()
        : "N/A";
      const email = reservation.guestId?.email || "N/A";
      const phone = reservation.guestId?.phone || "N/A";
      const paymentMethod = reservation.paymentOption?.name || "N/A";

      // Format dates
      const checkInDate = reservation.checkIn
        ? new Date(reservation.checkIn).toLocaleDateString()
        : "N/A";
      const checkOutDate = reservation.checkOut
        ? new Date(reservation.checkOut).toLocaleDateString()
        : "N/A";
      const createdAt = reservation.createdAt
        ? new Date(reservation.createdAt).toLocaleString()
        : "N/A";

      // Get rooms for this reservation
      let roomDetails = [];
      try {
        const reservationRooms = await ReservationRoom.find({
          reservationId: reservation._id,
        }).populate({
          path: "roomId",
          populate: {
            path: "roomType",
          },
        });

        roomDetails = reservationRooms.map((room) => {
          const roomNumber = room.roomId?.roomNumber || "N/A";
          const roomType = room.roomId?.roomType?.name || "N/A";
          return `${roomNumber} (${roomType})`;
        });
      } catch (roomErr) {
        console.log(
          `Error fetching rooms for reservation ${reservation._id}:`,
          roomErr.message,
        );
      }

      // Add reservation details to notes
      const reservationNotes = reservation.notes || "";
      const roomInfo =
        roomDetails.length > 0 ? `Rooms: ${roomDetails.join(", ")}` : "";
      const combinedNotes = [reservationNotes, roomInfo]
        .filter(Boolean)
        .join(" | ");

      worksheet.addRow({
        reservationNumber: reservation.reservationNumber || "N/A",
        guestName,
        email,
        phone,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        nights: reservation.nights || 0,
        adults: reservation.adults || 0,
        children: reservation.children || 0,
        status: reservation.status ? reservation.status.toUpperCase() : "N/A",
        paymentMethod,
        createdAt,
        notes: combinedNotes,
      });
    }

    // Apply formatting to data rows
    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);

      // Status color coding
      const statusCell = row.getCell("status");
      const status = statusCell.value?.toString().toLowerCase();

      if (status) {
        switch (status) {
          case "confirmed":
            statusCell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFC6EFCE" },
            };
            statusCell.font = { color: { argb: "FF006100" } };
            break;
          case "pending":
            statusCell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFFEB9C" },
            };
            statusCell.font = { color: { argb: "FF9C6500" } };
            break;
          case "checked_in":
            statusCell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFBDD7EE" },
            };
            statusCell.font = { color: { argb: "FF2F5496" } };
            break;
          case "checked_out":
            statusCell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFD9D9D9" },
            };
            statusCell.font = { color: { argb: "FF595959" } };
            break;
          case "cancelled":
            statusCell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFFC7CE" },
            };
            statusCell.font = { color: { argb: "FF9C0006" } };
            break;
        }
      }
    }

    // Auto-fit columns
    worksheet.columns.forEach((column) => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 0;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = Math.min(maxLength + 2, 50);
    });

    // Add summary sheet
    const summarySheet = workbook.addWorksheet("Summary");

    // Summary data
    const summaryData = [
      ["Report Information", ""],
      [
        "Report Period",
        `${startDate || "All time"} to ${endDate || "Present"}`,
      ],
      ["Status Filter", status || "All Statuses"],
      ["Generated Date", new Date().toLocaleString()],
      ["", ""],
      ["Reservation Statistics", ""],
      ["Total Reservations", reservations.length],
      [
        "Confirmed",
        reservations.filter((r) => r.status === "confirmed").length,
      ],
      ["Pending", reservations.filter((r) => r.status === "pending").length],
      [
        "Checked In",
        reservations.filter((r) => r.status === "checked_in").length,
      ],
      [
        "Checked Out",
        reservations.filter((r) => r.status === "checked_out").length,
      ],
      [
        "Cancelled",
        reservations.filter((r) => r.status === "cancelled").length,
      ],
      ["Expired", reservations.filter((r) => r.status === "expired").length],
      ["No Show", reservations.filter((r) => r.status === "no_show").length],
      ["", ""],
      ["Guest Statistics", ""],
      [
        "Total Adults",
        reservations.reduce((sum, r) => sum + (r.adults || 0), 0),
      ],
      [
        "Total Children",
        reservations.reduce((sum, r) => sum + (r.children || 0), 0),
      ],
      [
        "Total Guests",
        reservations.reduce(
          (sum, r) => sum + (r.adults || 0) + (r.children || 0),
          0,
        ),
      ],
      [
        "Total Nights",
        reservations.reduce((sum, r) => sum + (r.nights || 0), 0),
      ],
    ];

    // Add summary data
    summaryData.forEach((row, index) => {
      const currentRow = summarySheet.addRow(row);

      // Style section headers
      if (
        row[0] === "Report Information" ||
        row[0] === "Reservation Statistics" ||
        row[0] === "Guest Statistics"
      ) {
        currentRow.getCell(1).font = { bold: true, size: 12 };
        currentRow.getCell(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF4472C4" },
        };
        currentRow.getCell(1).font = {
          color: { argb: "FFFFFFFF" },
          bold: true,
        };
        currentRow.height = 25;
      }

      // Style data rows
      if (index > 0 && row[0] && row[0] !== "") {
        currentRow.getCell(1).font = { bold: true };
      }
    });

    // Auto-fit summary columns
    summarySheet.columns = [
      { header: "Metric", key: "metric", width: 30 },
      { header: "Value", key: "value", width: 30 },
    ];

    // Add a third sheet for detailed room information if needed
    if (reservations.length > 0) {
      const roomsSheet = workbook.addWorksheet("Room Details");

      roomsSheet.columns = [
        { header: "Reservation #", key: "reservationNumber", width: 20 },
        { header: "Guest Name", key: "guestName", width: 25 },
        { header: "Room Number", key: "roomNumber", width: 15 },
        { header: "Room Type", key: "roomType", width: 20 },
        { header: "Check In", key: "checkIn", width: 15 },
        { header: "Check Out", key: "checkOut", width: 15 },
        { header: "Nights", key: "nights", width: 10 },
      ];

      // Get all room details
      for (const reservation of reservations) {
        try {
          const reservationRooms = await ReservationRoom.find({
            reservationId: reservation._id,
          }).populate({
            path: "roomId",
            populate: {
              path: "roomType",
            },
          });

          const guestName = reservation.guestId
            ? `${reservation.guestId.firstName || ""} ${reservation.guestId.lastName || ""}`.trim()
            : "N/A";

          for (const room of reservationRooms) {
            roomsSheet.addRow({
              reservationNumber: reservation.reservationNumber || "N/A",
              guestName,
              roomNumber: room.roomId?.roomNumber || "N/A",
              roomType: room.roomId?.roomType?.name || "N/A",
              checkIn: reservation.checkIn
                ? new Date(reservation.checkIn).toLocaleDateString()
                : "N/A",
              checkOut: reservation.checkOut
                ? new Date(reservation.checkOut).toLocaleDateString()
                : "N/A",
              nights: reservation.nights || 0,
            });
          }
        } catch (roomErr) {
          console.log(
            `Error fetching rooms for reservation ${reservation._id}:`,
            roomErr.message,
          );
        }
      }
    }

    // Set response headers for Excel download
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="reservation-report-${Date.now()}.xlsx"`,
    );

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

// Generate reservation confirmation PDF
// Update the generateReservationConfirmation function in your controller

// Generate reservation confirmation PDF
export const generateReservationConfirmation = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid reservation ID" });
    }

    const reservation = await Reservation.findById(id)
      .populate("guestId")
      .populate("paymentOption")
      .populate("discountId")
      .populate("userId");

    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    // Get reservation rooms with addOns
    let reservationRooms = [];
    try {
      reservationRooms = await ReservationRoom.find({ reservationId: id })
        .populate({
          path: "roomId",
          populate: {
            path: "roomType",
          },
        })
        .populate({
          path: "addOns.addOnId",
          model: "AddOn",
        });
    } catch (roomErr) {
      console.log("Error fetching reservation rooms:", roomErr.message);
    }

    // Create PDF document
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="confirmation-${reservation.reservationNumber}.pdf"`,
    );

    doc.pipe(res);

    // Hotel header
    doc.fontSize(24).text("SUVA'S PLACE RESORT", { align: "center" });
    doc.fontSize(14).text("Reservation Confirmation", { align: "center" });
    doc.moveDown(2);

    // Reservation details
    doc.fontSize(16).text("Reservation Details", { underline: true });
    doc.moveDown();

    doc.fontSize(12);
    doc.text(`Reservation Number: ${reservation.reservationNumber || "N/A"}`);
    doc.text(
      `Guest: ${reservation.guestId?.firstName || ""} ${reservation.guestId?.lastName || ""}`,
    );
    doc.text(`Email: ${reservation.guestId?.email || "N/A"}`);
    doc.text(`Phone: ${reservation.guestId?.contactNumber || "N/A"}`);
    doc.moveDown();

    doc.text(
      `Check-in: ${reservation.checkIn ? reservation.checkIn.toLocaleDateString() : "N/A"}`,
    );
    doc.text(
      `Check-out: ${reservation.checkOut ? reservation.checkOut.toLocaleDateString() : "N/A"}`,
    );
    doc.text(`Nights: ${reservation.nights || 0}`);
    doc.text(
      `Adults: ${reservation.adults || 0}, Children: ${reservation.children || 0}`,
    );
    doc.text(
      `Status: ${reservation.status ? reservation.status.toUpperCase() : "N/A"}`,
    );
    doc.text(`Payment Method: ${reservation.paymentOption?.name || "N/A"}`);
    doc.moveDown();

    // Room details with addOns
    if (reservationRooms && reservationRooms.length > 0) {
      doc.fontSize(16).text("Room Details", { underline: true });
      doc.moveDown();

      reservationRooms.forEach((room, index) => {
        doc.fontSize(12);
        const roomNumber = room.roomId?.roomNumber || "N/A";
        const roomTypeName =
          room.roomId?.roomType?.name || room.roomId?.roomTypeName || "N/A";
        doc.text(`Room ${index + 1}: ${roomNumber} - ${roomTypeName}`);

        if (room.roomId?.rate) {
          doc.text(`  Rate: ${formatMoney(room.roomId.rate)} per night`);
        }

        if (room.addOns && room.addOns.length > 0) {
          doc.text("  Add-Ons:");
          room.addOns.forEach((addOn) => {
            if (addOn.addOnId) {
              doc.text(
                `    • ${addOn.addOnId.name || "N/A"} (x${addOn.quantity || 1}) - ${formatMoney((addOn.addOnId.rate || 0) * (addOn.quantity || 1))}`,
              );
            }
          });
        }
        doc.moveDown();
      });
    }

    // Notes
    if (reservation.notes) {
      doc.fontSize(14).text("Special Notes:", { underline: true });
      doc.fontSize(12).text(reservation.notes);
      doc.moveDown();
    }

    // Footer
    doc.moveDown(2);
    doc
      .fontSize(10)
      .text("Thank you for choosing Suva's Place Resort!", { align: "center" });
    doc.text("For inquiries, contact: reservations@suvasplace.com", {
      align: "center",
    });
    doc.text(`Confirmation generated on: ${new Date().toLocaleString()}`, {
      align: "center",
    });

    doc.end();
  } catch (error) {
    console.error("Error generating confirmation:", error);
    return res.status(500).json({ error: error.message });
  }
};

export const getReservationsByGuest = async (req, res) => {
  try {
    const { guestId } = req.params;

    // Validate ObjectId
    if (!mongoose.isValidObjectId(guestId)) {
      return res.status(400).json({ error: "Invalid guest ID" });
    }

    const {
      status,
      startDate,
      endDate,
      limit = 50,
      sortBy = "-createdAt",
    } = req.query;

    // Build filter
    const filter = { guestId };

    // Filter by status if provided
    if (status) {
      const validStatuses = [
        "pending",
        "confirmed",
        "cancelled",
        "checked_in",
        "checked_out",
        "expired",
        "no_show",
      ];
      if (validStatuses.includes(status)) {
        filter.status = status;
      }
    }

    // Filter by date range
    if (startDate && endDate) {
      filter.checkIn = { $gte: new Date(startDate), $lte: new Date(endDate) };
    } else if (startDate) {
      filter.checkIn = { $gte: new Date(startDate) };
    } else if (endDate) {
      filter.checkIn = { $lte: new Date(endDate) };
    }

    // Determine sort order
    let sort = {};
    if (sortBy === "checkIn") sort = { checkIn: 1 };
    else if (sortBy === "-checkIn") sort = { checkIn: -1 };
    else if (sortBy === "createdAt") sort = { createdAt: 1 };
    else if (sortBy === "-createdAt") sort = { createdAt: -1 };
    else if (sortBy === "status") sort = { status: 1 };
    else if (sortBy === "-status") sort = { status: -1 };
    else sort = { createdAt: -1 };

    // Get reservations with populated data
    const reservations = await Reservation.find(filter)
      .sort(sort)
      .limit(parseInt(limit))
      .populate("guestId")
      .populate("paymentOption")
      .populate("discountId")
      .populate("userId")
      .lean();

    // Get complete details for each reservation
    const reservationsWithFullDetails = await Promise.all(
      reservations.map(async (reservation) => {
        // 1️⃣ Get rooms with amenities for this reservation
        let rooms = [];
        try {
          const reservationRooms = await ReservationRoom.find({
            reservationId: reservation._id,
          })
            .populate({
              path: "roomId",
              populate: {
                path: "roomType",
              },
            })
            .lean();

          // Process each room with its amenities
          rooms = await Promise.all(
            reservationRooms.map(async (roomRes) => {
              // Get full amenity details for each amenity in this room
              const amenitiesWithDetails = await Promise.all(
                (roomRes.amenities || []).map(async (amenity) => {
                  const Amenity = mongoose.model("Amenity");
                  const amenityDetails = await Amenity.findById(
                    amenity.amenityId,
                  ).lean();
                  return {
                    amenityId: amenity.amenityId,
                    name: amenityDetails?.name || "Unknown",
                    description: amenityDetails?.description || "",
                    rate: amenityDetails?.rate || 0,
                    quantity: amenity.quantity,
                    subtotal:
                      (amenityDetails?.rate || 0) * (amenity.quantity || 1),
                  };
                }),
              );

              // Calculate room total (room rate * nights + amenities)
              const roomRate = roomRes.roomId?.rate || 0;
              const nights = reservation.nights || 1;
              const roomSubtotal = roomRate * nights;
              const amenitiesSubtotal = amenitiesWithDetails.reduce(
                (sum, a) => sum + a.subtotal,
                0,
              );

              return {
                roomId: roomRes.roomId?._id,
                roomNumber: roomRes.roomId?.roomNumber || "N/A",
                roomType: {
                  _id: roomRes.roomId?.roomType?._id,
                  name: roomRes.roomId?.roomType?.name || "N/A",
                },
                capacity: roomRes.roomId?.capacity || 0,
                bedType: roomRes.roomId?.bedType || "N/A",
                rate: roomRate,
                nights: nights,
                roomSubtotal: roomSubtotal,
                amenities: amenitiesWithDetails,
                amenitiesSubtotal: amenitiesSubtotal,
                total: roomSubtotal + amenitiesSubtotal,
              };
            }),
          );
        } catch (roomErr) {
          console.log(
            `Error fetching rooms for reservation ${reservation._id}:`,
            roomErr.message,
          );
        }

        // 2️⃣ Get billing details
        let billing = null;
        try {
          billing = await Billing.findOne({
            reservationId: reservation._id,
          }).lean();
        } catch (billingErr) {
          console.log(
            `Error fetching billing for reservation ${reservation._id}:`,
            billingErr.message,
          );
        }

        // 3️⃣ Get receipts with full details
        let receipts = [];
        let totalPaid = 0;
        if (billing) {
          try {
            receipts = await Receipt.find({ billingId: billing._id })
              .populate("paymentType")
              .sort({ createdAt: -1 })
              .lean();

            // Calculate total paid from all receipts
            totalPaid = receipts.reduce(
              (sum, r) => sum + (r.amountPaid || 0),
              0,
            );
          } catch (receiptErr) {
            console.log(
              `Error fetching receipts for reservation ${reservation._id}:`,
              receiptErr.message,
            );
          }
        }

        // Calculate remaining balance
        const totalAmount = billing?.totalAmount || 0;
        const remainingBalance = totalAmount - totalPaid;

        // 4️⃣ Calculate room totals summary
        const roomsTotal = rooms.reduce((sum, r) => sum + r.total, 0);
        const amenitiesTotal = rooms.reduce(
          (sum, r) => sum + r.amenitiesSubtotal,
          0,
        );

        // 5️⃣ Determine payment status based on billing
        let paymentStatus = "unpaid";
        if (totalPaid >= totalAmount && totalAmount > 0) {
          paymentStatus = "paid";
        } else if (totalPaid > 0 && totalPaid < totalAmount) {
          paymentStatus = "partial";
        } else if (totalPaid === 0) {
          paymentStatus = "unpaid";
        }

        // 6️⃣ Check if reservation is upcoming, ongoing, or past
        const now = new Date();
        const checkInDate = new Date(reservation.checkIn);
        const checkOutDate = new Date(reservation.checkOut);
        let reservationPeriod = "upcoming";

        if (now >= checkInDate && now <= checkOutDate) {
          reservationPeriod = "ongoing";
        } else if (now > checkOutDate) {
          reservationPeriod = "past";
        }

        return {
          // Reservation Details
          reservation: {
            _id: reservation._id,
            reservationNumber: reservation.reservationNumber,
            checkIn: reservation.checkIn,
            checkOut: reservation.checkOut,
            adults: reservation.adults,
            children: reservation.children,
            nights: reservation.nights,
            status: reservation.status,
            notes: reservation.notes,
            createdAt: reservation.createdAt,
            updatedAt: reservation.updatedAt,
            expiresAt: reservation.expiresAt,
            reservationPeriod: reservationPeriod,
          },

          // Guest Details
          guest: {
            _id: reservation.guestId?._id,
            firstName: reservation.guestId?.firstName,
            lastName: reservation.guestId?.lastName,
            email: reservation.guestId?.email,
            contactNumber: reservation.guestId?.contactNumber,
          },

          // Payment Option Details
          paymentOption: {
            _id: reservation.paymentOption?._id,
            name: reservation.paymentOption?.name,
            paymentType: reservation.paymentOption?.paymentType,
            amount: reservation.paymentOption?.amount,
          },

          // Discount Details (if applied)
          discount: reservation.discountId
            ? {
                _id: reservation.discountId._id,
                name: reservation.discountId.name,
                discountPercent: reservation.discountId.discountPercent,
                discountAmount: reservation.discountId.discountAmount,
                appliesToAllRooms: reservation.discountId.appliesToAllRooms,
              }
            : null,

          // User (Admin) who created/modified
          createdBy: reservation.userId
            ? {
                _id: reservation.userId._id,
                username: reservation.userId.username,
                name: `${reservation.userId.firstName || ""} ${reservation.userId.lastName || ""}`.trim(),
              }
            : null,

          // Room Details with Amenities
          rooms: rooms,

          // Room Totals
          roomTotals: {
            roomsSubtotal: roomsTotal - amenitiesTotal,
            amenitiesSubtotal: amenitiesTotal,
            total: roomsTotal,
          },

          // Billing Details
          billing: billing
            ? {
                _id: billing._id,
                billingNumber: billing.billingNumber,
                subTotal: billing.subTotal,
                discountAmount: billing.discountAmount,
                totalAmount: billing.totalAmount,
                amountPaid: totalPaid,
                balance: remainingBalance,
                status: billing.status,
                paymentStatus: paymentStatus,
                amountDueNow: billing.amountDueNow,
                createdAt: billing.createdAt,
                updatedAt: billing.updatedAt,
              }
            : null,

          // Receipt Details
          receipts: receipts.map((receipt) => ({
            _id: receipt._id,
            amountPaid: receipt.amountPaid,
            amountReceived: receipt.amountReceived,
            change: receipt.change,
            status: receipt.status,
            referenceNumber: receipt.referenceNumber,
            paymentType: {
              _id: receipt.paymentType?._id,
              name: receipt.paymentType?.name,
              isReceipt: receipt.paymentType?.isReceipt,
            },
            receiptImages: receipt.receiptImages || [],
            notes: receipt.notes,
            createdAt: receipt.createdAt,
          })),

          // Payment Summary
          paymentSummary: {
            totalAmount: totalAmount,
            totalPaid: totalPaid,
            remainingBalance: remainingBalance,
            paymentStatus: paymentStatus,
            paymentPercentage:
              totalAmount > 0 ? (totalPaid / totalAmount) * 100 : 0,
            receiptCount: receipts.length,
          },

          // Can Cancel/Modify flags
          canCancel:
            ["pending", "confirmed"].includes(reservation.status) &&
            reservationPeriod === "upcoming",
          canModify:
            ["pending", "confirmed"].includes(reservation.status) &&
            reservationPeriod === "upcoming",
          canCheckIn:
            reservation.status === "confirmed" &&
            reservationPeriod === "upcoming",
          canCheckOut: reservation.status === "checked_in",
        };
      }),
    );

    // Get counts for summary
    const totalReservations = await Reservation.countDocuments({ guestId });
    const pendingCount = await Reservation.countDocuments({
      guestId,
      status: "pending",
    });
    const confirmedCount = await Reservation.countDocuments({
      guestId,
      status: "confirmed",
    });
    const checkedInCount = await Reservation.countDocuments({
      guestId,
      status: "checked_in",
    });
    const checkedOutCount = await Reservation.countDocuments({
      guestId,
      status: "checked_out",
    });
    const cancelledCount = await Reservation.countDocuments({
      guestId,
      status: "cancelled",
    });

    // Calculate total spent across all reservations
    const allBillings = await Billing.find({
      reservationId: {
        $in: reservationsWithFullDetails.map((r) => r.reservation._id),
      },
    }).lean();
    const totalSpent = allBillings.reduce(
      (sum, b) => sum + (b.totalAmount || 0),
      0,
    );
    const totalPaidAcrossAll = reservationsWithFullDetails.reduce(
      (sum, r) => sum + r.paymentSummary.totalPaid,
      0,
    );

    return res.status(200).json({
      success: true,
      reservations: reservationsWithFullDetails,
      summary: {
        total: totalReservations,
        pending: pendingCount,
        confirmed: confirmedCount,
        checkedIn: checkedInCount,
        checkedOut: checkedOutCount,
        cancelled: cancelledCount,
        totalSpent: totalSpent,
        totalPaid: totalPaidAcrossAll,
        totalOutstanding: totalSpent - totalPaidAcrossAll,
      },
      query: {
        limit: parseInt(limit),
        sortBy,
        status: status || null,
        dateRange:
          startDate || endDate
            ? { startDate: startDate || null, endDate: endDate || null }
            : null,
      },
    });
  } catch (error) {
    console.error("Error fetching guest reservations:", error);
    return res.status(500).json({ error: error.message });
  }
};

// --- GET UPCOMING RESERVATIONS FOR GUEST ---
export const getUpcomingReservationsByGuest = async (req, res) => {
  try {
    const { guestId } = req.params;

    if (!mongoose.isValidObjectId(guestId)) {
      return res.status(400).json({ error: "Invalid guest ID" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const reservations = await Reservation.find({
      guestId,
      checkIn: { $gte: today },
      status: { $nin: ["cancelled", "checked_out", "expired", "no_show"] },
    })
      .sort({ checkIn: 1 })
      .populate("guestId")
      .populate("paymentOption")
      .populate("discountId")
      .populate("userId")
      .lean();

    const reservationsWithDetails = await Promise.all(
      reservations.map(async (reservation) => {
        // Get rooms
        let rooms = [];
        try {
          const reservationRooms = await ReservationRoom.find({
            reservationId: reservation._id,
          })
            .populate({
              path: "roomId",
              populate: { path: "roomType" },
            })
            .lean();

          rooms = reservationRooms.map((roomRes) => ({
            roomId: roomRes.roomId?._id,
            roomNumber: roomRes.roomId?.roomNumber || "N/A",
            roomType: roomRes.roomId?.roomType?.name || "N/A",
          }));
        } catch (err) {
          console.log(`Error fetching rooms:`, err.message);
        }

        // Get billing
        let billing = null;
        let totalPaid = 0;
        try {
          billing = await Billing.findOne({
            reservationId: reservation._id,
          }).lean();
          if (billing) {
            const receipts = await Receipt.find({
              billingId: billing._id,
            }).lean();
            totalPaid = receipts.reduce(
              (sum, r) => sum + (r.amountPaid || 0),
              0,
            );
          }
        } catch (err) {
          console.log(`Error fetching billing:`, err.message);
        }

        return {
          ...reservation,
          rooms,
          billing,
          totalPaid,
          remainingBalance: billing
            ? (billing.totalAmount || 0) - totalPaid
            : 0,
          isFullyPaid: billing
            ? totalPaid >= (billing.totalAmount || 0)
            : false,
        };
      }),
    );

    return res.status(200).json({
      success: true,
      reservations: reservationsWithDetails,
      count: reservationsWithDetails.length,
    });
  } catch (error) {
    console.error("Error fetching upcoming guest reservations:", error);
    return res.status(500).json({ error: error.message });
  }
};

// --- GET PAST RESERVATIONS FOR GUEST ---
export const getPastReservationsByGuest = async (req, res) => {
  try {
    const { guestId } = req.params;

    if (!mongoose.isValidObjectId(guestId)) {
      return res.status(400).json({ error: "Invalid guest ID" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const reservations = await Reservation.find({
      guestId,
      $or: [
        { checkOut: { $lt: today } },
        { status: { $in: ["checked_out", "cancelled", "expired", "no_show"] } },
      ],
    })
      .sort({ checkOut: -1 })
      .limit(50)
      .populate("guestId")
      .populate("paymentOption")
      .populate("discountId")
      .populate("userId")
      .lean();

    const reservationsWithDetails = await Promise.all(
      reservations.map(async (reservation) => {
        // Get rooms
        let rooms = [];
        try {
          const reservationRooms = await ReservationRoom.find({
            reservationId: reservation._id,
          })
            .populate({
              path: "roomId",
              populate: { path: "roomType" },
            })
            .lean();

          rooms = reservationRooms.map((roomRes) => ({
            roomId: roomRes.roomId?._id,
            roomNumber: roomRes.roomId?.roomNumber || "N/A",
            roomType: roomRes.roomId?.roomType?.name || "N/A",
          }));
        } catch (err) {
          console.log(`Error fetching rooms:`, err.message);
        }

        // Get billing
        let billing = null;
        let totalPaid = 0;
        try {
          billing = await Billing.findOne({
            reservationId: reservation._id,
          }).lean();
          if (billing) {
            const receipts = await Receipt.find({
              billingId: billing._id,
            }).lean();
            totalPaid = receipts.reduce(
              (sum, r) => sum + (r.amountPaid || 0),
              0,
            );
          }
        } catch (err) {
          console.log(`Error fetching billing:`, err.message);
        }

        return {
          ...reservation,
          rooms,
          billing,
          totalPaid,
          totalAmount: billing?.totalAmount || 0,
        };
      }),
    );

    return res.status(200).json({
      success: true,
      reservations: reservationsWithDetails,
      count: reservationsWithDetails.length,
    });
  } catch (error) {
    console.error("Error fetching past guest reservations:", error);
    return res.status(500).json({ error: error.message });
  }
};
function formatMoney(amount) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(amount || 0));
}
