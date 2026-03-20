// jobs/cancelExpiredPendings.js
import Reservation from "../models/Reservation.js"; // adjust path

export async function cancelExpiredPendings() {
  const now = new Date();

  const result = await Reservation.updateMany(
    {
      status: "pending",
      expiresAt: { $ne: null, $lte: now },
    },
    {
      $set: {
        status: "cancelled",
        expiresAt: null,
      },
    }
  );

  return {
    matched: result.matchedCount ?? result.n, // fallback for older mongoose
    modified: result.modifiedCount ?? result.nModified,
  };
}
