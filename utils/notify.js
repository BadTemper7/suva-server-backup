// utils/notify.js
import Notification from "../models/Notification.js";

export async function createNotification({
  recipientUserId = null,
  actorUserId = null,
  type,
  title,
  description = "",
  source,
  entity = {},
}) {
  if (!type || !title || !source) {
    throw new Error("Notification requires type, title, and source");
  }

  return Notification.create({
    recipientUserId,
    actorUserId,
    type,
    title,
    description,
    source,
    unread: true,
    readAt: null,
    entity: {
      kind: entity.kind || "",
      id: entity.id || null,
    },
  });
}
