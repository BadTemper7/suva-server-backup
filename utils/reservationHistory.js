// utils/reservationHistory.js
import ReservationHistory from "../models/ReservationHistory.js";

// Single write path so every call site logs the same shape consistently.
// Always append-only - never update or delete an entry once written.
export async function logReservationHistory({
  reservationId,
  actorUserId = null,
  actorLabel,
  action,
  summary,
  changes = null,
  session,
}) {
  const doc = {
    reservationId,
    actorUserId,
    actorLabel: actorLabel || (actorUserId ? "Staff" : "System"),
    action,
    summary,
    changes,
  };

  if (session) {
    await ReservationHistory.create([doc], { session });
  } else {
    await ReservationHistory.create(doc);
  }
}
