// controllers/notificationController.js
import Notification from "../models/Notification.js";

// optional: compute "2m/1h/1d" on server (your UI currently expects "time")
function timeAgoShort(date) {
  const diffMs = Date.now() - new Date(date).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

// GET /notifications?unread=true&type=reservation&page=1&limit=20
export const getNotifications = async (req, res) => {
  try {
    const {
      unread,
      type,
      page = 1,
      limit = 20,
      recipientUserId, // optional filter
    } = req.query;

    const filter = {};
    if (typeof unread !== "undefined") {
      filter.unread = String(unread) === "true";
    }
    if (type) filter.type = type;
    if (recipientUserId) filter.recipientUserId = recipientUserId;

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (p - 1) * l;

    const [items, total] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(l),
      Notification.countDocuments(filter),
    ]);

    // Shape to match your UI
    const shaped = items.map((n) => ({
      id: String(n._id),
      unread: n.unread,
      title: n.title,
      description: n.description,
      source: n.source,
      type: n.type,
      time: timeAgoShort(n.createdAt), // or omit if you prefer frontend
      createdAt: n.createdAt, // useful for frontend time libs
      entity: n.entity,
    }));

    return res.json({
      page: p,
      limit: l,
      total,
      items: shaped,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// PATCH /notifications/:id/read
export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await Notification.findByIdAndUpdate(
      id,
      { unread: false, readAt: new Date() },
      { new: true },
    );

    if (!updated) return res.status(404).json({ message: "Not found" });

    return res.json({ message: "Marked as read", id: String(updated._id) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// PATCH /notifications/read-all
export const markAllAsRead = async (req, res) => {
  try {
    const { recipientUserId } = req.body || {};

    const filter = { unread: true };
    if (recipientUserId) filter.recipientUserId = recipientUserId;

    const result = await Notification.updateMany(filter, {
      unread: false,
      readAt: new Date(),
    });

    return res.json({
      message: "All marked as read",
      modifiedCount: result.modifiedCount ?? result.nModified ?? 0,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// DELETE /notifications/:id
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Notification.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    return res.json({ message: "Deleted", id });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
export const deleteMultipleNotifications = async (req, res) => {
  try {
    // Get the array of notification IDs from the request body
    const { notificationIds } = req.body;

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res
        .status(400)
        .json({ message: "Array of notification IDs is required" });
    }

    // Delete notifications where the ID is in the notificationIds array
    const result = await Notification.deleteMany({
      _id: { $in: notificationIds },
    });
    console.log(result);
    return res.json({
      message: `${result.deletedCount} notification(s) deleted successfully.`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
