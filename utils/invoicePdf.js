import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";
import mongoose from "mongoose";
import Billing from "../models/Billing.js";
import Receipt from "../models/Receipt.js";
import ReservationModels from "../models/Reservation.js";
import {
  getHourlyRate,
  getRoomStayCharge,
  stayTypeLabel,
} from "./stayPricing.js";

const { Reservation, ReservationRoom } = ReservationModels;

// Helvetica (WinAnsi) cannot encode ₱ (U+20B1); PDFKit substitutes ±.
// Noto Sans is SIL OFL 1.1: https://github.com/googlefonts/noto-fonts
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_REGULAR = path.join(__dirname, "..", "fonts", "NotoSans-Regular.ttf");
const FONT_BOLD = path.join(__dirname, "..", "fonts", "NotoSans-Bold.ttf");
const FONT = "InvoiceSans";
const FONT_BOLD_NAME = "InvoiceSans-Bold";

function registerInvoiceFonts(doc) {
  if (!fs.existsSync(FONT_REGULAR) || !fs.existsSync(FONT_BOLD)) {
    const err = new Error(
      "Invoice fonts missing. Expected NotoSans-Regular.ttf and NotoSans-Bold.ttf in fonts/",
    );
    err.status = 500;
    throw err;
  }
  doc.registerFont(FONT, FONT_REGULAR);
  doc.registerFont(FONT_BOLD_NAME, FONT_BOLD);
}

const formatMoney = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);

const formatDate = (value) => {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const formatDateTime = (value) => {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

function paymentPlanLabel(paymentOption) {
  if (!paymentOption) return "N/A";
  const name = paymentOption.name || "Payment plan";
  if (paymentOption.paymentType === "full") return `${name} (Full payment)`;
  if (paymentOption.paymentType === "partial" && paymentOption.amount != null) {
    return `${name} (Partial ${paymentOption.amount}% advance)`;
  }
  if (paymentOption.paymentType === "partial") return `${name} (Partial)`;
  return name;
}

function receiptStatusLabel(status) {
  if (status === "confirmed") return "Confirmed";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

function collectLineItems(reservation, reservationRooms) {
  const items = [];
  const hourly = reservation?.stayType === "hourly";
  const nights = Math.max(1, Number(reservation?.nights) || 1);
  const hours = Number(reservation?.hourlyDuration) || 0;

  (reservationRooms || []).forEach((resRoom) => {
    const room = resRoom.roomId;
    const roomNumber = room?.roomNumber || "N/A";
    const roomTypeName = room?.roomType?.name || "Room";
    const kind = room?.category === "cottage" ? "Cottage" : "Room";
    const stayCharge = getRoomStayCharge(room, reservation);

    if (hourly) {
      items.push({
        description: `${kind} ${roomNumber} (${roomTypeName}) — ${hours} hrs`,
        quantity: 1,
        rate: getHourlyRate(room, hours) || stayCharge,
        subtotal: stayCharge,
      });
    } else {
      items.push({
        description: `${kind} ${roomNumber} (${roomTypeName}) — ${nights} night(s)`,
        quantity: nights,
        rate: Number(room?.rate) || 0,
        subtotal: stayCharge,
      });
    }

    (resRoom.addOns || []).forEach((addOn) => {
      const doc = addOn.addOnId;
      if (!doc) return;
      const qty = Math.max(1, Number(addOn.quantity) || 1);
      const rate = Number(doc.rate) || 0;
      items.push({
        description: `${doc.name || "Add-on"} (Room ${roomNumber})`,
        quantity: qty,
        rate,
        subtotal: rate * qty,
      });
    });
  });

  return items;
}

function drawMetaTable(doc, y, pairs, pageWidth, margin) {
  const colW = (pageWidth - margin * 2) / pairs.length;
  const headerH = 20;
  const valueH = 22;
  let x = margin;

  pairs.forEach((pair) => {
    doc.save();
    doc.rect(x, y, colW, headerH).fillAndStroke("#f3f4f6", "#d1d5db");
    doc.restore();
    doc
      .font("InvoiceSans-Bold")
      .fontSize(8)
      .fillColor("#374151")
      .text(pair.label, x + 6, y + 6, { width: colW - 12 });
    x += colW;
  });

  x = margin;
  pairs.forEach((pair) => {
    doc.save();
    doc.rect(x, y + headerH, colW, valueH).stroke("#d1d5db");
    doc.restore();
    doc
      .font("InvoiceSans")
      .fontSize(9)
      .fillColor("#111827")
      .text(pair.value || "—", x + 6, y + headerH + 6, { width: colW - 12 });
    x += colW;
  });

  return y + headerH + valueH;
}

function drawLineTable(doc, startY, items, pageWidth, margin) {
  const tableW = pageWidth - margin * 2;
  const cols = [
    { key: "description", label: "Service Description", width: tableW * 0.5, align: "left" },
    { key: "quantity", label: "Quantity", width: tableW * 0.12, align: "center" },
    { key: "rate", label: "Rate (PHP)", width: tableW * 0.19, align: "right" },
    { key: "subtotal", label: "Subtotal (PHP)", width: tableW * 0.19, align: "right" },
  ];
  const headerH = 20;
  let y = startY;

  const ensureSpace = (needed) => {
    if (y + needed < doc.page.height - 70) return;
    doc.addPage();
    y = margin;
  };

  const drawHeader = () => {
    let x = margin;
    cols.forEach((col) => {
      doc.save();
      doc.rect(x, y, col.width, headerH).fillAndStroke("#f3f4f6", "#d1d5db");
      doc.restore();
      doc
        .font("InvoiceSans-Bold")
        .fontSize(8)
        .fillColor("#374151")
        .text(col.label, x + 4, y + 6, {
          width: col.width - 8,
          align: col.align,
        });
      x += col.width;
    });
    y += headerH;
  };

  drawHeader();

  if (!items.length) {
    ensureSpace(24);
    doc.save();
    doc.rect(margin, y, tableW, 22).stroke("#d1d5db");
    doc.restore();
    doc
      .font("InvoiceSans")
      .fontSize(9)
      .fillColor("#6b7280")
      .text("No line items", margin + 6, y + 6, { width: tableW - 12 });
    y += 22;
    return y;
  }

  items.forEach((item) => {
    doc.font("InvoiceSans").fontSize(8);
    const descH = doc.heightOfString(item.description, {
      width: cols[0].width - 8,
    });
    const rowH = Math.max(20, descH + 10);
    ensureSpace(rowH + 4);
    let x = margin;
    const values = [
      item.description,
      String(item.quantity),
      formatMoney(item.rate),
      formatMoney(item.subtotal),
    ];
    cols.forEach((col, i) => {
      doc.save();
      doc.rect(x, y, col.width, rowH).stroke("#d1d5db");
      doc.restore();
      doc
        .font("InvoiceSans")
        .fontSize(8)
        .fillColor("#111827")
        .text(values[i], x + 4, y + 5, {
          width: col.width - 8,
          align: col.align,
        });
      x += col.width;
    });
    y += rowH;
  });

  return y;
}

function drawReceiptsTable(doc, startY, receipts, pageWidth, margin) {
  const tableW = pageWidth - margin * 2;
  const cols = [
    { label: "Date", width: tableW * 0.18, align: "left" },
    { label: "Payment Method", width: tableW * 0.16, align: "left" },
    { label: "Reference", width: tableW * 0.16, align: "left" },
    { label: "Status", width: tableW * 0.1, align: "center" },
    { label: "Amount Paid", width: tableW * 0.14, align: "right" },
    { label: "Received", width: tableW * 0.13, align: "right" },
    { label: "Change", width: tableW * 0.13, align: "right" },
  ];
  const headerH = 20;
  let y = startY;

  const ensureSpace = (needed) => {
    if (y + needed < doc.page.height - 70) return;
    doc.addPage();
    y = margin;
    drawHeader();
  };

  const drawHeader = () => {
    let x = margin;
    cols.forEach((col) => {
      doc.save();
      doc.rect(x, y, col.width, headerH).fillAndStroke("#f3f4f6", "#d1d5db");
      doc.restore();
      doc
        .font("InvoiceSans-Bold")
        .fontSize(7)
        .fillColor("#374151")
        .text(col.label, x + 3, y + 6, {
          width: col.width - 6,
          align: col.align,
        });
      x += col.width;
    });
    y += headerH;
  };

  drawHeader();

  if (!receipts.length) {
    ensureSpace(24);
    doc.save();
    doc.rect(margin, y, tableW, 22).stroke("#d1d5db");
    doc.restore();
    doc
      .font("InvoiceSans")
      .fontSize(9)
      .fillColor("#6b7280")
      .text("No receipts recorded", margin + 6, y + 6, { width: tableW - 12 });
    y += 22;
    return y;
  }

  receipts.forEach((receipt) => {
    const values = [
      formatDateTime(receipt.createdAt),
      receipt.paymentType?.name || "Payment",
      receipt.referenceNumber || "—",
      receiptStatusLabel(receipt.status),
      formatMoney(receipt.amountPaid),
      formatMoney(receipt.amountReceived ?? receipt.amountPaid),
      formatMoney(receipt.change || 0),
    ];
    const notes = String(receipt.notes || "").trim();

    doc.font("InvoiceSans").fontSize(7);
    let rowH = 20;
    values.forEach((value, i) => {
      const h = doc.heightOfString(String(value), { width: cols[i].width - 6 });
      rowH = Math.max(rowH, h + 10);
    });
    const notesH = notes
      ? doc.heightOfString(`Notes: ${notes}`, { width: tableW - 12 }) + 8
      : 0;

    ensureSpace(rowH + notesH + 4);

    let x = margin;
    cols.forEach((col, i) => {
      doc.save();
      doc.rect(x, y, col.width, rowH).stroke("#d1d5db");
      doc.restore();
      doc
        .font("InvoiceSans")
        .fontSize(7)
        .fillColor("#111827")
        .text(values[i], x + 3, y + 5, {
          width: col.width - 6,
          align: col.align,
        });
      x += col.width;
    });
    y += rowH;

    if (notes) {
      doc.save();
      doc.rect(margin, y, tableW, notesH).stroke("#d1d5db");
      doc.restore();
      doc
        .font("InvoiceSans")
        .fontSize(7)
        .fillColor("#4b5563")
        .text(`Notes: ${notes}`, margin + 6, y + 3, { width: tableW - 12 });
      y += notesH;
    }
  });

  return y;
}

function drawTotals(doc, y, billing, pageWidth, margin) {
  const boxW = 240;
  const x = pageWidth - margin - boxW;
  const rows = [
    ["Subtotal", formatMoney(billing.subTotal)],
    ["Discount", `-${formatMoney(billing.discountAmount)}`],
    ["VAT", "Exempt (₱0.00)"],
    ["Total Amount", formatMoney(billing.totalAmount)],
    ["Amount due now (advance)", formatMoney(billing.amountDueNow)],
    ["Amount paid", formatMoney(billing.amountPaid)],
    ["Balance (Need to pay)", formatMoney(billing.balance)],
  ];

  rows.forEach((row, i) => {
    const bold = i === 3 || i === 6;
    doc
      .font(bold ? FONT_BOLD_NAME : FONT)
      .fontSize(9)
      .fillColor("#111827")
      .text(row[0], x, y, { width: 140 })
      .text(row[1], x + 140, y, { width: 100, align: "right" });
    y += 16;
  });

  if (billing.isComplimentary || billing.status === "free") {
    y += 4;
    doc
      .font("InvoiceSans-Bold")
      .fontSize(9)
      .fillColor("#6d28d9")
      .text("Complimentary / Free reservation", x, y, { width: boxW });
    y += 16;
  }

  return y;
}

async function loadInvoiceData(billingId) {
  if (!mongoose.isValidObjectId(billingId)) {
    const err = new Error("Invalid billingId");
    err.status = 400;
    throw err;
  }

  const billing = await Billing.findById(billingId);
  if (!billing) {
    const err = new Error("Billing not found");
    err.status = 404;
    throw err;
  }

  const reservation = await Reservation.findById(billing.reservationId)
    .populate("guestId")
    .populate("paymentOption");
  if (!reservation) {
    const err = new Error("Reservation not found");
    err.status = 404;
    throw err;
  }

  const reservationRooms = await ReservationRoom.find({
    reservationId: reservation._id,
  })
    .populate({
      path: "roomId",
      populate: { path: "roomType" },
    })
    .populate("addOns.addOnId");

  const receipts = await Receipt.find({ billingId: billing._id })
    .populate("paymentType")
    .sort({ createdAt: 1 })
    .lean();

  const guest = reservation.guestId || {};
  const guestName =
    `${guest.firstName || ""} ${guest.lastName || ""}`.trim() || "Guest";
  const billingNumber = billing.billingNumber || `INV-${String(billing._id).slice(-6)}`;
  const filename = `invoice-${billingNumber}.pdf`;

  return {
    billing,
    reservation,
    reservationRooms,
    guest,
    guestName,
    guestEmail: guest.email || "",
    billingNumber,
    filename,
    lineItems: collectLineItems(reservation, reservationRooms),
    receipts,
  };
}

function drawInvoice(doc, data) {
  const {
    billing,
    reservation,
    guest,
    guestName,
    billingNumber,
    lineItems,
    receipts,
  } = data;
  const margin = 50;
  const pageWidth = doc.page.width;

  doc
    .font("InvoiceSans-Bold")
    .fontSize(20)
    .fillColor("#111827")
    .text("Hotel Payment Invoice", margin, 40, {
      width: pageWidth - margin * 2,
      align: "center",
    });
  doc
    .font("InvoiceSans")
    .fontSize(11)
    .fillColor("#4b5563")
    .text("SUVA'S PLACE RESORT", margin, 66, {
      width: pageWidth - margin * 2,
      align: "center",
    });

  let y = 96;
  y =
    drawMetaTable(
      doc,
      y,
      [
        { label: "Invoice ID", value: billingNumber },
        { label: "Date Issued", value: formatDate(billing.createdAt) },
      ],
      pageWidth,
      margin,
    ) + 10;

  y =
    drawMetaTable(
      doc,
      y,
      [
        { label: "Guest Name", value: guestName },
        { label: "Contact Details", value: guest.contactNumber || "—" },
        { label: "Email", value: guest.email || "—" },
      ],
      pageWidth,
      margin,
    ) + 12;

  doc
    .font("InvoiceSans-Bold")
    .fontSize(10)
    .fillColor("#111827")
    .text("Stay Details", margin, y);
  y += 16;
  doc.font("InvoiceSans").fontSize(9).fillColor("#374151");
  doc.text(
    `Reservation #: ${reservation.reservationNumber || "N/A"}`,
    margin,
    y,
  );
  y += 13;
  doc.text(`Stay type: ${stayTypeLabel(reservation)}`, margin, y);
  y += 13;
  doc.text(
    `Check-in: ${formatDateTime(reservation.checkIn)}`,
    margin,
    y,
  );
  y += 13;
  doc.text(
    `Check-out: ${formatDateTime(reservation.checkOut)}`,
    margin,
    y,
  );
  y += 22;

  doc
    .font("InvoiceSans-Bold")
    .fontSize(10)
    .fillColor("#111827")
    .text("Charges", margin, y);
  y += 14;
  y = drawLineTable(doc, y, lineItems, pageWidth, margin) + 14;
  y = drawTotals(doc, y, billing, pageWidth, margin) + 18;

  if (y > doc.page.height - 200) {
    doc.addPage();
    y = margin;
  }

  doc
    .font("InvoiceSans-Bold")
    .fontSize(10)
    .fillColor("#111827")
    .text("Payment Details", margin, y);
  y += 16;
  doc.font("InvoiceSans").fontSize(9).fillColor("#374151");
  doc.text(
    `Payment plan: ${paymentPlanLabel(reservation.paymentOption)}`,
    margin,
    y,
    { width: pageWidth - margin * 2 },
  );
  y += 13;
  doc.text(
    `Amount due now (advance): ${formatMoney(billing.amountDueNow)}`,
    margin,
    y,
  );
  y += 13;
  if (reservation.status === "pending" && reservation.expiresAt) {
    doc.text(`Payment due by: ${formatDateTime(reservation.expiresAt)}`, margin, y);
    y += 13;
  }
  doc.text(
    `Billing status: ${String(billing.status || "unpaid").replace("_", " ").toUpperCase()}`,
    margin,
    y,
  );
  y += 18;
  y = drawReceiptsTable(doc, y, receipts || [], pageWidth, margin) + 22;

  if (y > doc.page.height - 120) {
    doc.addPage();
    y = margin;
  }

  doc
    .font("InvoiceSans-Bold")
    .fontSize(10)
    .fillColor("#111827")
    .text("Terms and Conditions", margin, y);
  y += 16;
  doc.font("InvoiceSans").fontSize(8).fillColor("#4b5563");
  doc.text(
    "All billing amounts are VAT-exempt (Non-VAT). Settle the amount due in advance according to your payment plan. Remaining balance is payable per resort policy. Late or missing payment may affect confirmation of your stay.",
    margin,
    y,
    { width: pageWidth - margin * 2, lineGap: 2 },
  );
  y += 36;
  doc.text(
    "For any questions, please contact Suva's Place Resort at suvasplaceinc@gmail.com or +63 976023356.",
    margin,
    y,
    { width: pageWidth - margin * 2 },
  );
  y += 28;
  doc
    .fontSize(8)
    .fillColor("#9ca3af")
    .text(`Invoice generated on ${new Date().toLocaleString("en-PH")}`, margin, y, {
      width: pageWidth - margin * 2,
      align: "center",
    });
}

export async function buildInvoicePdfBuffer(billingId) {
  const data = await loadInvoiceData(billingId);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      registerInvoiceFonts(doc);
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => {
        resolve({
          buffer: Buffer.concat(chunks),
          filename: data.filename,
          billingNumber: data.billingNumber,
          guestEmail: data.guestEmail,
          guestName: data.guestName,
          reservationNumber: data.reservation.reservationNumber,
        });
      });
      doc.on("error", reject);
      drawInvoice(doc, data);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
