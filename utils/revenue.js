import Billing from "../models/Billing.js";
import Receipt from "../models/Receipt.js";

// Refunded billings in range: prefer refundedAt (actual refund time), fall
// back to updatedAt for legacy data.
export const refundedBillingFilter = (start, end) => ({
  status: "refunded",
  $expr: {
    $and: [
      { $gte: [{ $ifNull: ["$refundedAt", "$updatedAt"] }, start] },
      { $lte: [{ $ifNull: ["$refundedAt", "$updatedAt"] }, end] },
    ],
  },
});

/**
 * Revenue as dated cash movements: +confirmed receipts on the day they were
 * received, -refunds on the day they were processed. Refunds follow resort
 * policy (often partial), so only billing.refundAmount is taken back — the
 * retained portion stays counted. Shared by the Dashboard, the Revenue
 * Report and its export so they always agree.
 */
export async function getRevenueEvents(start, end) {
  const [receipts, refunds] = await Promise.all([
    Receipt.find({
      createdAt: { $gte: start, $lte: end },
      status: "confirmed",
    })
      .select("amountPaid createdAt")
      .lean(),
    Billing.find(refundedBillingFilter(start, end))
      .select("refundAmount refundedAt updatedAt")
      .lean(),
  ]);

  return [
    ...receipts.map((r) => ({ at: new Date(r.createdAt), amount: r.amountPaid || 0 })),
    ...refunds.map((b) => ({
      at: new Date(b.refundedAt || b.updatedAt),
      amount: -(b.refundAmount || 0),
    })),
  ];
}

export function sumRevenue(events, from = null, to = null) {
  return events.reduce((sum, e) => {
    if (from && e.at < from) return sum;
    if (to && e.at > to) return sum;
    return sum + e.amount;
  }, 0);
}

export function revenueTotals(events) {
  return events.reduce(
    (acc, e) => {
      if (e.amount >= 0) acc.collected += e.amount;
      else acc.refunded += -e.amount;
      acc.net += e.amount;
      return acc;
    },
    { collected: 0, refunded: 0, net: 0 },
  );
}
