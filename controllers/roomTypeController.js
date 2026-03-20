import RoomType from "../models/RoomType.js";
import { broadcast } from "../wsServer.js";
import { createNotification } from "../models/Notification.js";

// Create a new room type
export const createRoomType = async (req, res) => {
  try {
    const { name, status = "active" } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Room type name is required" });
    }

    const roomType = new RoomType({
      name: String(name).trim(),
      status,
    });

    const saved = await roomType.save();

    // ✅ NOTIFICATION: Room type created
    await createNotification({
      actorUserId: req.user?._id || null,
      type: "maintenance",
      title: "Room Type Created",
      description: `Room type "${saved.name}" was created. Status: ${saved.status}.`,
      source: "Maintenance",
      entity: { kind: "RoomType", id: saved._id },
    });

    broadcast({
      type: "ROOM_TYPE_UPDATED",
      action: "create",
      roomType: saved,
    });

    return res.status(201).json({
      message: "Room type created successfully",
      roomType: saved,
    });
  } catch (error) {
    // Handle duplicate key (unique: true)
    if (error?.code === 11000) {
      return res.status(409).json({ error: "Room type name already exists" });
    }
    return res.status(500).json({ error: error.message });
  }
};

// Get all room types (optional filtering)
export const getRoomTypes = async (req, res) => {
  try {
    const { status, activeOnly } = req.query;

    const filter = {};
    if (activeOnly === "true") filter.status = "active";
    else if (status) filter.status = status;

    const roomTypes = await RoomType.find(filter).sort({ createdAt: -1 });
    return res.json(roomTypes);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Get a single room type by ID
export const getRoomTypeById = async (req, res) => {
  try {
    const roomType = await RoomType.findById(req.params.id);
    if (!roomType)
      return res.status(404).json({ error: "Room type not found" });
    return res.json(roomType);
  } catch (error) {
    if (error.kind === "ObjectId") {
      return res.status(404).json({ error: "Room type not found" });
    }
    return res.status(500).json({ error: error.message });
  }
};

// Update a room type (name/status)
export const updateRoomType = async (req, res) => {
  try {
    const { name, status } = req.body;

    // Fetch old values for better notification message
    const before = await RoomType.findById(req.params.id);
    if (!before) return res.status(404).json({ error: "Room type not found" });

    const updateData = {};
    if (name !== undefined) updateData.name = String(name).trim();
    if (status !== undefined) updateData.status = status;

    const roomType = await RoomType.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true },
    );

    if (!roomType)
      return res.status(404).json({ error: "Room type not found" });

    // ✅ NOTIFICATION: Room type updated
    const changes = [];
    if (name !== undefined && String(before.name) !== String(roomType.name)) {
      changes.push(`name: "${before.name}" → "${roomType.name}"`);
    }
    if (
      status !== undefined &&
      String(before.status) !== String(roomType.status)
    ) {
      changes.push(`status: ${before.status} → ${roomType.status}`);
    }

    await createNotification({
      actorUserId: req.user?._id || null,
      type: "maintenance",
      title: "Room Type Updated",
      description:
        changes.length > 0
          ? `Room type "${roomType.name}" was updated. Changes: ${changes.join(
              ", ",
            )}.`
          : `Room type "${roomType.name}" was updated.`,
      source: "Maintenance",
      entity: { kind: "RoomType", id: roomType._id },
    });

    broadcast({
      type: "ROOM_TYPE_UPDATED",
      action: "update",
      roomType,
    });

    return res.json({
      message: "Room type updated successfully",
      roomType,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "Room type name already exists" });
    }
    if (error.kind === "ObjectId") {
      return res.status(404).json({ error: "Room type not found" });
    }
    return res.status(500).json({ error: error.message });
  }
};

// Update room type status only (active/inactive)
export const updateRoomTypeStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!status || !["active", "inactive"].includes(status)) {
      return res.status(400).json({ error: "Valid status is required" });
    }

    const before = await RoomType.findById(req.params.id);
    if (!before) return res.status(404).json({ error: "Room type not found" });

    const roomType = await RoomType.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true },
    );

    if (!roomType)
      return res.status(404).json({ error: "Room type not found" });

    // ✅ NOTIFICATION: Room type status updated
    await createNotification({
      actorUserId: req.user?._id || null,
      type: "maintenance",
      title: "Room Type Status Updated",
      description: `Room type "${roomType.name}" status changed from ${before.status} to ${roomType.status}.`,
      source: "Maintenance",
      entity: { kind: "RoomType", id: roomType._id },
    });

    broadcast({
      type: "ROOM_TYPE_UPDATED",
      action: "status",
      roomType,
    });

    return res.json({
      message: "Room type status updated successfully",
      roomType,
    });
  } catch (error) {
    if (error.kind === "ObjectId") {
      return res.status(404).json({ error: "Room type not found" });
    }
    return res.status(500).json({ error: error.message });
  }
};

// Delete a room type (optional but usually needed)
export const deleteRoomType = async (req, res) => {
  try {
    const roomType = await RoomType.findByIdAndDelete(req.params.id);

    if (!roomType)
      return res.status(404).json({ error: "Room type not found" });

    // ✅ NOTIFICATION: Room type deleted
    await createNotification({
      actorUserId: req.user?._id || null,
      type: "maintenance",
      title: "Room Type Deleted",
      description: `Room type "${roomType.name}" was deleted.`,
      source: "Maintenance",
      entity: { kind: "RoomType", id: roomType._id },
    });

    broadcast({
      type: "ROOM_TYPE_UPDATED",
      action: "delete",
      roomType,
    });

    return res.json({ message: "Room type deleted successfully" });
  } catch (error) {
    if (error.kind === "ObjectId") {
      return res.status(404).json({ error: "Room type not found" });
    }
    return res.status(500).json({ error: error.message });
  }
};
