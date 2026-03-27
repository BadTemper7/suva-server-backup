// controllers/billingController.js
import Billing from "../models/Billing.js";
import ReservationModels from "../models/Reservation.js";
import DiscountImg from "../models/DiscountImage.js";
import mongoose from "mongoose";
import Receipt from "../models/Receipt.js";
import Discount from "../models/Discount.js";
import PaymentOption from "../models/PaymentOption.js";

import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
// Add this helper function at the top of the file
const formatMoney = (amount) => {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
};
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { Reservation, ReservationRoom } = ReservationModels;
const calcNights = (checkIn, checkOut) => {
  const inDate = new Date(checkIn);
  const outDate = new Date(checkOut);
  if (Number.isNaN(inDate.getTime()) || Number.isNaN(outDate.getTime()))
    return 0;
  return Math.floor((outDate - inDate) / (1000 * 60 * 60 * 24));
};
// Helper function to calculate room + amenity subtotal
async function calculateSubTotal(reservationId) {
  const reservationRooms = await ReservationRoom.find({ reservationId })
    .populate("roomId")
    .populate({
      path: "addOns.addOnId",
      model: "AddOn",
    });

  let subTotal = 0;

  for (const resRoom of reservationRooms) {
    // Room rate * nights
    const roomRate = resRoom.roomId?.rate || 0;
    subTotal += roomRate;

    // Add add-ons
    if (resRoom.addOns && resRoom.addOns.length > 0) {
      for (const addOn of resRoom.addOns) {
        const addOnRate = addOn.addOnId?.rate || 0;
        const quantity = addOn.quantity || 0;
        subTotal += addOnRate * quantity;
      }
    }
  }

  return subTotal;
}

// Generate or update billing for a reservation
export const generateBilling = async (req, res) => {
  try {
    const { reservationId } = req.body;

    const reservation =
      await Reservation.findById(reservationId).populate("paymentOption");
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    const reservationRooms = await ReservationRoom.find({ reservationId })
      .populate("roomId")
      .populate("addOns.addOnId");

    if (!reservationRooms || reservationRooms.length === 0) {
      return res
        .status(400)
        .json({ error: "No rooms found for this reservation" });
    }

    // Calculate subtotal
    let subTotal = 0;
    reservationRooms.forEach((resRoom) => {
      const roomRate = resRoom.roomId?.rate || 0;
      subTotal += roomRate;

      if (resRoom.addOns && resRoom.addOns.length > 0) {
        resRoom.addOns.forEach((a) => {
          const addOnRate = a.addOnId?.rate || 0;
          subTotal += addOnRate * a.quantity;
        });
      }
    });

    // Apply discount only if confirmed
    let discountAmount = 0;
    if (reservation.discountId) {
      discountAmount = 0; // TODO: Add discount logic
    }

    const totalAmount = subTotal - discountAmount;

    let amountDueNow = totalAmount;
    if (reservation.paymentOption) {
      if (
        reservation.paymentOption.paymentType === "partial" &&
        reservation.paymentOption.amount
      ) {
        amountDueNow = totalAmount * (reservation.paymentOption.amount / 100);
      }
    }

    const billingNumber = await Billing.generateBillingNumber();
    let billing = await Billing.findOne({ reservationId });

    if (!billing) {
      billing = new Billing({
        billingNumber,
        reservationId,
        subTotal,
        discountAmount,
        totalAmount,
        amountDueNow,
      });
    } else {
      billing.billingNumber = billingNumber;
      billing.subTotal = subTotal;
      billing.discountAmount = discountAmount;
      billing.totalAmount = totalAmount;
      billing.amountDueNow = amountDueNow;
    }

    await billing.save();

    return res.status(201).json({
      message: "Billing generated successfully",
      billing,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

export const getBillingByReservation = async (req, res) => {
  try {
    const { reservationId } = req.params;
    const billing = await Billing.findOne({ reservationId })
      .populate("reservationId")
      .populate("receipts");
    if (!billing) {
      return res.status(404).json({ error: "Billing not found" });
    }

    return res.status(200).json({
      message: "Billing retrieved successfully",
      billing,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Get billing by ID
export const getBillingById = async (req, res) => {
  try {
    const { billingId } = req.params;

    if (!mongoose.isValidObjectId(billingId))
      return res.status(400).json({ error: "Invalid billingId" });

    const billing = await Billing.findById(billingId);
    if (!billing) return res.status(404).json({ error: "Billing not found" });

    return res.status(200).json({
      message: "Billing retrieved successfully",
      billing,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Get all billings
export const getBillings = async (req, res) => {
  try {
    const billings = await Billing.find()
      .populate("receipts")
      .populate("reservationId")
      .populate({
        path: "reservationId",
        populate: {
          path: "guestId",
          model: "Guest",
        },
      })
      .populate({
        path: "reservationId",
        populate: {
          path: "paymentOption",
          model: "PaymentOption",
        },
      })
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Billings retrieved successfully",
      count: billings.length,
      billings,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

// Update billing calculation
// Update billing calculation
export const updateBillingCalc = async (req, res) => {
  try {
    const { billingId } = req.params;

    if (!billingId) {
      return res.status(400).json({ message: "Billing ID is required" });
    }

    const billing = await Billing.findById(billingId);
    if (!billing) {
      return res.status(404).json({ message: "Billing not found" });
    }

    // If billing is already refunded, don't update calculations
    if (billing.status === "refunded") {
      return res.status(200).json({
        success: true,
        billing: {
          status: billing.status,
          isRefundable: false,
          message: "Billing is already refunded",
        },
      });
    }

    const reservation = await Reservation.findById(billing.reservationId);
    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    const paymentOption = await PaymentOption.findById(
      reservation.paymentOption,
    );
    if (!paymentOption) {
      return res.status(400).json({ message: "Invalid payment option" });
    }

    const [reservationRooms, discount, discountImg, receipts] =
      await Promise.all([
        ReservationRoom.find({ reservationId: reservation._id })
          .populate("roomId")
          .populate({
            path: "addOns",
            populate: { path: "addOnId", model: "AddOn" },
          }),
        reservation.discountId
          ? Discount.findById(reservation.discountId)
          : null,
        DiscountImg.find({ billingId }),
        Receipt.find({ billingId }),
      ]);

    const nights = Math.max(
      1,
      calcNights(reservation.checkIn, reservation.checkOut),
    );

    // Total amount paid
    const amountPaid = receipts.reduce(
      (sum, r) => (r.status === "confirmed" ? sum + r.amountPaid : sum),
      0,
    );

    // Per room totals + subtotal
    let subTotal = 0;
    const reservationRoomsTotal = reservationRooms.map((room) => {
      const r = room.toObject();
      const roomRateTotal = r.roomId.rate * nights;
      const addOnsTotal = r.addOns.reduce(
        (sum, a) => sum + a.quantity * a.addOnId.rate,
        0,
      );
      const totalAmount = roomRateTotal + addOnsTotal;
      subTotal += totalAmount;

      return {
        ...r,
        roomRateTotal,
        addOnsTotal,
        totalAmount,
      };
    });

    // Discount computation
    let discountAmount = 0;
    const percent = discount?.discountPercent || 0;

    if (discount && percent > 0) {
      const confirmedImgs = discountImg.filter(
        (img) => img.status === "confirmed",
      );

      if (discount.appliesToAllRooms) {
        discountAmount = subTotal * (percent / 100);
      } else if (reservationRoomsTotal.length) {
        const sortedRooms = [...reservationRoomsTotal].sort((a, b) =>
          discount.discountPriority === "lowest"
            ? a.totalAmount - b.totalAmount
            : b.totalAmount - a.totalAmount,
        );

        if (discount.isPerId) {
          const count = Math.min(
            confirmedImgs.length,
            discount.maxRoomCount || 1,
          );
          for (let i = 0; i < count; i++) {
            discountAmount += sortedRooms[i].totalAmount * (percent / 100);
          }
        } else {
          discountAmount = sortedRooms[0].totalAmount * (percent / 100);
        }
      }
    }

    discountAmount = Math.min(discountAmount, subTotal);
    const totalAmount = subTotal - discountAmount;

    // Amount due now
    const amountDueNow =
      paymentOption.paymentType === "full"
        ? totalAmount
        : totalAmount * (paymentOption.amount / 100);

    // Billing status and refundable flag
    let status = "unpaid";
    let isRefundable = false;

    if (amountPaid > 0) {
      if (paymentOption.paymentType === "full") {
        if (amountPaid >= totalAmount) {
          status = "paid";
          isRefundable = true;
        } else {
          status = "partial";
          // Even if not fully paid, still refundable if they paid something
          isRefundable = true;
        }
      } else if (paymentOption.paymentType === "partial") {
        if (amountPaid >= amountDueNow) {
          status = "partial";
          isRefundable = true;
        } else if (amountPaid > 0 && amountPaid < amountDueNow) {
          status = "partial";
          // Still refundable if they paid something
          isRefundable = true;
        }
      }
    } else {
      status = "unpaid";
      isRefundable = false;
    }

    const refundAmount = amountPaid * 0.5;

    // Update billing
    billing.subTotal = subTotal;
    billing.discountAmount = discountAmount;
    billing.totalAmount = totalAmount;
    billing.amountPaid = amountPaid;
    billing.amountDueNow = amountDueNow;
    billing.balance = Math.max(totalAmount - amountPaid, 0);
    billing.status = status;
    billing.isRefundable = isRefundable;
    billing.refundAmount = refundAmount;

    await billing.save();

    return res.status(200).json({
      success: true,
      billing: {
        nights,
        subTotal,
        discountAmount,
        totalAmount,
        amountDue: amountDueNow,
        amountPaid,
        refundAmount,
        isRefundable,
        status,
      },
    });
  } catch (error) {
    console.error("Update billing calc error:", error);
    return res.status(500).json({ error: error.message });
  }
};

// Add these imports at the top if not already there
// import moment from "moment"; // Optional: If you want to use moment.js
// Or use native Date methods

// ... existing imports ...

/**
 * Generate billing reports based on time period
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters
 * @param {string} req.query.period - 'daily', 'weekly', 'monthly', 'yearly', 'custom'
 * @param {string} req.query.startDate - Start date for custom period (ISO format)
 * @param {string} req.query.endDate - End date for custom period (ISO format)
 * @param {string} req.query.date - Specific date for daily (YYYY-MM-DD)
 * @param {string} req.query.month - Month for monthly (YYYY-MM)
 * @param {string} req.query.year - Year for yearly (YYYY)
 * @param {number} req.query.week - Week number for weekly (1-52)
 */
export const generateBillingReport = async (req, res) => {
  try {
    const {
      period = "daily",
      startDate,
      endDate,
      date,
      month,
      year,
      week,
    } = req.query;

    let start, end;

    // Helper function to parse date string and return Date object with local timezone
    const parseLocalDate = (dateStr) => {
      // Handle format like "2026-03-28"
      const [year, month, day] = dateStr.split("-");
      // Create date in local timezone (Philippine Time)
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    };

    // Helper function to get start of day in local timezone (UTC+8)
    const getStartOfDay = (dateStr) => {
      const d = parseLocalDate(dateStr);
      // Return date with local time at 00:00:00
      // This will convert to UTC automatically when saved to MongoDB
      return d;
    };

    // Helper function to get end of day in local timezone (UTC+8)
    const getEndOfDay = (dateStr) => {
      const d = parseLocalDate(dateStr);
      // Set to end of day local time
      d.setHours(23, 59, 59, 999);
      return d;
    };

    // Calculate date range based on period
    switch (period) {
      case "daily":
        if (date) {
          start = getStartOfDay(date);
          end = getEndOfDay(date);
        } else {
          const now = new Date();
          const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
          start = getStartOfDay(todayStr);
          end = getEndOfDay(todayStr);
        }
        break;

      case "weekly":
        if (week && year) {
          // Calculate start of week
          const firstDayOfYear = new Date(parseInt(year), 0, 1);
          const daysOffset = (parseInt(week) - 1) * 7;
          start = new Date(firstDayOfYear);
          start.setDate(firstDayOfYear.getDate() + daysOffset);
          // Adjust to start of week (Monday)
          const dayOfWeek = start.getDay();
          const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
          start.setDate(start.getDate() - diff);
        } else {
          // Current week - start from Monday
          const now = new Date();
          const day = now.getDay();
          const diff = day === 0 ? 6 : day - 1;
          start = new Date(now);
          start.setDate(now.getDate() - diff);
        }
        start = new Date(
          start.getFullYear(),
          start.getMonth(),
          start.getDate(),
          0,
          0,
          0,
          0,
        );
        end = new Date(start);
        end.setDate(end.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;

      case "monthly":
        if (month) {
          const [yearPart, monthPart] = month.split("-");
          start = new Date(
            parseInt(yearPart),
            parseInt(monthPart) - 1,
            1,
            0,
            0,
            0,
            0,
          );
        } else {
          const now = new Date();
          start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        }
        end = new Date(
          start.getFullYear(),
          start.getMonth() + 1,
          0,
          23,
          59,
          59,
          999,
        );
        break;

      case "yearly":
        const reportYear = year ? parseInt(year) : new Date().getFullYear();
        start = new Date(reportYear, 0, 1, 0, 0, 0, 0);
        end = new Date(reportYear, 11, 31, 23, 59, 59, 999);
        break;

      case "custom":
        if (!startDate || !endDate) {
          return res.status(400).json({
            error: "startDate and endDate are required for custom period",
          });
        }
        start = getStartOfDay(startDate);
        end = getEndOfDay(endDate);
        break;

      default:
        return res.status(400).json({
          error: "Invalid period. Use: daily, weekly, monthly, yearly, custom",
        });
    }

    // Validate date range
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    // Debug logging
    console.log("Report query params:", {
      period,
      date,
      month,
      year,
      week,
      startDate,
      endDate,
    });
    console.log("Calculated date range (Local):", {
      start: start.toLocaleString("en-PH", { timeZone: "Asia/Manila" }),
      end: end.toLocaleString("en-PH", { timeZone: "Asia/Manila" }),
      startUTC: start.toISOString(),
      endUTC: end.toISOString(),
    });

    // Fetch billings within date range
    const billings = await Billing.find({
      createdAt: { $gte: start, $lte: end },
    })
      .populate({
        path: "reservationId",
        populate: [
          {
            path: "guestId",
            model: "Guest",
            select: "firstName lastName contactNumber email",
          },
          {
            path: "paymentOption",
            model: "PaymentOption",
            select: "name paymentType amount",
          },
        ],
      })
      .populate({
        path: "receipts",
        match: { status: "confirmed" },
        select: "amountPaid createdAt paymentType",
      })
      .sort({ createdAt: 1 });

    console.log(`Found ${billings.length} billings for the period`);

    // Calculate summary statistics
    const summary = calculateBillingSummary(billings);

    // Group by time periods for charts
    const breakdown = getPeriodBreakdown(billings, period, start, end);

    // Get top performing data
    const topData = getTopPerformers(billings);

    return res.status(200).json({
      success: true,
      report: {
        period,
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString(),
          display: formatDateRange(period, start, end),
        },
        summary,
        breakdown,
        topPerformers: topData,
        billings: billings.map((bill) => ({
          id: bill._id,
          billingNumber: bill.billingNumber,
          createdAt: bill.createdAt,
          subTotal: bill.subTotal,
          discountAmount: bill.discountAmount,
          totalAmount: bill.totalAmount,
          amountPaid: bill.amountPaid,
          balance: bill.balance,
          status: bill.status,
          guest: bill.reservationId?.guestId
            ? {
                name: `${bill.reservationId.guestId.firstName} ${bill.reservationId.guestId.lastName}`,
                contact: bill.reservationId.guestId.contactNumber,
                email: bill.reservationId.guestId.email,
              }
            : null,
          paymentOption: bill.reservationId?.paymentOption?.name,
          receiptCount: bill.receipts?.length || 0,
        })),
        metadata: {
          totalBillingCount: billings.length,
          generatedAt: new Date().toISOString(),
          periodInDays: Math.ceil((end - start) / (1000 * 60 * 60 * 24)),
        },
      },
    });
  } catch (error) {
    console.error("Report generation error:", error);
    return res.status(500).json({
      error: "Failed to generate report",
      details: error.message,
    });
  }
};
/**
 * Calculate summary statistics from billings
 */
function calculateBillingSummary(billings) {
  const summary = {
    totalBillings: billings.length,
    totalRevenue: 0,
    totalAmountPaid: 0,
    totalBalance: 0,
    totalDiscount: 0,
    totalSubtotal: 0,
    statusBreakdown: {
      paid: 0,
      unpaid: 0,
      partial: 0,
      refunded: 0,
      voided: 0,
    },
    averageBillAmount: 0,
    conversionRate: 0,
    topDay: null,
    topDayRevenue: 0,
  };

  const dailyRevenue = {};

  billings.forEach((bill) => {
    // Revenue calculations
    summary.totalRevenue += bill.totalAmount || 0;
    summary.totalAmountPaid += bill.amountPaid || 0;
    summary.totalBalance += bill.balance || 0;
    summary.totalDiscount += bill.discountAmount || 0;
    summary.totalSubtotal += bill.subTotal || 0;

    // Status breakdown
    if (bill.status && summary.statusBreakdown[bill.status] !== undefined) {
      summary.statusBreakdown[bill.status]++;
    }

    // Daily revenue tracking
    const dateKey = bill.createdAt.toISOString().split("T")[0];
    dailyRevenue[dateKey] =
      (dailyRevenue[dateKey] || 0) + (bill.totalAmount || 0);
  });

  // Calculate averages
  if (billings.length > 0) {
    summary.averageBillAmount = summary.totalRevenue / billings.length;
    const paidBillings =
      summary.statusBreakdown.paid + summary.statusBreakdown.partial;
    summary.conversionRate = (paidBillings / billings.length) * 100;
  }

  // Find top performing day
  if (Object.keys(dailyRevenue).length > 0) {
    const [topDay, topRevenue] = Object.entries(dailyRevenue).reduce(
      (max, [day, revenue]) => (revenue > max[1] ? [day, revenue] : max),
      ["", 0],
    );
    summary.topDay = topDay;
    summary.topDayRevenue = topRevenue;
  }

  return summary;
}

/**
 * Get period breakdown for charts
 */
function getPeriodBreakdown(billings, period, start, end) {
  const breakdown = {
    labels: [],
    revenue: [],
    count: [],
    paid: [],
    unpaid: [],
  };

  switch (period) {
    case "daily":
      // Hourly breakdown for daily - use local hours
      for (let hour = 0; hour < 24; hour++) {
        // Create hour start and end in local time
        const hourStart = new Date(start);
        hourStart.setHours(hour, 0, 0, 0);
        const hourEnd = new Date(start);
        hourEnd.setHours(hour, 59, 59, 999);

        const hourBillings = billings.filter((bill) => {
          const billDate = new Date(bill.createdAt);
          return billDate >= hourStart && billDate <= hourEnd;
        });

        breakdown.labels.push(`${hour}:00`);
        breakdown.revenue.push(
          hourBillings.reduce((sum, bill) => sum + (bill.totalAmount || 0), 0),
        );
        breakdown.count.push(hourBillings.length);
        breakdown.paid.push(
          hourBillings.filter((bill) => bill.status === "paid").length,
        );
        breakdown.unpaid.push(
          hourBillings.filter((bill) => bill.status === "unpaid").length,
        );
      }
      break;

    case "weekly":
    case "custom":
      // Daily breakdown
      const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      for (let i = 0; i <= days; i++) {
        const day = new Date(start);
        day.setDate(day.getDate() + i);
        const dayStart = new Date(day);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(day);
        dayEnd.setHours(23, 59, 59, 999);

        const dayBillings = billings.filter(
          (bill) => bill.createdAt >= dayStart && bill.createdAt <= dayEnd,
        );

        breakdown.labels.push(
          day.toLocaleDateString("en-PH", { weekday: "short", day: "numeric" }),
        );
        breakdown.revenue.push(
          dayBillings.reduce((sum, bill) => sum + (bill.totalAmount || 0), 0),
        );
        breakdown.count.push(dayBillings.length);
        breakdown.paid.push(
          dayBillings.filter((bill) => bill.status === "paid").length,
        );
        breakdown.unpaid.push(
          dayBillings.filter((bill) => bill.status === "unpaid").length,
        );
      }
      break;

    case "monthly":
      // Weekly breakdown for monthly
      const weeksInMonth = Math.ceil((end.getDate() - start.getDate() + 1) / 7);
      for (let week = 1; week <= weeksInMonth; week++) {
        const weekStart = new Date(start);
        weekStart.setDate(start.getDate() + (week - 1) * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const weekBillings = billings.filter(
          (bill) => bill.createdAt >= weekStart && bill.createdAt <= weekEnd,
        );

        breakdown.labels.push(`Week ${week}`);
        breakdown.revenue.push(
          weekBillings.reduce((sum, bill) => sum + (bill.totalAmount || 0), 0),
        );
        breakdown.count.push(weekBillings.length);
        breakdown.paid.push(
          weekBillings.filter((bill) => bill.status === "paid").length,
        );
        breakdown.unpaid.push(
          weekBillings.filter((bill) => bill.status === "unpaid").length,
        );
      }
      break;

    case "yearly":
      // Monthly breakdown for yearly
      for (let month = 0; month < 12; month++) {
        const monthStart = new Date(start.getFullYear(), month, 1);
        const monthEnd = new Date(start.getFullYear(), month + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);

        const monthBillings = billings.filter(
          (bill) => bill.createdAt >= monthStart && bill.createdAt <= monthEnd,
        );

        breakdown.labels.push(
          monthStart.toLocaleDateString("en-PH", { month: "short" }),
        );
        breakdown.revenue.push(
          monthBillings.reduce((sum, bill) => sum + (bill.totalAmount || 0), 0),
        );
        breakdown.count.push(monthBillings.length);
        breakdown.paid.push(
          monthBillings.filter((bill) => bill.status === "paid").length,
        );
        breakdown.unpaid.push(
          monthBillings.filter((bill) => bill.status === "unpaid").length,
        );
      }
      break;
  }

  return breakdown;
}

/**
 * Get top performers data
 */
function getTopPerformers(billings) {
  const top = {
    highestRevenueBill: null,
    highestPaidBill: null,
    mostFrequentGuest: null,
    mostUsedPaymentOption: null,
  };

  if (billings.length === 0) return top;

  // Highest revenue bill
  top.highestRevenueBill = billings.reduce((max, bill) =>
    (bill.totalAmount || 0) > (max?.totalAmount || 0) ? bill : max,
  );

  // Highest paid bill
  top.highestPaidBill = billings.reduce((max, bill) =>
    (bill.amountPaid || 0) > (max?.amountPaid || 0) ? bill : max,
  );

  // Most frequent guest
  const guestFrequency = {};
  billings.forEach((bill) => {
    const guestId = bill.reservationId?.guestId?._id;
    if (guestId) {
      guestFrequency[guestId] = (guestFrequency[guestId] || 0) + 1;
    }
  });

  const mostFrequentGuestId = Object.entries(guestFrequency).sort(
    (a, b) => b[1] - a[1],
  )[0];

  if (mostFrequentGuestId) {
    const guestBill = billings.find(
      (bill) =>
        bill.reservationId?.guestId?._id.toString() === mostFrequentGuestId[0],
    );
    if (guestBill?.reservationId?.guestId) {
      top.mostFrequentGuest = {
        guest: guestBill.reservationId.guestId,
        billCount: mostFrequentGuestId[1],
        totalSpent: billings
          .filter(
            (bill) =>
              bill.reservationId?.guestId?._id.toString() ===
              mostFrequentGuestId[0],
          )
          .reduce((sum, bill) => sum + (bill.totalAmount || 0), 0),
      };
    }
  }

  // Most used payment option
  const paymentOptionFrequency = {};
  billings.forEach((bill) => {
    const paymentOptionId = bill.reservationId?.paymentOption?._id;
    if (paymentOptionId) {
      paymentOptionFrequency[paymentOptionId] =
        (paymentOptionFrequency[paymentOptionId] || 0) + 1;
    }
  });

  const mostUsedPaymentOptionId = Object.entries(paymentOptionFrequency).sort(
    (a, b) => b[1] - a[1],
  )[0];

  if (mostUsedPaymentOptionId) {
    const optionBill = billings.find(
      (bill) =>
        bill.reservationId?.paymentOption?._id.toString() ===
        mostUsedPaymentOptionId[0],
    );
    if (optionBill?.reservationId?.paymentOption) {
      top.mostUsedPaymentOption = {
        paymentOption: optionBill.reservationId.paymentOption,
        usageCount: mostUsedPaymentOptionId[1],
      };
    }
  }

  return top;
}

/**
 * Helper function to get date of ISO week
 */
function getDateOfISOWeek(w, y) {
  const simple = new Date(y, 0, 1 + (w - 1) * 7);
  const dow = simple.getDay();
  const ISOweekStart = simple;
  if (dow <= 4) {
    ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  } else {
    ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
  }
  return ISOweekStart;
}

/**
 * Format date range for display
 */
function formatDateRange(period, start, end) {
  switch (period) {
    case "daily":
      return start.toLocaleDateString("en-PH", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

    case "weekly":
      return `${start.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`;

    case "monthly":
      return start.toLocaleDateString("en-PH", {
        month: "long",
        year: "numeric",
      });

    case "yearly":
      return start.getFullYear().toString();

    case "custom":
      return `${start.toLocaleDateString("en-PH")} to ${end.toLocaleDateString("en-PH")}`;

    default:
      return `${start.toLocaleDateString()} to ${end.toLocaleDateString()}`;
  }
}
export const exportBillingReport = async (req, res) => {
  try {
    const { format = "json", ...queryParams } = req.query;

    // Get the report data
    const reportData = await generateReportData(queryParams);

    switch (format.toLowerCase()) {
      case "pdf":
        return generatePDFReport(reportData, res);

      case "excel":
      case "csv":
        return generateExcelReport(reportData, format, res);

      case "json":
      default:
        return res.status(200).json({
          success: true,
          format: "json",
          report: reportData,
        });
    }
  } catch (error) {
    console.error("Export error:", error);
    return res.status(500).json({
      error: "Failed to export report",
      details: error.message,
    });
  }
};

/**
 * Generate PDF Report
 */
async function generatePDFReport(reportData, res) {
  try {
    // Create a new PDF document
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      bufferPages: true,
    });

    // Set response headers for PDF
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="billing-report-${Date.now()}.pdf"`,
    );

    // Pipe PDF to response
    doc.pipe(res);

    // Add document metadata
    doc.info.Title = "Billing Report";
    doc.info.Author = "Hotel Management System";
    doc.info.CreationDate = new Date();

    // Helper functions for formatting
    const formatCurrency = (amount) =>
      `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // 1. HEADER
    doc
      .fontSize(24)
      .font("Helvetica-Bold")
      .text("BILLING REPORT", { align: "center" });

    doc.moveDown(0.5);
    doc
      .fontSize(12)
      .font("Helvetica")
      .text(`Period: ${reportData.period}`, { align: "center" });
    doc.text(`Date Range: ${reportData.dateRange.display}`, {
      align: "center",
    });
    doc.text(
      `Generated: ${new Date().toLocaleDateString("en-PH", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}`,
      { align: "center" },
    );

    doc.moveDown();

    // 2. SUMMARY SECTION
    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .text("SUMMARY", { underline: true });
    doc.moveDown(0.5);

    const summary = reportData.summary;
    const summaryY = doc.y;

    // Summary in two columns
    doc.fontSize(10).font("Helvetica");
    doc.text(`Total Billings: ${summary.totalBillings}`, 50, summaryY);
    doc.text(
      `Total Revenue: ${formatCurrency(summary.totalRevenue)}`,
      50,
      summaryY + 20,
    );
    doc.text(
      `Amount Paid: ${formatCurrency(summary.totalAmountPaid)}`,
      50,
      summaryY + 40,
    );
    doc.text(
      `Pending Balance: ${formatCurrency(summary.totalBalance)}`,
      50,
      summaryY + 60,
    );

    doc.text(
      `Total Discount: ${formatCurrency(summary.totalDiscount)}`,
      300,
      summaryY,
    );
    doc.text(
      `Average Bill: ${formatCurrency(summary.averageBillAmount)}`,
      300,
      summaryY + 20,
    );
    doc.text(
      `Conversion Rate: ${summary.conversionRate.toFixed(1)}%`,
      300,
      summaryY + 40,
    );

    doc.moveDown(4);

    // 3. STATUS BREAKDOWN
    doc
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("STATUS BREAKDOWN", { underline: true });
    doc.moveDown(0.5);

    const statusY = doc.y;
    const statusData = summary.statusBreakdown;
    let statusRowY = statusY;

    doc.fontSize(10).font("Helvetica");
    Object.entries(statusData).forEach(([status, count], index) => {
      const column = index % 2 === 0 ? 50 : 300;
      const rowOffset = Math.floor(index / 2) * 20;

      doc.text(
        `${status.charAt(0).toUpperCase() + status.slice(1)}: ${count}`,
        column,
        statusY + rowOffset,
      );
    });

    doc.moveDown(2);

    // 4. BREAKDOWN CHART DATA
    if (reportData.breakdown) {
      doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .text(`${reportData.period.toUpperCase()} BREAKDOWN`, {
          underline: true,
        });
      doc.moveDown(0.5);

      doc.fontSize(9).font("Helvetica");

      // Table headers
      const tableTop = doc.y;
      doc.text("Period", 50, tableTop);
      doc.text("Revenue", 150, tableTop);
      doc.text("Billings", 250, tableTop);
      doc.text("Paid", 350, tableTop);
      doc.text("Unpaid", 450, tableTop);

      doc
        .moveTo(50, tableTop + 15)
        .lineTo(500, tableTop + 15)
        .stroke();

      // Table rows
      let rowY = tableTop + 25;
      reportData.breakdown.labels.forEach((label, index) => {
        if (rowY > 700) {
          // Start new page if near bottom
          doc.addPage();
          rowY = 50;
        }

        doc.text(label, 50, rowY);
        doc.text(
          formatCurrency(reportData.breakdown.revenue[index]),
          150,
          rowY,
        );
        doc.text(reportData.breakdown.count[index].toString(), 250, rowY);
        doc.text(reportData.breakdown.paid[index].toString(), 350, rowY);
        doc.text(reportData.breakdown.unpaid[index].toString(), 450, rowY);

        rowY += 20;
      });

      doc.moveDown();
    }

    // 5. TOP PERFORMERS
    doc
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("TOP PERFORMERS", { underline: true });
    doc.moveDown(0.5);

    const top = reportData.topPerformers;
    doc.fontSize(10).font("Helvetica");

    if (top.highestRevenueBill) {
      doc.text(
        `Highest Revenue Bill: ${formatCurrency(top.highestRevenueBill.totalAmount || 0)}`,
        50,
        doc.y,
      );
      doc.moveDown(0.5);
    }

    if (top.highestPaidBill) {
      doc.text(
        `Highest Paid Bill: ${formatCurrency(top.highestPaidBill.amountPaid || 0)}`,
        50,
        doc.y,
      );
      doc.moveDown(0.5);
    }

    if (top.mostFrequentGuest) {
      doc.text(
        `Most Frequent Guest: ${top.mostFrequentGuest.guest.firstName} ${top.mostFrequentGuest.guest.lastName}`,
        50,
        doc.y,
      );
      doc.text(
        `Bill Count: ${top.mostFrequentGuest.billCount} | Total Spent: ${formatCurrency(top.mostFrequentGuest.totalSpent)}`,
        50,
        doc.y + 15,
      );
      doc.moveDown(1);
    }

    // 6. FOOTER
    const totalPages = doc.bufferedPageRange().count;

    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);

      // Page number
      doc
        .fontSize(8)
        .font("Helvetica")
        .text(`Page ${i + 1} of ${totalPages}`, 50, doc.page.height - 50, {
          align: "center",
          width: doc.page.width - 100,
        });

      // Footer text
      doc.text(
        `Confidential - Hotel Management System Billing Report`,
        50,
        doc.page.height - 30,
        { align: "center", width: doc.page.width - 100 },
      );
    }

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error("PDF generation error:", error);
    throw error;
  }
}

/**
 * Generate Excel/CSV Report
 */
async function generateExcelReport(reportData, format, res) {
  try {
    // For CSV format
    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="billing-report-${Date.now()}.csv"`,
      );

      // Create CSV content
      let csvContent = "Billing Report\n";
      csvContent += `Period,${reportData.period}\n`;
      csvContent += `Date Range,${reportData.dateRange.display}\n`;
      csvContent += `Generated,${formatDate(new Date().toISOString())}\n\n`;

      // Summary section
      csvContent += "SUMMARY\n";
      const summary = reportData.summary;
      csvContent += `Total Billings,${summary.totalBillings}\n`;
      csvContent += `Total Revenue,${summary.totalRevenue}\n`;
      csvContent += `Amount Paid,${summary.totalAmountPaid}\n`;
      csvContent += `Pending Balance,${summary.totalBalance}\n`;
      csvContent += `Total Discount,${summary.totalDiscount}\n`;
      csvContent += `Average Bill Amount,${summary.averageBillAmount}\n`;
      csvContent += `Conversion Rate,${summary.conversionRate}\n\n`;

      // Status breakdown
      csvContent += "STATUS BREAKDOWN\n";
      Object.entries(summary.statusBreakdown).forEach(([status, count]) => {
        csvContent += `${status},${count}\n`;
      });

      csvContent += "\n";

      // Detailed billings
      csvContent += "DETAILED BILLINGS\n";
      csvContent +=
        "Billing Number,Date,Subtotal,Discount,Total,Paid,Balance,Status,Guest Name\n";

      reportData.billings.forEach((billing) => {
        csvContent += `"${billing.billingNumber}",`;
        csvContent += `"${new Date(billing.createdAt).toLocaleDateString()}",`;
        csvContent += `${billing.subTotal},`;
        csvContent += `${billing.discountAmount},`;
        csvContent += `${billing.totalAmount},`;
        csvContent += `${billing.amountPaid},`;
        csvContent += `${billing.balance},`;
        csvContent += `${billing.status},`;
        csvContent += `"${billing.guest?.name || "N/A"}"\n`;
      });

      return res.send(csvContent);
    }

    // For Excel format (you can implement with exceljs library)
    // This is a basic implementation - consider using exceljs for better Excel support
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="billing-report-${Date.now()}.xlsx"`,
    );

    // Return a simple message - implement excel generation with exceljs
    return res.status(200).json({
      success: true,
      message:
        "Excel export requires exceljs library. Currently returning CSV data.",
      report: reportData,
    });
  } catch (error) {
    console.error("Excel/CSV generation error:", error);
    throw error;
  }
}
function formatDate(dateString) {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Invalid Date";
    return date.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch (error) {
    return "Invalid Date";
  }
}
/**
 * Generate report data (reused from generateBillingReport)
 */
async function generateReportData(queryParams) {
  const {
    period = "daily",
    startDate,
    endDate,
    date,
    month,
    year,
    week,
  } = queryParams;

  let start, end;

  // Calculate date range based on period
  switch (period) {
    case "daily":
      start = date ? new Date(date) : new Date();
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setHours(23, 59, 59, 999);
      break;

    case "weekly":
      const currentDate = new Date();
      if (week && year) {
        start = getDateOfISOWeek(parseInt(week), parseInt(year));
      } else {
        start = new Date(currentDate);
        start.setDate(start.getDate() - start.getDay());
      }
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;

    case "monthly":
      if (month) {
        const [yearPart, monthPart] = month.split("-");
        start = new Date(parseInt(yearPart), parseInt(monthPart) - 1, 1);
      } else {
        start = new Date();
        start.setDate(1);
      }
      start.setHours(0, 0, 0, 0);
      end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      break;

    case "yearly":
      const reportYear = year ? parseInt(year) : new Date().getFullYear();
      start = new Date(reportYear, 0, 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(reportYear, 11, 31);
      end.setHours(23, 59, 59, 999);
      break;

    case "custom":
      if (!startDate || !endDate) {
        throw new Error("startDate and endDate are required for custom period");
      }
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      break;

    default:
      throw new Error(
        "Invalid period. Use: daily, weekly, monthly, yearly, custom",
      );
  }

  // Fetch billings within date range
  const billings = await Billing.find({
    createdAt: { $gte: start, $lte: end },
  })
    .populate({
      path: "reservationId",
      populate: [
        {
          path: "guestId",
          model: "Guest",
          select: "firstName lastName contactNumber email",
        },
        {
          path: "paymentOption",
          model: "PaymentOption",
          select: "name paymentType amount",
        },
      ],
    })
    .populate({
      path: "receipts",
      match: { status: "confirmed" },
      select: "amountPaid createdAt paymentType",
    })
    .sort({ createdAt: 1 });

  // Calculate summary statistics
  const summary = calculateBillingSummary(billings);

  // Group by time periods for charts
  const breakdown = getPeriodBreakdown(billings, period, start, end);

  // Get top performing data
  const topData = getTopPerformers(billings);

  return {
    period,
    dateRange: {
      start: start.toISOString(),
      end: end.toISOString(),
      display: formatDateRange(period, start, end),
    },
    summary,
    breakdown,
    topPerformers: topData,
    billings: billings.map((bill) => ({
      id: bill._id,
      billingNumber: bill.billingNumber,
      createdAt: bill.createdAt,
      subTotal: bill.subTotal,
      discountAmount: bill.discountAmount,
      totalAmount: bill.totalAmount,
      amountPaid: bill.amountPaid,
      balance: bill.balance,
      status: bill.status,
      guest: bill.reservationId?.guestId
        ? {
            name: `${bill.reservationId.guestId.firstName} ${bill.reservationId.guestId.lastName}`,
            contact: bill.reservationId.guestId.contactNumber,
            email: bill.reservationId.guestId.email,
          }
        : null,
      paymentOption: bill.reservationId?.paymentOption?.name,
      receiptCount: bill.receipts?.length || 0,
    })),
    metadata: {
      totalBillingCount: billings.length,
      generatedAt: new Date().toISOString(),
      periodInDays: Math.ceil((end - start) / (1000 * 60 * 60 * 24)),
    },
  };
}
export const processRefund = async (req, res) => {
  try {
    const { billingId } = req.params;
    const { refundAmount, reason } = req.body;

    if (!billingId) {
      return res.status(400).json({ error: "Billing ID is required" });
    }

    const billing = await Billing.findById(billingId)
      .populate("reservationId")
      .populate("receipts");

    if (!billing) {
      return res.status(404).json({ error: "Billing not found" });
    }

    // Check if billing is already refunded
    if (billing.status === "refunded") {
      return res
        .status(400)
        .json({ error: "This billing has already been refunded" });
    }

    // Check if there's any payment to refund
    if (billing.amountPaid <= 0) {
      return res
        .status(400)
        .json({ error: "No payment has been made to refund" });
    }

    // Calculate refund amount (50% of amount paid)
    const calculatedRefundAmount = refundAmount || billing.amountPaid * 0.5;

    if (calculatedRefundAmount > billing.amountPaid) {
      return res
        .status(400)
        .json({ error: "Refund amount cannot exceed amount paid" });
    }

    // Store the refund amount before updating
    const refundedAmount = calculatedRefundAmount;
    const previousAmountPaid = billing.amountPaid;

    // Update billing status to refunded
    billing.status = "refunded";
    billing.refundAmount = refundedAmount;
    billing.refundedAt = new Date();
    billing.refundReason = reason || "Refund processed by admin";

    // Update amount paid and balance
    const newAmountPaid = previousAmountPaid - refundedAmount;
    billing.amountPaid = Math.max(0, newAmountPaid);
    billing.balance = billing.totalAmount - billing.amountPaid;

    // Set isRefundable to false since it's now refunded
    billing.isRefundable = false;

    await billing.save();

    return res.status(200).json({
      success: true,
      message: `Refund of ${formatMoney(refundedAmount)} processed successfully`,
      refund: {
        amount: refundedAmount,
        refundedAt: billing.refundedAt,
        previousAmountPaid,
        remainingBalance: billing.balance,
        amountPaid: billing.amountPaid,
      },
      billing,
    });
  } catch (error) {
    console.error("Refund processing error:", error);
    return res.status(500).json({ error: error.message });
  }
};
