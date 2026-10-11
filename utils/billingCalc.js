// utils/billingCalc.js
import { getRoomStayCharge } from "./stayPricing.js";

// Single source of truth for billing totals (subtotal, discount, status, refundability).
// Extracted so reservationRoomController's recalculation path and billingController's
// updateBillingCalc can't silently diverge again (see WT-02).
export function computeBillingTotals({
  billing,
  reservation,
  reservationRooms,
  discount,
  discountImg,
  receipts,
  paymentOption,
}) {
  const nights =
    reservation.stayType === "hourly"
      ? 0
      : Math.max(1, Number(reservation.nights) || 1);

  const receiptPaid = (receipts || []).reduce(
    (sum, r) => (r.status === "confirmed" ? sum + r.amountPaid : sum),
    0,
  );
  const amountPaid = billing?.refundedAt
    ? Number(billing.amountPaid || 0)
    : receiptPaid;

  let subTotal = 0;
  const reservationRoomsTotal = (reservationRooms || []).map((room) => {
    const r = typeof room.toObject === "function" ? room.toObject() : room;
    const roomRateTotal = getRoomStayCharge(r.roomId, reservation);
    const addOnsTotal = (r.addOns || []).reduce(
      (sum, a) => sum + a.quantity * (a.addOnId?.rate || 0),
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

  let discountAmount = 0;
  const percent = discount?.discountPercent || 0;

  if (discount && (percent > 0 || discount.isPerId)) {
    const resDiscountIdStr = reservation.discountId
      ? String(reservation.discountId)
      : "";
    const confirmedImgs = (discountImg || []).filter(
      (img) => img.status === "confirmed",
    );
    const confirmedForSelectedDiscount = resDiscountIdStr
      ? confirmedImgs.filter(
          (img) =>
            img.discountId && String(img.discountId) === resDiscountIdStr,
        )
      : [];
    const totalPax = Math.max(
      1,
      Number(reservation.adults || 0) + Number(reservation.children || 0),
    );
    const declaredEligible = Math.min(
      Math.max(
        0,
        Number(reservation.seniorCitizenCount || 0) +
          Number(reservation.pwdCount || 0),
      ),
      totalPax,
    );
    const maxByDiscount =
      discount.maxRoomCount != null
        ? Math.min(declaredEligible, discount.maxRoomCount)
        : declaredEligible;
    const validIdCount = Math.min(
      maxByDiscount,
      confirmedForSelectedDiscount.length,
    );

    if (discount.isPerId) {
      // (base price / pax) × discount% × min(declared senior+pwd, confirmed IDs, caps)
      const ratePct = Number(discount.discountPercent || 20) / 100;
      const basePerPax = subTotal / totalPax;
      discountAmount = basePerPax * ratePct * validIdCount;
    } else if (discount.appliesToAllRooms) {
      discountAmount = subTotal * (percent / 100);
    } else if (reservationRoomsTotal.length) {
      const sortedRooms = [...reservationRoomsTotal].sort((a, b) =>
        discount.discountPriority === "lowest"
          ? a.totalAmount - b.totalAmount
          : b.totalAmount - a.totalAmount,
      );

      discountAmount = sortedRooms[0].totalAmount * (percent / 100);
    }
  }

  discountAmount = Math.min(discountAmount, subTotal);
  const totalAmount = subTotal - discountAmount;

  const amountDueNow =
    paymentOption?.paymentType === "full" || !paymentOption
      ? totalAmount
      : totalAmount * (paymentOption.amount / 100);

  let status = "unpaid";
  let isRefundable = false;

  if (amountPaid > 0) {
    if (!paymentOption || paymentOption.paymentType === "full") {
      if (amountPaid >= totalAmount) {
        status = "paid";
        isRefundable = true;
      } else {
        status = "partial";
        isRefundable = true;
      }
    } else if (paymentOption.paymentType === "partial") {
      if (amountPaid >= amountDueNow) {
        status = "partial";
        isRefundable = true;
      } else if (amountPaid > 0 && amountPaid < amountDueNow) {
        status = "partial";
        isRefundable = true;
      }
    }
  } else {
    status = "unpaid";
    isRefundable = false;
  }

  if (billing?.refundedAt) {
    isRefundable = false;
  }

  const refundAmount = amountPaid * 0.5;
  const balance = Math.max(totalAmount - amountPaid, 0);

  return {
    nights,
    subTotal,
    discountAmount,
    totalAmount,
    amountPaid,
    amountDueNow,
    balance,
    status,
    isRefundable,
    refundAmount,
    reservationRoomsTotal,
  };
}
