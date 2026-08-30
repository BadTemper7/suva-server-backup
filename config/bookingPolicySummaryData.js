
export const bookingPolicySummaryIntro =
  "Quick reminders for your visit and overnight stay. See the full policy pages on our website for complete terms.";

export const resortGuestSummary = {
  title: "Resort & pool (day guests and everyone on-site)",
  items: [
    "Pay at the Front Desk before entering; visitors beyond 15 minutes pay the full fee.",
    "Children under 18 must be supervised by a parent or guardian at all times, especially in the pool.",
    "Respect cottage and umbrella limits; extra guests or unauthorized use of empty facilities may be charged.",
    "Keep music and videoke moderate; must be off by 10:00 PM.",
    "Corkage: soda ₱50/bottle, liquor ₱60/bottle; fees apply for electrical appliances (by size).",
    "Payments are non-refundable except during blackouts or natural disasters.",
    "Follow lifeguard instructions; no running, pushing, or dangerous play in the pool.",
    "Swimwear: rash guards, trunks, and swimsuits only—no cotton, denim, or joggers.",
    "Shower before swimming; no eating, drinking, spitting, or pets in the pool; no swimming with open wounds or infections.",
    "No glass, sharp objects, or hazardous materials in the pool area.",
    "Get a body stamp before leaving for re-entry; without it, pay the entrance fee again.",
    "Use designated trash bins.",
    "Sample fines: vandalism ₱3,000; urination outside restrooms ₱1,000; fighting or serious disturbance ₱2,000 plus possible removal without refund; property damage paid immediately.",
    "Illegal drugs or marijuana are prohibited and may be reported to police.",
    "The resort is not liable for lost belongings; photos or videos taken on-site may be used for resort marketing.",
  ],
};

export const roomPolicySummary = {
  title: "Rooms & overnight stays",
  items: [
    "Early check-in or late check-out may be allowed when available, with extra charges.",
    "Valid government ID and a cash deposit at check-in: ₱500 (Cuarto & Teodora) or ₱1,000 (Casa), refunded at checkout if there is no damage.",
    "Maximum occupancy is enforced; extra guests are charged per night. Visitors are allowed only in public areas, not overnight, and must present valid ID.",
    "No smoking or vaping inside rooms (₱1,000 cleaning fee).",
    "Dogs under 40 kg allowed, max two per room, ₱200 per dog per night.",
    "Lock your room when out or asleep; lost or damaged keys: ₱500.",
    "Guests are responsible for loss or damage to resort property; repair costs are due immediately.",
    "Illegal drugs or marijuana: reported to authorities, removal without refund.",
    "Respect other guests—no parties, loud noise, or disruptive behavior. Quiet hours 10:00 PM–8:00 AM; violations may mean removal and a ₱2,000 fine.",
    "Pool hours for guests: day swim 8:00 AM–4:30 PM; night swim 8:00 PM–4:30 AM. The resort is not responsible for accidents outside these hours.",
    "No strong-smelling food inside rooms (₱1,000 cleaning fee). Cooking only on verandas or in designated kitchens—inform management first.",
    "Cuarto and Teodora rooms are not available to minors; guests under 18 must be with parents or guardians.",
    "The full Resort Guest Policy also applies to all room guests.",
  ],
};

export const DEFAULT_SECURITY_DEPOSITS = {
  Cuarto: 500,
  Teodora: 500,
  Casa: 1000,
};

export function formatSecurityDepositCopy(deposits) {
  const d =
    deposits && typeof deposits === "object" && !Array.isArray(deposits)
      ? deposits
      : DEFAULT_SECURITY_DEPOSITS;
  const groups = new Map();
  for (const [name, amt] of Object.entries(d)) {
    const n = Number(amt);
    if (!Number.isFinite(n)) continue;
    const key = String(n);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(String(name));
  }
  const parts = [...groups.entries()].map(([amt, names]) => {
    const formatted = `₱${Number(amt).toLocaleString("en-PH")}`;
    if (names.length === 1) return `${formatted} (${names[0]})`;
    if (names.length === 2) return `${formatted} (${names[0]} & ${names[1]})`;
    return `${formatted} (${names.slice(0, -1).join(", ")} & ${names[names.length - 1]})`;
  });
  if (parts.length === 0) {
    return "a cash deposit as posted at the Front Desk";
  }
  return parts.join(", or ");
}

export function roomPolicyDepositItem(deposits) {
  return `Valid government ID and a cash deposit at check-in: ${formatSecurityDepositCopy(deposits)}, refunded at checkout if there is no damage.`;
}
