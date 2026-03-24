// controllers/addOnController.js
import AddOn from "../models/AddOn.js";
import { createNotification } from "../models/Notification.js";

/* -------------------- CREATE ADD-ON -------------------- */
export const createAddOn = async (req, res) => {
  try {
    const {
      name,
      rate,
      stock,
      description,
      category,
      status = "active",
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Add-on name is required" });
    }
    if (rate === undefined || Number(rate) < 0) {
      return res.status(400).json({ message: "Valid rate is required" });
    }
    if (stock === undefined || Number(stock) < 0) {
      return res.status(400).json({ message: "Valid stock is required" });
    }

    const addOn = await AddOn.create({
      name: String(name).trim(),
      rate: Number(rate),
      stock: Number(stock),
      description: description ? String(description).trim() : "",
      category: category || "other",
      status,
    });

    // ✅ NOTIFICATION: Add-on created
    await createNotification({
      actorUserId: req.user?._id || null,
      type: "maintenance",
      title: "Add-On Created",
      description: `Add-on "${addOn.name}" was created. Rate: ${addOn.rate}, Stock: ${addOn.stock}, Category: ${addOn.category}, Status: ${addOn.status}.`,
      source: "Maintenance",
      entity: { kind: "AddOn", id: addOn._id },
    });

    return res.status(201).json(addOn);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Add-on name already exists" });
    }
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- GET ADD-ONS -------------------- */
export const getAddOns = async (req, res) => {
  try {
    const { status, category, activeOnly } = req.query;

    const filter = {};
    if (activeOnly === "true") filter.status = "active";
    else if (status) filter.status = status;
    if (category) filter.category = category;

    const addOns = await AddOn.find(filter).sort({ createdAt: -1 });
    return res.json(addOns);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- GET ADD-ON BY ID -------------------- */
export const getAddOnById = async (req, res) => {
  try {
    const addOn = await AddOn.findById(req.params.id);
    if (!addOn) return res.status(404).json({ message: "Add-on not found" });
    return res.json(addOn);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- UPDATE ADD-ON -------------------- */
export const updateAddOn = async (req, res) => {
  try {
    const { name, rate, stock, description, category, status } = req.body;

    // Grab old values for a better notification message
    const before = await AddOn.findById(req.params.id);
    if (!before) return res.status(404).json({ message: "Add-on not found" });

    const update = {};
    if (name !== undefined) update.name = String(name).trim();
    if (rate !== undefined) update.rate = Number(rate);
    if (stock !== undefined) update.stock = Number(stock);
    if (description !== undefined)
      update.description = String(description).trim();
    if (category !== undefined) update.category = category;
    if (status !== undefined) update.status = status;

    const addOn = await AddOn.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });

    // ✅ NOTIFICATION: Add-on updated
    const changes = [];
    if (name !== undefined && String(before.name) !== String(addOn.name))
      changes.push(`name: "${before.name}" → "${addOn.name}"`);
    if (rate !== undefined && Number(before.rate) !== Number(addOn.rate))
      changes.push(`rate: ${before.rate} → ${addOn.rate}`);
    if (stock !== undefined && Number(before.stock) !== Number(addOn.stock))
      changes.push(`stock: ${before.stock} → ${addOn.stock}`);
    if (
      description !== undefined &&
      String(before.description) !== String(addOn.description)
    )
      changes.push(`description updated`);
    if (
      category !== undefined &&
      String(before.category) !== String(addOn.category)
    )
      changes.push(`category: ${before.category} → ${addOn.category}`);
    if (status !== undefined && String(before.status) !== String(addOn.status))
      changes.push(`status: ${before.status} → ${addOn.status}`);

    await createNotification({
      actorUserId: req.user?._id || null,
      type: "maintenance",
      title: "Add-On Updated",
      description:
        changes.length > 0
          ? `Add-on "${addOn.name}" was updated. Changes: ${changes.join(", ")}.`
          : `Add-on "${addOn.name}" was updated.`,
      source: "Maintenance",
      entity: { kind: "AddOn", id: addOn._id },
    });

    return res.json(addOn);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Add-on name already exists" });
    }
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- DELETE ADD-ON -------------------- */
export const deleteAddOn = async (req, res) => {
  try {
    const addOn = await AddOn.findByIdAndDelete(req.params.id);
    if (!addOn) return res.status(404).json({ message: "Add-on not found" });

    // ✅ NOTIFICATION: Add-on deleted
    await createNotification({
      actorUserId: req.user?._id || null,
      type: "maintenance",
      title: "Add-On Deleted",
      description: `Add-on "${addOn.name}" was deleted.`,
      source: "Maintenance",
      entity: { kind: "AddOn", id: addOn._id },
    });

    return res.json({ message: "Add-on deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- DELETE MULTIPLE ADD-ONS -------------------- */
export const deleteMultipleAddOns = async (req, res) => {
  try {
    const { addOnIds } = req.body;

    if (!addOnIds || !Array.isArray(addOnIds) || addOnIds.length === 0) {
      return res.status(400).json({ message: "addOnIds array is required" });
    }

    // Fetch details before delete for notification message
    const addOnsToDelete = await AddOn.find({
      _id: { $in: addOnIds },
    }).select("name");

    const result = await AddOn.deleteMany({ _id: { $in: addOnIds } });

    // ✅ NOTIFICATION: Multiple add-ons deleted
    const names = addOnsToDelete.map((a) => a.name).filter(Boolean);
    await createNotification({
      actorUserId: req.user?._id || null,
      type: "maintenance",
      title: "Add-Ons Deleted",
      description:
        names.length <= 10
          ? `Deleted ${result.deletedCount} add-on(s): ${names.join(", ")}.`
          : `Deleted ${result.deletedCount} add-on(s). Example: ${names
              .slice(0, 5)
              .join(", ")}...`,
      source: "Maintenance",
      entity: { kind: "AddOn", id: null },
    });

    return res.json({
      message: `Deleted ${result.deletedCount} add-on(s) successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- UPDATE ADD-ON STOCK -------------------- */
export const updateAddOnStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { stock, operation } = req.body; // operation: "set", "add", "subtract"

    if (stock === undefined) {
      return res.status(400).json({ message: "Stock value is required" });
    }

    const addOn = await AddOn.findById(id);
    if (!addOn) return res.status(404).json({ message: "Add-on not found" });

    let newStock;
    switch (operation) {
      case "add":
        newStock = addOn.stock + Number(stock);
        break;
      case "subtract":
        newStock = addOn.stock - Number(stock);
        if (newStock < 0) {
          return res.status(400).json({ message: "Insufficient stock" });
        }
        break;
      default:
        newStock = Number(stock);
    }

    if (newStock < 0) {
      return res.status(400).json({ message: "Stock cannot be negative" });
    }

    addOn.stock = newStock;
    await addOn.save();

    // ✅ NOTIFICATION: Stock updated
    await createNotification({
      actorUserId: req.user?._id || null,
      type: "maintenance",
      title: "Add-On Stock Updated",
      description: `Add-on "${addOn.name}" stock was updated from ${addOn.stock - (newStock - addOn.stock)} to ${addOn.stock}.`,
      source: "Maintenance",
      entity: { kind: "AddOn", id: addOn._id },
    });

    return res.json({
      success: true,
      message: "Stock updated successfully",
      addOn,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
