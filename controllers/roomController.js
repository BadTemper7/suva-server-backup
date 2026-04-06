import Room from "../models/Room.js";
import ReservationModels from "../models/Reservation.js";
import cloudinary from "../config/cloudinary.js";
import { createNotification } from "../models/Notification.js";
import OperationLog from "../models/OperationLog.js";
import { fetchOperationsLogsReportPayload } from "../utils/operationsLogsReport.js";

const ALLOWED_ROOM_STATUSES = ["active", "maintenance", "clean", "to-clean"];
const { Reservation, ReservationRoom } = ReservationModels;

function validateRoomStatus(status) {
  if (!status || status === "inactive" || !ALLOWED_ROOM_STATUSES.includes(status)) {
    return "Invalid status";
  }
  return null;
}

function parsePositiveIntCapacity(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  return n;
}

function parseNonNegativeRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

async function findReservationIdForLogDate(roomId, logDate = new Date()) {
  if (!roomId) return null;

  const links = await ReservationRoom.find({ roomId })
    .select("reservationId")
    .lean();
  const reservationIds = [
    ...new Set(
      links
        .map((l) => l?.reservationId?.toString?.() || String(l?.reservationId || ""))
        .filter(Boolean),
    ),
  ];
  if (reservationIds.length === 0) return null;

  const dayStart = new Date(logDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(logDate);
  dayEnd.setHours(23, 59, 59, 999);

  const reservationForDate = await Reservation.findOne({
    _id: { $in: reservationIds },
    // Link when the log day falls within the reservation stay window.
    checkIn: { $lte: dayEnd },
    checkOut: { $gte: dayStart },
    status: { $nin: ["cancelled", "expired", "no_show"] },
  })
    .sort({ checkIn: 1, createdAt: 1 })
    .select("_id")
    .lean();

  return reservationForDate?._id || null;
}

/* -------------------- CREATE ROOM -------------------- */
export const createRoom = async (req, res) => {
  try {
    const {
      roomNumber,
      roomType,
      capacity,
      rate,
      status,
      category,
      description,
      maintenanceReason,
    } = req.body;

    const stErr = validateRoomStatus(status);
    if (stErr) {
      return res.status(400).json({ message: stErr });
    }

    if (!roomNumber || !String(roomNumber).trim()) {
      return res.status(400).json({ message: "Room number is required" });
    }

    if (!category || !["room", "cottage"].includes(category)) {
      return res.status(400).json({ message: "Valid category is required" });
    }

    const cap = parsePositiveIntCapacity(capacity);
    if (cap === null) {
      return res.status(400).json({ message: "Capacity must be a positive integer" });
    }

    const rt = parseNonNegativeRate(rate);
    if (rt === null) {
      return res.status(400).json({ message: "Rate must be a non-negative number" });
    }

    const desc = String(description ?? "").trim();
    if (!desc) {
      return res.status(400).json({ message: "Description is required" });
    }

    if (category === "room" && !roomType) {
      return res.status(400).json({
        message: "Room type is required for rooms",
      });
    }

    let mr = String(maintenanceReason ?? "").trim();
    if (status === "maintenance") {
      if (!mr) {
        return res.status(400).json({
          message: "Maintenance reason is required when status is maintenance",
        });
      }
    } else {
      mr = "";
    }

    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one image is required" });
    }

    // Upload images
    const uploadedImages = [];
    for (const file of req.files) {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: "rooms",
      });
      uploadedImages.push({
        url: result.secure_url,
        publicId: result.public_id,
      });
    }

    // Prepare room data
    const roomData = {
      roomNumber: String(roomNumber).trim(),
      capacity: cap,
      rate: rt,
      status,
      category: category || "room",
      images: uploadedImages,
      description: desc,
      maintenanceReason: mr,
    };

    // Only add roomType if category is "room" and it's provided
    if (category === "room" && roomType) {
      roomData.roomType = roomType;
    }

    const room = new Room(roomData);

    await room.save();

    const normalized = String(room.status || "").toLowerCase().trim();
    const action =
      normalized === "maintenance"
        ? "maintenance"
        : normalized === "to-clean"
          ? "cleaning"
          : null;

    // Initial log for created units if they start in a tracked status.
    if (action) {
      const reservationId = await findReservationIdForLogDate(room._id);
      await OperationLog.create({
        unitType: room.category === "cottage" ? "cottage" : "room",
        unitId: room._id,
        action,
        reservationId,
        performedBy: req.user?._id || null,
      });
    }

    // ✅ NOTIFICATION: Room created
    await createNotification({
      actorUserId: req.user?._id || null,
      type: "maintenance",
      title: `${category === "cottage" ? "Cottage" : "Room"} Created`,
      description: `${category === "cottage" ? "Cottage" : "Room"} ${room.roomNumber} was created. Capacity: ${room.capacity}, Rate: ${room.rate}, Status: ${room.status}.${room.description ? ` Description: ${room.description}` : ""}${room.status === "maintenance" && room.maintenanceReason ? ` Reason: ${room.maintenanceReason}` : ""}`,
      source: "Maintenance",
      entity: { kind: "Room", id: room._id },
    });

    res.status(201).json(room);
  } catch (error) {
    console.error(error);
    if (error.code === 11000 && error.keyValue?.roomNumber) {
      return res.status(400).json({
        message: `Room number ${error.keyValue.roomNumber} already exists`,
      });
    }
    res
      .status(500)
      .json({ message: "Failed to create room", error: error.message });
  }
};

/* -------------------- UPDATE ROOM -------------------- */
export const updateRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room)
      return res
        .status(404)
        .json({ message: `Room with ID ${req.params.id} not found` });

    // Capture old values for notification diff
    const before = {
      roomNumber: room.roomNumber,
      roomType: room.roomType?.toString?.() || room.roomType,
      capacity: room.capacity,
      rate: room.rate,
      status: room.status,
      category: room.category,
      description: room.description || "",
      maintenanceReason: room.maintenanceReason || "",
      imagesCount: Array.isArray(room.images) ? room.images.length : 0,
    };

    const {
      roomNumber,
      roomType,
      capacity,
      rate,
      status,
      category,
      description,
      maintenanceReason,
    } = req.body;

    const finalCategory =
      category !== undefined ? category : room.category;
    if (!["room", "cottage"].includes(finalCategory)) {
      return res.status(400).json({ message: "Invalid category" });
    }

    const finalStatus = status !== undefined ? status : room.status;
    const stErr = validateRoomStatus(finalStatus);
    if (stErr) {
      return res.status(400).json({ message: stErr });
    }

    // Delete selected images
    if (req.body.deletedImages) {
      const deletedIds = Array.isArray(req.body.deletedImages)
        ? req.body.deletedImages
        : [req.body.deletedImages];

      room.images = room.images.filter((img) => {
        if (deletedIds.includes(img.publicId)) {
          cloudinary.uploader.destroy(img.publicId);
          return false;
        }
        return true;
      });
    }

    // Add new images
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: "rooms",
        });
        room.images.push({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    }

    if (!Array.isArray(room.images) || room.images.length === 0) {
      return res.status(400).json({
        message: "At least one image is required",
      });
    }

    const cap =
      capacity !== undefined ? parsePositiveIntCapacity(capacity) : room.capacity;
    if (capacity !== undefined && cap === null) {
      return res.status(400).json({ message: "Capacity must be a positive integer" });
    }

    const rtParsed =
      rate !== undefined ? parseNonNegativeRate(rate) : room.rate;
    if (rate !== undefined && rtParsed === null) {
      return res.status(400).json({ message: "Rate must be a non-negative number" });
    }

    const desc =
      description !== undefined
        ? String(description).trim()
        : String(room.description ?? "").trim();
    if (!desc) {
      return res.status(400).json({ message: "Description is required" });
    }

    if (finalCategory === "room") {
      const nextType =
        roomType !== undefined ? roomType : room.roomType;
      if (!nextType) {
        return res.status(400).json({
          message: "Room type is required for rooms",
        });
      }
    }

    let mr =
      maintenanceReason !== undefined
        ? String(maintenanceReason).trim()
        : String(room.maintenanceReason ?? "").trim();
    if (finalStatus === "maintenance") {
      if (!mr) {
        return res.status(400).json({
          message: "Maintenance reason is required when status is maintenance",
        });
      }
    } else {
      mr = "";
    }

    room.roomNumber =
      roomNumber !== undefined ? String(roomNumber).trim() : room.roomNumber;
    if (!room.roomNumber) {
      return res.status(400).json({ message: "Room number is required" });
    }
    room.capacity = cap;
    room.rate = rtParsed;
    room.status = finalStatus;
    room.category = finalCategory;
    room.description = desc;
    room.maintenanceReason = mr;

    if (room.category === "room") {
      if (roomType !== undefined) {
        room.roomType = roomType;
      }
    } else {
      room.roomType = null;
    }

    await room.save();

    const statusChanged = String(before.status) !== String(room.status);
    const statusProvided = Object.prototype.hasOwnProperty.call(
      req.body,
      "status",
    );
    const normalized = String(room.status || "").toLowerCase().trim();
    const action =
      normalized === "maintenance"
        ? "maintenance"
        : normalized === "to-clean"
          ? "cleaning"
          : null;

    // Trigger maintenance/cleaning logs on status update in Rooms/Cottages edit.
    if (action && (statusProvided || statusChanged)) {
      const reservationId = await findReservationIdForLogDate(room._id);
      await OperationLog.create({
        unitType: room.category === "cottage" ? "cottage" : "room",
        unitId: room._id,
        action,
        reservationId,
        performedBy: req.user?._id || null,
      });
    }

    // ✅ NOTIFICATION: Room updated
    const after = {
      roomNumber: room.roomNumber,
      roomType: room.roomType?.toString?.() || room.roomType,
      capacity: room.capacity,
      rate: room.rate,
      status: room.status,
      category: room.category,
      description: room.description || "",
      maintenanceReason: room.maintenanceReason || "",
      imagesCount: Array.isArray(room.images) ? room.images.length : 0,
    };

    const changes = [];
    if (
      before.roomNumber !== after.roomNumber &&
      after.roomNumber !== undefined
    ) {
      changes.push(`roomNumber: ${before.roomNumber} → ${after.roomNumber}`);
    }
    if (before.roomType !== after.roomType && after.roomType !== undefined) {
      changes.push(`roomType updated`);
    }
    if (Number(before.capacity) !== Number(after.capacity)) {
      changes.push(`capacity: ${before.capacity} → ${after.capacity}`);
    }
    if (Number(before.rate) !== Number(after.rate)) {
      changes.push(`rate: ${before.rate} → ${after.rate}`);
    }
    if (String(before.status) !== String(after.status)) {
      changes.push(`status: ${before.status} → ${after.status}`);
    }
    if (String(before.category) !== String(after.category)) {
      changes.push(`category: ${before.category} → ${after.category}`);
    }
    if (String(before.description) !== String(after.description)) {
      changes.push(`description updated`);
    }
    if (String(before.maintenanceReason) !== String(after.maintenanceReason)) {
      changes.push(`maintenance reason updated`);
    }
    if (before.imagesCount !== after.imagesCount) {
      changes.push(`images: ${before.imagesCount} → ${after.imagesCount}`);
    }

    await createNotification({
      actorUserId: req.user?._id || null,
      type: "maintenance",
      title: `${room.category === "cottage" ? "Cottage" : "Room"} Updated`,
      description:
        changes.length > 0
          ? `${room.category === "cottage" ? "Cottage" : "Room"} ${room.roomNumber} was updated. Changes: ${changes.join(
              ", ",
            )}.`
          : `${room.category === "cottage" ? "Cottage" : "Room"} ${room.roomNumber} was updated.`,
      source: "Maintenance",
      entity: { kind: "Room", id: room._id },
    });

    res.json(room);
  } catch (error) {
    console.error(error);
    if (error.code === 11000 && error.keyValue?.roomNumber) {
      return res.status(400).json({
        message: `Room number ${error.keyValue.roomNumber} already exists`,
      });
    }
    res.status(500).json({
      message: `Failed to update room with ID ${req.params.id}`,
      error: error.message,
    });
  }
};
/* -------------------- GET ROOMS -------------------- */
export const getRooms = async (req, res) => {
  try {
    const { category } = req.query;
    let query = {};

    // Filter by category if provided
    if (category && (category === "room" || category === "cottage")) {
      query.category = category;
    }

    const rooms = await Room.find(query).populate("roomType");
    res.json(rooms);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Failed to fetch rooms", error: error.message });
  }
};

/* -------------------- GET SINGLE ROOM -------------------- */
export const getRoomById = async (req, res) => {
  try {
    if (!req.params.id || !/^[0-9a-fA-F]{24}$/.test(String(req.params.id))) {
      return res.status(400).json({ message: "Invalid room ID" });
    }
    const room = await Room.findById(req.params.id).populate("roomType");
    if (!room)
      return res
        .status(404)
        .json({ message: `Room with ID ${req.params.id} not found` });
    res.json(room);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Failed to fetch room", error: error.message });
  }
};

/* -------------------- DELETE SINGLE ROOM -------------------- */
export const deleteRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room)
      return res
        .status(404)
        .json({ message: `Room with ID ${req.params.id} not found` });

    // Delete images from Cloudinary
    for (const img of room.images) {
      await cloudinary.uploader.destroy(img.publicId);
    }

    await room.deleteOne(); // ✅ use deleteOne instead of remove

    // ✅ NOTIFICATION: Room deleted
    await createNotification({
      actorUserId: req.user?._id || null,
      type: "maintenance",
      title: `${room.category === "cottage" ? "Cottage" : "Room"} Deleted`,
      description: `${room.category === "cottage" ? "Cottage" : "Room"} ${room.roomNumber} was deleted.`,
      source: "Maintenance",
      entity: { kind: "Room", id: room._id },
    });

    res.json({
      message: `${room.category === "cottage" ? "Cottage" : "Room"} ${room.roomNumber} deleted successfully`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: `Failed to delete room with ID ${req.params.id}`,
      error: error.message,
    });
  }
};

/* -------------------- DELETE MULTIPLE ROOMS -------------------- */
export const deleteMultipleRooms = async (req, res) => {
  try {
    const { roomIds } = req.body;

    if (!roomIds || !Array.isArray(roomIds) || roomIds.length === 0) {
      return res.status(400).json({ message: "roomIds array is required" });
    }

    const rooms = await Room.find({ _id: { $in: roomIds } }).select(
      "roomNumber images category",
    );

    for (const room of rooms) {
      // Delete images in Cloudinary
      for (const img of room.images) {
        await cloudinary.uploader.destroy(img.publicId);
      }
    }

    // Delete rooms in bulk
    await Room.deleteMany({ _id: { $in: roomIds } }); // ✅ bulk delete

    // ✅ NOTIFICATION: Multiple rooms deleted
    const labels = rooms
      .map((r) =>
        r.roomNumber
          ? `${r.category === "cottage" ? "Cottage" : "Room"} ${r.roomNumber}`
          : r._id.toString(),
      )
      .filter(Boolean);

    await createNotification({
      actorUserId: req.user?._id || null,
      type: "maintenance",
      title: "Rooms/Cottages Deleted",
      description:
        labels.length <= 10
          ? `Deleted ${rooms.length} item(s): ${labels.join(", ")}.`
          : `Deleted ${rooms.length} item(s). Example: ${labels
              .slice(0, 5)
              .join(", ")}...`,
      source: "Maintenance",
      entity: { kind: "Room", id: null },
    });

    res.json({
      message: `Deleted ${rooms.length} item(s) successfully`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to delete multiple rooms",
      error: error.message,
    });
  }
};

export const getOperationLogs = async (req, res) => {
  try {
    if (String(req.query.format || "").toLowerCase() === "report") {
      const data = await fetchOperationsLogsReportPayload(req.query);
      return res.status(200).json(data);
    }

    const {
      unitType = "room",
      action = "all",
      startDate,
      endDate,
      page = 1,
      pageSize = 10,
    } = req.query;

    if (!["room", "cottage"].includes(unitType)) {
      return res.status(400).json({ message: "Invalid unitType" });
    }

    const query = { unitType };
    if (
      action &&
      action !== "all" &&
      ["cleaning", "maintenance", "check_in", "check_out"].includes(action)
    ) {
      query.action = action;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        const s = new Date(startDate);
        if (Number.isNaN(s.getTime())) {
          return res.status(400).json({ message: "Invalid startDate" });
        }
        s.setHours(0, 0, 0, 0);
        query.createdAt.$gte = s;
      }
      if (endDate) {
        const e = new Date(endDate);
        if (Number.isNaN(e.getTime())) {
          return res.status(400).json({ message: "Invalid endDate" });
        }
        e.setHours(23, 59, 59, 999);
        query.createdAt.$lte = e;
      }
    }

    const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
    const sizeNum = Math.min(
      100,
      Math.max(1, Number.parseInt(pageSize, 10) || 10),
    );
    const skip = (pageNum - 1) * sizeNum;

    const [total, logs] = await Promise.all([
      OperationLog.countDocuments(query),
      OperationLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(sizeNum)
        .populate("unitId", "roomNumber roomNo category")
        .populate("reservationId", "reservationNumber")
        .populate("performedBy", "firstName lastName username"),
    ]);

    return res.status(200).json({
      success: true,
      logs,
      pagination: {
        total,
        page: pageNum,
        pageSize: sizeNum,
        totalPages: Math.max(1, Math.ceil(total / sizeNum)),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch operation logs",
      error: error.message,
    });
  }
};
