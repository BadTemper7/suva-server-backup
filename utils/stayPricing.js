export const HOURLY_DURATIONS = [3, 6, 12];
export const HOURLY_RATE_KEYS = {
  3: "hours3",
  6: "hours6",
  12: "hours12",
};

export function parseHourlyDuration(value) {
  const n = Number(value);
  return HOURLY_DURATIONS.includes(n) ? n : null;
}

export function calcNights(checkIn, checkOut) {
  const inDate = new Date(checkIn);
  const outDate = new Date(checkOut);
  if (Number.isNaN(inDate.getTime()) || Number.isNaN(outDate.getTime())) {
    return 0;
  }
  const diffDays = (outDate - inDate) / (1000 * 60 * 60 * 24);
  return Math.ceil(diffDays);
}

function parseNonNegativeRate(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function getHourlyRate(room, durationHours) {
  const key = HOURLY_RATE_KEYS[durationHours];
  if (!key || !room) return 0;
  const rates = room.hourlyRates || {};
  return Math.max(0, Number(rates[key] || 0));
}

export function roomOffersHourlyPackage(room, durationHours) {
  return getHourlyRate(room, durationHours) > 0;
}

export function resolveStay({
  stayType,
  hourlyDuration,
  checkIn,
  checkOut,
} = {}) {
  const type = stayType === "hourly" ? "hourly" : "overnight";
  const inDate = new Date(checkIn);
  if (Number.isNaN(inDate.getTime())) {
    return { error: "Invalid check-in" };
  }

  if (type === "hourly") {
    const duration = parseHourlyDuration(hourlyDuration);
    if (!duration) {
      return { error: "Hourly duration must be 3, 6, or 12 hours" };
    }
    const outDate = new Date(inDate.getTime() + duration * 60 * 60 * 1000);
    return {
      stayType: "hourly",
      hourlyDuration: duration,
      checkIn: inDate,
      checkOut: outDate,
      nights: 0,
    };
  }

  const outDate = new Date(checkOut);
  if (Number.isNaN(outDate.getTime()) || outDate <= inDate) {
    return { error: "Invalid checkIn/checkOut" };
  }
  const nights = calcNights(inDate, outDate);
  if (nights < 1) {
    return { error: "Reservation must be at least 1 night" };
  }
  return {
    stayType: "overnight",
    hourlyDuration: null,
    checkIn: inDate,
    checkOut: outDate,
    nights,
  };
}

export function getRoomStayCharge(room, reservation) {
  if (!room) return 0;
  if (reservation?.stayType === "hourly") {
    return getHourlyRate(room, reservation.hourlyDuration);
  }
  const nights = Math.max(1, Number(reservation?.nights) || 1);
  return (Number(room.rate) || 0) * nights;
}

export function parseHourlyRatesFromBody(body = {}, existing = {}) {
  let fromJson = body.hourlyRates;
  if (typeof fromJson === "string") {
    try {
      fromJson = JSON.parse(fromJson);
    } catch {
      fromJson = null;
    }
  }
  const current = existing.hourlyRates || {};
  const hours3 = parseNonNegativeRate(
    body.hourlyRate3 ?? fromJson?.hours3 ?? current.hours3,
    0,
  );
  const hours6 = parseNonNegativeRate(
    body.hourlyRate6 ?? fromJson?.hours6 ?? current.hours6,
    0,
  );
  const hours12 = parseNonNegativeRate(
    body.hourlyRate12 ?? fromJson?.hours12 ?? current.hours12,
    0,
  );
  if (hours3 === null || hours6 === null || hours12 === null) {
    return { error: "Hourly rates must be non-negative numbers" };
  }
  return {
    hourlyRates: { hours3, hours6, hours12 },
  };
}

export function stayDurationLabel(reservation) {
  if (!reservation) return "";
  if (reservation.stayType === "hourly") {
    return `${reservation.hourlyDuration || 0} hrs`;
  }
  return `${reservation.nights || 0} night(s)`;
}

export function stayTypeLabel(reservation) {
  if (!reservation) return "Overnight";
  if (reservation.stayType === "hourly") {
    return reservation.hourlyDuration
      ? `Hourly · ${reservation.hourlyDuration} hrs`
      : "Hourly";
  }
  return "Overnight";
}
