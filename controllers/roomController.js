import Room from "../models/Room.js";
import cloudinary from "../config/cloudinary.js";
import { createNotification } from "../models/Notification.js";

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
      description, // Add description
    } = req.body;

    if (!roomNumber || !capacity || !rate || !status || !category) {
      return res.status(400).json({
        message:
          "Room number, capacity, rate, status, and category are required",
      });
    }

    // Only validate roomType if category is "room"
    if (category === "room" && !roomType) {
      return res.status(400).json({
        message: "Room type is required for rooms",
      });
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
      roomNumber,
      capacity,
      rate,
      status,
      category: category || "room",
      images: uploadedImages,
      description: description || "", // Add description
    };

    // Only add roomType if category is "room" and it's provided
    if (category === "room" && roomType) {
      roomData.roomType = roomType;
    }

    const room = new Room(roomData);

    await room.save();

    // ✅ NOTIFICATION: Room created
    await createNotification({
      actorUserId: req.user?._id || null,
      type: "maintenance",
      title: `${category === "cottage" ? "Cottage" : "Room"} Created`,
      description: `${category === "cottage" ? "Cottage" : "Room"} ${room.roomNumber} was created. Capacity: ${room.capacity}, Rate: ${room.rate}, Status: ${room.status}.${room.description ? ` Description: ${room.description}` : ""}`,
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
      imagesCount: Array.isArray(room.images) ? room.images.length : 0,
    };

    const {
      roomNumber,
      roomType,
      capacity,
      rate,
      status,
      category,
      description, // Add description
    } = req.body;

    // Validate category if it's being updated
    if (category && category === "room" && !roomType && !room.roomType) {
      return res.status(400).json({
        message: "Room type is required for rooms",
      });
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

    // Update fields
    room.roomNumber = roomNumber ?? room.roomNumber;
    room.capacity = capacity ?? room.capacity;
    room.rate = rate ?? room.rate;
    room.status = status ?? room.status;
    room.category = category ?? room.category;
    room.description = description ?? room.description; // Add description update

    // Only update roomType if category is "room" and it's provided
    if (room.category === "room") {
      if (roomType !== undefined) {
        room.roomType = roomType;
      }
    } else {
      // Clear roomType for cottages
      room.roomType = null;
    }

    await room.save();

    // ✅ NOTIFICATION: Room updated
    const after = {
      roomNumber: room.roomNumber,
      roomType: room.roomType?.toString?.() || room.roomType,
      capacity: room.capacity,
      rate: room.rate,
      status: room.status,
      category: room.category,
      description: room.description || "",
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
