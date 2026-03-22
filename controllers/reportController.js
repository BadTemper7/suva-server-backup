// controllers/reportController.js
import mongoose from "mongoose";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import Billing from "../models/Billing.js";
import ReservationModel from "../models/Reservation.js";
import Receipt from "../models/Receipt.js";
import Guest from "../models/Guest.js";
import Room from "../models/Room.js";
import PaymentOption from "../models/PaymentOption.js";
import PaymentType from "../models/PaymentType.js";
const { Reservation, ReservationRoom } = ReservationModel;
// Helper function to generate date ranges
const getDateRange = (period, startDate, endDate) => {
  const now = new Date();
  let start, end;

  switch (period) {
    case "daily":
      start = new Date(now.setHours(0, 0, 0, 0));
      end = new Date(now.setHours(23, 59, 59, 999));
      break;
    case "weekly":
      start = new Date(now.setDate(now.getDate() - 7));
      end = new Date();
      break;
    case "monthly":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
    case "custom":
      start = new Date(startDate);
      end = new Date(endDate);
      break;
    default:
      start = new Date(now.setHours(0, 0, 0, 0));
      end = new Date();
  }

  return { start, end };
};

// ========== RESERVATION REPORTS ==========

// controllers/reportController.js - Fix for getReservationsReport
export const getReservationsReport = async (req, res) => {
  try {
    const { period, startDate, endDate, status } = req.query;
    const { start, end } = getDateRange(period, startDate, endDate);

    // Build query
    let query = {
      createdAt: { $gte: start, $lte: end },
    };

    if (status && status !== "all") {
      query.status = status;
    }

    // Fetch reservations with necessary population
    const reservations = await Reservation.find(query)
      .populate({
        path: "guestId",
        select: "firstName lastName email contactNumber",
      })
      .populate({
        path: "paymentOption",
        select: "name paymentType",
      })
      .populate({
        path: "userId",
        select: "firstName lastName email",
      })
      .sort({ createdAt: -1 });

    // Calculate new reservations (created within last 7 days from current date, not from report period)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const newReservations = reservations.filter(
      (r) => new Date(r.createdAt) >= sevenDaysAgo,
    ).length;

    // Calculate average nights
    let totalNights = 0;
    let validNightsCount = 0;

    reservations.forEach((r) => {
      if (r.nights && r.nights > 0) {
        totalNights += r.nights;
        validNightsCount++;
      }
    });

    const averageNights =
      validNightsCount > 0
        ? parseFloat((totalNights / validNightsCount).toFixed(1))
        : 0;

    // Calculate cancellation rate (includes cancelled, expired, no_show)
    const cancelledCount = reservations.filter(
      (r) =>
        r.status === "cancelled" ||
        r.status === "expired" ||
        r.status === "no_show",
    ).length;

    const cancellationRate =
      reservations.length > 0
        ? parseFloat(((cancelledCount / reservations.length) * 100).toFixed(1))
        : 0;

    // Get room assignments for each reservation
    const reservationsWithRooms = await Promise.all(
      reservations.map(async (reservation) => {
        const rooms = await ReservationRoom.find({
          reservationId: reservation._id,
        }).populate({
          path: "roomId",
          select: "roomNumber roomType capacity",
          populate: {
            path: "roomType",
            select: "name",
          },
        });

        return {
          ...reservation.toObject(),
          rooms: rooms.map((rr) => ({
            _id: rr.roomId?._id,
            roomNumber: rr.roomId?.roomNumber,
            roomType: rr.roomId?.roomType,
          })),
        };
      }),
    );

    res.status(200).json({
      success: true,
      period,
      dateRange: { start, end },
      totalReservations: reservations.length,
      newReservations,
      averageNights,
      cancellationRate,
      reservations: reservationsWithRooms,
    });
  } catch (error) {
    console.error("Error in getReservationsReport:", error);
    res.status(500).json({
      success: false,
      message: "Error generating reservations report",
      error: error.message,
    });
  }
};

// 2. Reservation Status Report
export const getReservationStatusReport = async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;
    const { start, end } = getDateRange(period, startDate, endDate);

    const reservations = await Reservation.find({
      createdAt: { $gte: start, $lte: end },
    });

    // Group by status
    const statusGroups = {};
    const statuses = [
      "pending",
      "confirmed",
      "checked_in",
      "checked_out",
      "cancelled",
      "expired",
      "no_show",
    ];

    statuses.forEach((status) => {
      statusGroups[status] = reservations.filter((r) => r.status === status);
    });

    // Calculate percentages
    const total = reservations.length;
    const summary = statuses.map((status) => {
      const count = statusGroups[status].length;
      return {
        status,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
        reservations: statusGroups[status],
      };
    });

    res.status(200).json({
      success: true,
      period,
      dateRange: { start, end },
      totalReservations: total,
      summary,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error generating status report",
      error: error.message,
    });
  }
};

// 3. Room Occupancy Report
export const getRoomOccupancyReport = async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;
    const { start, end } = getDateRange(period, startDate, endDate);

    // Get all rooms and populate roomType to get the name
    const rooms = await Room.find()
      .select("roomNumber roomType floor capacity basePrice status")
      .populate({
        path: "roomType",
        select: "name description", // Get the room type name and description
      });

    // Get reservations within date range
    const reservations = await Reservation.find({
      $or: [
        { checkIn: { $lte: end }, checkOut: { $gte: start } },
        { status: "checked_in" },
      ],
    }).populate({
      path: "guestId",
      select: "firstName lastName",
    });

    // Calculate occupancy for each room
    const occupancyData = await Promise.all(
      rooms.map(async (room) => {
        const roomReservations = await ReservationRoom.find({
          roomId: room._id,
        }).populate({
          path: "reservationId",
          match: {
            $or: [
              { checkIn: { $lte: end }, checkOut: { $gte: start } },
              { status: "checked_in" },
            ],
          },
          populate: {
            path: "guestId",
            select: "firstName lastName",
          },
        });
        const validReservations = roomReservations.filter(
          (rr) => rr.reservationId,
        );

        // Calculate occupied days
        let occupiedDays = 0;
        const daysInRange = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

        validReservations.forEach((rr) => {
          const reservation = rr.reservationId;
          const checkIn = new Date(reservation.checkIn);
          const checkOut = new Date(reservation.checkOut);

          // Calculate overlap days
          const overlapStart = checkIn < start ? start : checkIn;
          const overlapEnd = checkOut > end ? end : checkOut;
          const overlapDays = Math.ceil(
            (overlapEnd - overlapStart) / (1000 * 60 * 60 * 24),
          );

          occupiedDays += Math.max(0, overlapDays);
        });

        const occupancyRate =
          daysInRange > 0 ? (occupiedDays / daysInRange) * 100 : 0;

        return {
          room: {
            _id: room._id,
            roomNumber: room.roomNumber,
            roomType: room.roomType
              ? {
                  _id: room.roomType._id,
                  name: room.roomType.name,
                  description: room.roomType.description,
                }
              : null,
            floor: room.floor,
            capacity: room.capacity,
            basePrice: room.basePrice,
            status: room.status,
          },
          occupiedDays,
          totalDays: daysInRange,
          occupancyRate: Math.round(occupancyRate * 100) / 100,
          currentReservations: validReservations.map((rr) => ({
            reservationId: rr.reservationId._id,
            reservationNumber: rr.reservationId.reservationNumber,
            checkIn: rr.reservationId.checkIn,
            checkOut: rr.reservationId.checkOut,
            guest: rr.reservationId.guestId,
            status: rr.reservationId.status,
          })),
        };
      }),
    );

    // Overall statistics
    const totalRooms = rooms.length;
    const occupiedRooms = occupancyData.filter(
      (room) => room.currentReservations.length > 0,
    ).length;
    const overallOccupancyRate =
      totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;

    res.status(200).json({
      success: true,
      period,
      dateRange: { start, end },
      totalRooms,
      occupiedRooms,
      availableRooms: totalRooms - occupiedRooms,
      overallOccupancyRate: Math.round(overallOccupancyRate * 100) / 100,
      rooms: occupancyData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error generating occupancy report",
      error: error.message,
    });
  }
};

// ========== BILLING REPORTS ==========

// 4. Daily/Monthly Revenue Report
export const getRevenueReport = async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;
    const { start, end } = getDateRange(period, startDate, endDate);

    const billings = await Billing.find({
      createdAt: { $gte: start, $lte: end },
      status: { $in: ["paid", "partial"] },
    })
      .populate({
        path: "reservationId",
        populate: [
          {
            path: "guestId",
            select: "firstName lastName",
          },
          {
            path: "paymentOption",
            select: "name",
          },
        ],
      })
      .populate({
        path: "receipts",
        select: "amountPaid paymentType status",
        match: { status: "confirmed" },
      });

    // Calculate totals
    const totals = billings.reduce(
      (acc, billing) => {
        const receiptsTotal =
          billing.receipts?.reduce(
            (sum, receipt) => sum + (receipt.amountPaid || 0),
            0,
          ) || 0;

        return {
          totalRevenue: acc.totalRevenue + receiptsTotal,
          totalAmount: acc.totalAmount + (billing.totalAmount || 0),
          totalPaid: acc.totalPaid + (billing.amountPaid || 0),
          totalBalance: acc.totalBalance + (billing.balance || 0),
          count: acc.count + 1,
        };
      },
      {
        totalRevenue: 0,
        totalAmount: 0,
        totalPaid: 0,
        totalBalance: 0,
        count: 0,
      },
    );

    // Group by payment method
    const paymentMethodSummary = {};
    const paymentTypes = await PaymentType.find({ isActive: true });

    for (const billing of billings) {
      for (const receipt of billing.receipts || []) {
        // Fix: Use the paymentType ObjectId directly
        const paymentTypeId = receipt.paymentType?.toString();
        const paymentType = paymentTypes.find(
          (pt) => pt._id.toString() === paymentTypeId,
        );
        const methodName = paymentType ? paymentType.name : "Unknown";

        if (!paymentMethodSummary[methodName]) {
          paymentMethodSummary[methodName] = {
            amount: 0,
            count: 0,
          };
        }

        paymentMethodSummary[methodName].amount += receipt.amountPaid || 0;
        paymentMethodSummary[methodName].count += 1;
      }
    }

    // Prepare transactions data
    const transactions = billings.map((billing) => ({
      billingNumber: billing.billingNumber,
      reservationNumber: billing.reservationId?.reservationNumber,
      guest: billing.reservationId?.guestId,
      totalAmount: billing.totalAmount,
      amountPaid: billing.amountPaid,
      balance: billing.balance,
      status: billing.status,
      paymentOption: billing.reservationId?.paymentOption?.name,
    }));

    res.status(200).json({
      success: true,
      period,
      dateRange: { start, end },
      totals,
      paymentMethodSummary,
      transactions,
    });
  } catch (error) {
    console.error("Error in getRevenueReport:", error);
    res.status(500).json({
      success: false,
      message: "Error generating revenue report",
      error: error.message,
    });
  }
};

// 5. Payment Report
export const getPaymentReport = async (req, res) => {
  try {
    const { period, startDate, endDate, status } = req.query;
    const { start, end } = getDateRange(period, startDate, endDate);

    let query = {
      createdAt: { $gte: start, $lte: end },
    };

    if (status && status !== "all") {
      query.status = status;
    }

    const receipts = await Receipt.find(query)
      .populate({
        path: "billingId",
        select: "billingNumber",
        populate: {
          path: "reservationId",
          select: "reservationNumber",
          populate: {
            path: "guestId",
            select: "firstName lastName",
          },
        },
      })
      .populate({
        path: "paymentType",
        select: "name isReceipt",
      })
      .sort({ createdAt: -1 });

    const totals = receipts.reduce(
      (acc, receipt) => {
        return {
          totalAmountPaid: acc.totalAmountPaid + (receipt.amountPaid || 0),
          totalAmountReceived:
            acc.totalAmountReceived + (receipt.amountReceived || 0),
          totalChange: acc.totalChange + (receipt.change || 0),
          count: acc.count + 1,
        };
      },
      { totalAmountPaid: 0, totalAmountReceived: 0, totalChange: 0, count: 0 },
    );

    res.status(200).json({
      success: true,
      period,
      dateRange: { start, end },
      totals,
      receipts,
    });
  } catch (error) {
    console.error("Error in getPaymentReport:", error);
    res.status(500).json({
      success: false,
      message: "Error generating payment report",
      error: error.message,
    });
  }
};

// 6. Refund Report
export const getRefundReport = async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;
    const { start, end } = getDateRange(period, startDate, endDate);

    const billings = await Billing.find({
      updatedAt: { $gte: start, $lte: end },
      status: "refunded",
    })
      .populate({
        path: "reservationId",
        populate: {
          path: "guestId",
          select: "firstName lastName email phone",
        },
      })
      .populate({
        path: "receipts",
        match: { status: "confirmed" },
      })
      .sort({ updatedAt: -1 });

    const totals = billings.reduce(
      (acc, billing) => {
        return {
          totalRefunded: acc.totalRefunded + (billing.refundAmount || 0),
          count: acc.count + 1,
        };
      },
      { totalRefunded: 0, count: 0 },
    );

    res.status(200).json({
      success: true,
      period,
      dateRange: { start, end },
      totals,
      refunds: billings.map((billing) => ({
        billingNumber: billing.billingNumber,
        reservationNumber: billing.reservationId?.reservationNumber,
        guest: billing.reservationId?.guestId,
        originalAmount: billing.totalAmount,
        refundAmount: billing.refundAmount,
        refundedAt: billing.updatedAt,
        receipts: billing.receipts,
        notes: billing.notes,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error generating refund report",
      error: error.message,
    });
  }
};

// 7. Outstanding Balance Report
export const getOutstandingBalanceReport = async (req, res) => {
  try {
    const billings = await Billing.find({
      status: { $in: ["unpaid", "partial"] },
      balance: { $gt: 0 },
    })
      .populate({
        path: "reservationId",
        populate: [
          {
            path: "guestId",
            select: "firstName lastName email phone",
          },
          {
            path: "paymentOption",
            select: "name paymentType amount",
          },
        ],
      })
      .populate({
        path: "receipts",
        match: { status: "confirmed" },
      })
      .sort({ createdAt: -1 });

    const totals = billings.reduce(
      (acc, billing) => {
        return {
          totalOutstanding: acc.totalOutstanding + (billing.balance || 0),
          totalAmount: acc.totalAmount + (billing.totalAmount || 0),
          totalPaid: acc.totalPaid + (billing.amountPaid || 0),
          count: acc.count + 1,
        };
      },
      { totalOutstanding: 0, totalAmount: 0, totalPaid: 0, count: 0 },
    );

    // Categorize by overdue status
    const today = new Date();
    const overdue = billings.filter((billing) => {
      const reservation = billing.reservationId;
      if (!reservation) return false;
      return new Date(reservation.checkIn) < today && billing.balance > 0;
    });

    const pending = billings.filter((billing) => {
      const reservation = billing.reservationId;
      if (!reservation) return false;
      return new Date(reservation.checkIn) >= today && billing.balance > 0;
    });

    res.status(200).json({
      success: true,
      totals,
      overdue: {
        count: overdue.length,
        amount: overdue.reduce((sum, b) => sum + (b.balance || 0), 0),
        items: overdue,
      },
      pending: {
        count: pending.length,
        amount: pending.reduce((sum, b) => sum + (b.balance || 0), 0),
        items: pending,
      },
      allOutstanding: billings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error generating outstanding balance report",
      error: error.message,
    });
  }
};

// ========== EXPORT FUNCTIONS ==========

// Export to Excel
export const exportReportToExcel = async (req, res) => {
  try {
    const { reportType, ...queryParams } = req.query;
    let reportData;

    // Get report data based on type
    switch (reportType) {
      case "reservations":
        reportData = await getReservationsReportData(queryParams);
        break;
      case "status":
        reportData = await getStatusReportData(queryParams);
        break;
      case "revenue":
        reportData = await getRevenueReportData(queryParams);
        break;
      case "occupancy":
        reportData = await getOccupancyReportData(queryParams);
        break;
      case "payments":
        reportData = await getPaymentsReportData(queryParams);
        break;
      case "refunds":
        reportData = await getRefundsReportData(queryParams);
        break;
      case "outstanding":
        reportData = await getOutstandingReportData(queryParams);
        break;
      default:
        return res.status(400).json({
          success: false,
          message: "Invalid report type",
        });
    }

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Report");

    // Add headers
    worksheet.columns = reportData.columns;

    // Add rows
    if (reportData.rows && reportData.rows.length > 0) {
      worksheet.addRows(reportData.rows);
    }

    // Style headers
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // Set column widths
    worksheet.columns.forEach((column, index) => {
      const header = reportData.columns[index].header;
      column.width = Math.max(header.length + 2, 12);
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Set headers for download
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${reportType}_report_${new Date().toISOString().split("T")[0]}.xlsx`,
    );

    res.send(buffer);
  } catch (error) {
    console.error("Error exporting to Excel:", error);
    res.status(500).json({
      success: false,
      message: "Error exporting report to Excel",
      error: error.message,
    });
  }
};

// Helper functions for Excel export
const getReservationsReportData = async (params) => {
  const { period, startDate, endDate, status } = params;
  const { start, end } = getDateRange(period, startDate, endDate);

  const query = {
    createdAt: { $gte: start, $lte: end },
  };

  if (status && status !== "all") {
    query.status = status;
  }

  const reservations = await Reservation.find(query)
    .populate("guestId", "firstName lastName email phone")
    .populate("paymentOption", "name")
    .sort({ createdAt: -1 });

  return {
    columns: [
      { header: "Reservation No.", key: "reservationNumber" },
      { header: "Guest Name", key: "guestName" },
      { header: "Check-In", key: "checkIn" },
      { header: "Check-Out", key: "checkOut" },
      { header: "Nights", key: "nights" },
      { header: "Adults", key: "adults" },
      { header: "Children", key: "children" },
      { header: "Status", key: "status" },
      { header: "Payment Option", key: "paymentOption" },
      { header: "Created At", key: "createdAt" },
    ],
    rows: reservations.map((r) => ({
      reservationNumber: r.reservationNumber,
      guestName: r.guestId
        ? `${r.guestId.firstName} ${r.guestId.lastName}`
        : "N/A",
      checkIn: r.checkIn?.toISOString().split("T")[0],
      checkOut: r.checkOut?.toISOString().split("T")[0],
      nights: r.nights,
      adults: r.adults,
      children: r.children,
      status: r.status,
      paymentOption: r.paymentOption?.name || "N/A",
      createdAt: r.createdAt.toISOString().split("T")[0],
    })),
  };
};

const getStatusReportData = async (params) => {
  const { period, startDate, endDate } = params;
  const { start, end } = getDateRange(period, startDate, endDate);

  const reservations = await Reservation.find({
    createdAt: { $gte: start, $lte: end },
  });

  // Group by status
  const statuses = [
    "pending",
    "confirmed",
    "checked_in",
    "checked_out",
    "cancelled",
    "expired",
    "no_show",
  ];

  const statusGroups = statuses.map((status) => {
    const count = reservations.filter((r) => r.status === status).length;
    const percentage =
      reservations.length > 0 ? (count / reservations.length) * 100 : 0;
    return {
      status: status.replace("_", " ").toUpperCase(),
      count,
      percentage: `${percentage.toFixed(2)}%`,
    };
  });

  return {
    columns: [
      { header: "Status", key: "status" },
      { header: "Count", key: "count" },
      { header: "Percentage", key: "percentage" },
    ],
    rows: statusGroups,
  };
};

const getRevenueReportData = async (params) => {
  const { period, startDate, endDate } = params;
  const { start, end } = getDateRange(period, startDate, endDate);

  const billings = await Billing.find({
    createdAt: { $gte: start, $lte: end },
    status: { $in: ["paid", "partial"] },
  })
    .populate({
      path: "reservationId",
      populate: {
        path: "guestId",
        select: "firstName lastName",
      },
    })
    .populate({
      path: "receipts",
      match: { status: "confirmed" },
    });

  return {
    columns: [
      { header: "Billing No.", key: "billingNumber", width: 15 },
      { header: "Reservation No.", key: "reservationNumber", width: 15 },
      { header: "Guest Name", key: "guestName", width: 20 },
      { header: "Total Amount", key: "totalAmount", width: 15 },
      { header: "Amount Paid", key: "amountPaid", width: 15 },
      { header: "Balance", key: "balance", width: 15 },
      { header: "Status", key: "status", width: 15 },
      { header: "Payment Date", key: "paymentDate", width: 20 },
    ],
    rows: billings.map((b) => ({
      billingNumber: b.billingNumber || "N/A",
      reservationNumber: b.reservationId?.reservationNumber || "N/A",
      guestName: b.reservationId?.guestId
        ? `${b.reservationId.guestId.firstName} ${b.reservationId.guestId.lastName}`
        : "N/A",
      totalAmount: b.totalAmount,
      amountPaid: b.amountPaid,
      balance: b.balance,
      status: b.status,
      paymentDate: b.updatedAt.toISOString().split("T")[0],
    })),
  };
};

const getOccupancyReportData = async (params) => {
  const { period, startDate, endDate } = params;
  const { start, end } = getDateRange(period, startDate, endDate);

  // Populate roomType to get the name
  const rooms = await Room.find()
    .select("roomNumber roomType floor capacity basePrice status")
    .populate({
      path: "roomType",
      select: "name",
    });

  const occupancyData = await Promise.all(
    rooms.map(async (room) => {
      const roomReservations = await ReservationRoom.find({
        roomId: room._id,
      }).populate({
        path: "reservationId",
        match: {
          $or: [
            { checkIn: { $lte: end }, checkOut: { $gte: start } },
            { status: "checked_in" },
          ],
        },
      });

      const validReservations = roomReservations.filter(
        (rr) => rr.reservationId,
      );
      const occupiedDays = validReservations.length * 1; // Simplified calculation
      const daysInRange = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      const occupancyRate =
        daysInRange > 0 ? (occupiedDays / daysInRange) * 100 : 0;

      return { room, occupancyRate, occupiedDays };
    }),
  );

  return {
    columns: [
      { header: "Room No.", key: "roomNumber", width: 15 },
      { header: "Room Type", key: "roomType", width: 20 },
      { header: "Floor", key: "floor", width: 10 },
      { header: "Capacity", key: "capacity", width: 10 },
      { header: "Base Price", key: "basePrice", width: 15 },
      { header: "Status", key: "status", width: 15 },
      { header: "Occupied Days", key: "occupiedDays", width: 15 },
      { header: "Occupancy Rate", key: "occupancyRate", width: 15 },
    ],
    rows: occupancyData.map((data) => ({
      roomNumber: data.room.roomNumber,
      roomType: data.room.roomType?.name || "N/A", // Use room type name
      floor: data.room.floor,
      capacity: data.room.capacity,
      basePrice: data.room.basePrice,
      status: data.room.status,
      occupiedDays: data.occupiedDays,
      occupancyRate: `${data.occupancyRate.toFixed(2)}%`,
    })),
  };
};

const getPaymentsReportData = async (params) => {
  const { period, startDate, endDate, status } = params;
  const { start, end } = getDateRange(period, startDate, endDate);

  let query = {
    createdAt: { $gte: start, $lte: end },
  };

  if (status && status !== "all") {
    query.status = status;
  }

  const receipts = await Receipt.find(query)
    .populate({
      path: "billingId",
      select: "billingNumber",
      populate: {
        path: "reservationId",
        select: "reservationNumber",
        populate: {
          path: "guestId",
          select: "firstName lastName",
        },
      },
    })
    .populate({
      path: "paymentType",
      select: "name isReceipt",
    })
    .sort({ createdAt: -1 });

  return {
    columns: [
      { header: "Receipt ID", key: "receiptId", width: 20 },
      { header: "Billing No.", key: "billingNumber", width: 15 },
      { header: "Reservation No.", key: "reservationNumber", width: 15 },
      { header: "Guest Name", key: "guestName", width: 20 },
      { header: "Payment Method", key: "paymentMethod", width: 20 },
      { header: "Amount Paid", key: "amountPaid", width: 15 },
      { header: "Amount Received", key: "amountReceived", width: 15 },
      { header: "Change", key: "change", width: 15 },
      { header: "Status", key: "status", width: 15 },
      { header: "Payment Date", key: "paymentDate", width: 20 },
    ],
    rows: receipts.map((receipt) => ({
      receiptId: receipt._id.toString().slice(-8).toUpperCase(),
      billingNumber: receipt.billingId?.billingNumber || "N/A",
      reservationNumber:
        receipt.billingId?.reservationId?.reservationNumber || "N/A",
      guestName: receipt.billingId?.reservationId?.guestId
        ? `${receipt.billingId.reservationId.guestId.firstName} ${receipt.billingId.reservationId.guestId.lastName}`
        : "N/A",
      paymentMethod: receipt.paymentType?.name || "N/A",
      amountPaid: receipt.amountPaid || 0,
      amountReceived: receipt.amountReceived || 0,
      change: receipt.change || 0,
      status: receipt.status,
      paymentDate: receipt.createdAt.toISOString().split("T")[0],
    })),
  };
};

const getRefundsReportData = async (params) => {
  const { period, startDate, endDate } = params;
  const { start, end } = getDateRange(period, startDate, endDate);

  const billings = await Billing.find({
    updatedAt: { $gte: start, $lte: end },
    status: "refunded",
  })
    .populate({
      path: "reservationId",
      populate: {
        path: "guestId",
        select: "firstName lastName email phone",
      },
    })
    .populate({
      path: "receipts",
      match: { status: "confirmed" },
    })
    .sort({ updatedAt: -1 });

  return {
    columns: [
      { header: "Billing No.", key: "billingNumber", width: 15 },
      { header: "Reservation No.", key: "reservationNumber", width: 15 },
      { header: "Guest Name", key: "guestName", width: 20 },
      { header: "Original Amount", key: "originalAmount", width: 15 },
      { header: "Refund Amount", key: "refundAmount", width: 15 },
      { header: "Refund Date", key: "refundDate", width: 20 },
      { header: "Notes", key: "notes", width: 30 },
    ],
    rows: billings.map((billing) => ({
      billingNumber: billing.billingNumber || "N/A",
      reservationNumber: billing.reservationId?.reservationNumber || "N/A",
      guestName: billing.reservationId?.guestId
        ? `${billing.reservationId.guestId.firstName} ${billing.reservationId.guestId.lastName}`
        : "N/A",
      originalAmount: billing.totalAmount || 0,
      refundAmount: billing.refundAmount || 0,
      refundDate: billing.updatedAt.toISOString().split("T")[0],
      notes: billing.notes || "",
    })),
  };
};

const getOutstandingReportData = async (params) => {
  const billings = await Billing.find({
    status: { $in: ["unpaid", "partial"] },
    balance: { $gt: 0 },
  })
    .populate({
      path: "reservationId",
      populate: [
        {
          path: "guestId",
          select: "firstName lastName email phone",
        },
        {
          path: "paymentOption",
          select: "name paymentType amount",
        },
      ],
    })
    .populate({
      path: "receipts",
      match: { status: "confirmed" },
    })
    .sort({ createdAt: -1 });

  const today = new Date();

  return {
    columns: [
      { header: "Billing No.", key: "billingNumber", width: 15 },
      { header: "Reservation No.", key: "reservationNumber", width: 15 },
      { header: "Guest Name", key: "guestName", width: 20 },
      { header: "Check-In Date", key: "checkInDate", width: 15 },
      { header: "Total Amount", key: "totalAmount", width: 15 },
      { header: "Amount Paid", key: "amountPaid", width: 15 },
      { header: "Balance", key: "balance", width: 15 },
      { header: "Status", key: "status", width: 15 },
      { header: "Payment Option", key: "paymentOption", width: 20 },
      { header: "Overdue", key: "isOverdue", width: 10 },
    ],
    rows: billings.map((billing) => {
      const checkInDate = billing.reservationId?.checkIn;
      const isOverdue = checkInDate && new Date(checkInDate) < today;

      return {
        billingNumber: billing.billingNumber || "N/A",
        reservationNumber: billing.reservationId?.reservationNumber || "N/A",
        guestName: billing.reservationId?.guestId
          ? `${billing.reservationId.guestId.firstName} ${billing.reservationId.guestId.lastName}`
          : "N/A",
        checkInDate: checkInDate?.toISOString().split("T")[0] || "N/A",
        totalAmount: billing.totalAmount || 0,
        amountPaid: billing.amountPaid || 0,
        balance: billing.balance || 0,
        status: billing.status,
        paymentOption: billing.reservationId?.paymentOption?.name || "N/A",
        isOverdue: isOverdue ? "YES" : "NO",
      };
    }),
  };
};

// Export to PDF
export const exportReportToPDF = async (req, res) => {
  try {
    const { reportType, ...queryParams } = req.query;
    let reportData;

    // Get report data based on type
    switch (reportType) {
      case "reservations":
        reportData = await getReservationsReportData(queryParams);
        break;
      case "status":
        reportData = await getStatusReportData(queryParams);
        break;
      case "revenue":
        reportData = await getRevenueReportData(queryParams);
        break;
      case "occupancy":
        reportData = await getOccupancyReportData(queryParams);
        break;
      case "payments":
        reportData = await getPaymentsReportData(queryParams);
        break;
      case "refunds":
        reportData = await getRefundsReportData(queryParams);
        break;
      case "outstanding":
        reportData = await getOutstandingReportData(queryParams);
        break;
      default:
        return res.status(400).json({
          success: false,
          message: "Invalid report type",
        });
    }

    // Create PDF document
    const doc = new PDFDocument({
      margin: 50,
      size: "A4",
      layout: "landscape",
    });
    const filename = `${reportType}_report_${new Date().toISOString().split("T")[0]}.pdf`;

    // Set headers for download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // Pipe PDF to response
    doc.pipe(res);

    // Add title
    doc
      .fontSize(20)
      .text(
        `Hotel Management System - ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`,
        {
          align: "center",
        },
      );
    doc.moveDown();

    // Add date and filters info
    doc.fontSize(10);
    if (queryParams.period) {
      doc.text(`Period: ${queryParams.period}`, { align: "left" });
    }
    if (queryParams.startDate && queryParams.endDate) {
      doc.text(
        `Date Range: ${new Date(queryParams.startDate).toLocaleDateString()} - ${new Date(queryParams.endDate).toLocaleDateString()}`,
        { align: "left" },
      );
    }
    doc.text(
      `Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
      {
        align: "right",
      },
    );
    doc.moveDown(2);

    // Add table
    if (reportData.rows && reportData.rows.length > 0) {
      const tableTop = doc.y;
      const columnCount = reportData.columns.length;
      const pageWidth = 750; // Landscape width
      const columnWidth = pageWidth / columnCount;
      const rowHeight = 20;

      // Table headers
      doc.fontSize(10).font("Helvetica-Bold");
      reportData.columns.forEach((column, i) => {
        doc.text(column.header, 50 + i * columnWidth, tableTop, {
          width: columnWidth - 10,
          align: "left",
        });
      });

      // Draw line under headers
      doc
        .moveTo(50, tableTop + 15)
        .lineTo(50 + pageWidth, tableTop + 15)
        .stroke();
      doc.moveDown();

      // Table rows
      doc.font("Helvetica");
      reportData.rows.forEach((row, rowIndex) => {
        const y = tableTop + 30 + rowIndex * rowHeight;

        // Check if we need a new page
        if (y > 550) {
          doc.addPage();
          doc.y = 50;
          return;
        }

        reportData.columns.forEach((column, colIndex) => {
          const value =
            row[column.key] !== undefined ? String(row[column.key]) : "";
          doc.text(value, 50 + colIndex * columnWidth, y, {
            width: columnWidth - 10,
            align: "left",
          });
        });
      });

      // Add summary
      doc.moveDown(3);
      doc.font("Helvetica-Bold").text("Summary:", 50, doc.y);
      doc
        .font("Helvetica")
        .text(`Total Records: ${reportData.rows.length}`, 50, doc.y + 20);
    } else {
      doc
        .fontSize(12)
        .text("No data available for the selected criteria.", 50, doc.y);
    }

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error("Error exporting to PDF:", error);
    res.status(500).json({
      success: false,
      message: "Error exporting report to PDF",
      error: error.message,
    });
  }
};
