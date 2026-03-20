import Amenity from "../models/Amenity.js";
import { createNotification } from "../models/Notification.js";

/* -------------------- CREATE AMENITY -------------------- */
export const createAmenity = async (req, res) => {
  try {
    const { name, rate, stock, status = "active" } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Amenity name is required" });
    }
    if (rate === undefined || Number(rate) < 0) {
      return res.status(400).json({ message: "Valid rate is required" });
    }
    if (stock === undefined || Number(stock) < 0) {
      return res.status(400).json({ message: "Valid stock is required" });
    }

    const amenity = await Amenity.create({
      name: String(name).trim(),
      rate: Number(rate),
      stock: Number(stock),
      status,
    });

    // ✅ NOTIFICATION: Amenity created
    await createNotification({
      actorUserId: req.user?._id || null,
      type: "maintenance",
      title: "Amenity Created",
      description: `Amenity "${amenity.name}" was created. Rate: ${amenity.rate}, Stock: ${amenity.stock}, Status: ${amenity.status}.`,
      source: "Maintenance",
      entity: { kind: "Amenity", id: amenity._id },
    });

    return res.status(201).json(amenity);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Amenity name already exists" });
    }
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- GET AMENITIES -------------------- */
export const getAmenities = async (req, res) => {
  try {
    const { status, activeOnly } = req.query;

    const filter = {};
    if (activeOnly === "true") filter.status = "active";
    else if (status) filter.status = status;

    const amenities = await Amenity.find(filter).sort({ createdAt: -1 });
    return res.json(amenities);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- GET AMENITY BY ID -------------------- */
export const getAmenityById = async (req, res) => {
  try {
    const amenity = await Amenity.findById(req.params.id);
    if (!amenity) return res.status(404).json({ message: "Amenity not found" });
    return res.json(amenity);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- UPDATE AMENITY -------------------- */
export const updateAmenity = async (req, res) => {
  try {
    const { name, rate, stock, status } = req.body;

    // Grab old values for a better notification message
    const before = await Amenity.findById(req.params.id);
    if (!before) return res.status(404).json({ message: "Amenity not found" });

    const update = {};
    if (name !== undefined) update.name = String(name).trim();
    if (rate !== undefined) update.rate = Number(rate);
    if (stock !== undefined) update.stock = Number(stock);
    if (status !== undefined) update.status = status;

    const amenity = await Amenity.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });

    // ✅ NOTIFICATION: Amenity updated
    const changes = [];
    if (name !== undefined && String(before.name) !== String(amenity.name))
      changes.push(`name: "${before.name}" → "${amenity.name}"`);
    if (rate !== undefined && Number(before.rate) !== Number(amenity.rate))
      changes.push(`rate: ${before.rate} → ${amenity.rate}`);
    if (stock !== undefined && Number(before.stock) !== Number(amenity.stock))
      changes.push(`stock: ${before.stock} → ${amenity.stock}`);
    if (
      status !== undefined &&
      String(before.status) !== String(amenity.status)
    )
      changes.push(`status: ${before.status} → ${amenity.status}`);

    await createNotification({
      actorUserId: req.user?._id || null,
      type: "maintenance",
      title: "Amenity Updated",
      description:
        changes.length > 0
          ? `Amenity "${amenity.name}" was updated. Changes: ${changes.join(", ")}.`
          : `Amenity "${amenity.name}" was updated.`,
      source: "Maintenance",
      entity: { kind: "Amenity", id: amenity._id },
    });

    return res.json(amenity);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Amenity name already exists" });
    }
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- DELETE AMENITY -------------------- */
export const deleteAmenity = async (req, res) => {
  try {
    const amenity = await Amenity.findByIdAndDelete(req.params.id);
    if (!amenity) return res.status(404).json({ message: "Amenity not found" });

    // ✅ NOTIFICATION: Amenity deleted
    await createNotification({
      actorUserId: req.user?._id || null,
      type: "maintenance",
      title: "Amenity Deleted",
      description: `Amenity "${amenity.name}" was deleted.`,
      source: "Maintenance",
      entity: { kind: "Amenity", id: amenity._id },
    });

    return res.json({ message: "Amenity deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const deleteMultipleAmenities = async (req, res) => {
  try {
    const { amenityIds } = req.body;

    if (!amenityIds || !Array.isArray(amenityIds) || amenityIds.length === 0) {
      return res.status(400).json({ message: "amenityIds array is required" });
    }

    // Fetch details before delete for notification message
    const amenitiesToDelete = await Amenity.find({
      _id: { $in: amenityIds },
    }).select("name");

    const result = await Amenity.deleteMany({ _id: { $in: amenityIds } });

    // ✅ NOTIFICATION: Multiple amenities deleted
    const names = amenitiesToDelete.map((a) => a.name).filter(Boolean);
    await createNotification({
      actorUserId: req.user?._id || null,
      type: "maintenance",
      title: "Amenities Deleted",
      description:
        names.length <= 10
          ? `Deleted ${result.deletedCount} amenity(ies): ${names.join(", ")}.`
          : `Deleted ${result.deletedCount} amenity(ies). Example: ${names
              .slice(0, 5)
              .join(", ")}...`,
      source: "Maintenance",
      entity: { kind: "Amenity", id: null },
    });

    return res.json({
      message: `Deleted ${result.deletedCount} amenity(ies) successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
