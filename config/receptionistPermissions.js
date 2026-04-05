export const RECEPTIONIST_FEATURES = [
  "frontDesk",
  "reservations",
  "rooms",
  "guests",
  "billing",
];

export const LEVELS_NONE_VIEW_MANAGE = ["none", "view", "manage"];
export const LEVELS_VIEW_MANAGE = ["view", "manage"];

export function defaultNewReceptionistPermissions() {
  return {
    frontDesk: "manage",
    reservations: "manage",
    rooms: "none",
    guests: "none",
    billing: "none",
  };
}

export function legacyReceptionistPermissions() {
  return {
    frontDesk: "manage",
    reservations: "manage",
    rooms: "manage",
    guests: "manage",
    billing: "manage",
  };
}

function isValidLevel(feature, level) {
  if (feature === "frontDesk") {
    return LEVELS_VIEW_MANAGE.includes(level);
  }
  return LEVELS_NONE_VIEW_MANAGE.includes(level);
}

export function normalizeReceptionistPermissions(raw, { base } = {}) {
  const resolvedBase =
    base === undefined ? defaultNewReceptionistPermissions() : { ...base };

  if (!raw || typeof raw !== "object") {
    return resolvedBase;
  }

  const out = { ...resolvedBase };
  for (const key of RECEPTIONIST_FEATURES) {
    if (raw[key] !== undefined && raw[key] !== null) {
      const v = String(raw[key]);
      if (isValidLevel(key, v)) {
        out[key] = v;
      }
    }
  }
  if (out.frontDesk === "none") {
    out.frontDesk = "manage";
  }
  return out;
}
