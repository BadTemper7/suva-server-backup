import PaymentType from "../models/PaymentType.js";
import cloudinary from "../config/cloudinary.js";
import { deleteFromCloudinary } from "../utils/cloudinary.js";

// Create a new PaymentType
export const createPaymentType = async (req, res) => {
  try {
    const { name, isReceipt, isActive } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    // Check if the payment type with this name already exists
    const existingType = await PaymentType.findOne({ name });
    if (existingType) {
      return res
        .status(400)
        .json({ error: "Payment type with this name already exists" });
    }

    let qrCodeUrl = null;
    let qrCodePublicId = null;
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "payment-types",
      });
      qrCodeUrl = result.secure_url;
      qrCodePublicId = result.public_id;
    }

    const paymentType = new PaymentType({
      name,
      isReceipt,
      isActive,
      qrCodeUrl,
      qrCodePublicId,
    });

    await paymentType.save();

    return res.status(201).json({
      message: "Payment type created successfully",
      paymentType,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Get all PaymentTypes
export const getPaymentTypes = async (req, res) => {
  try {
    const paymentTypes = await PaymentType.find();
    return res.status(200).json(paymentTypes);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Get a PaymentType by ID
export const getPaymentTypeById = async (req, res) => {
  try {
    const paymentType = await PaymentType.findById(req.params.id);
    if (!paymentType) {
      return res.status(404).json({ error: "Payment type not found" });
    }
    return res.status(200).json(paymentType);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Update a PaymentType by ID
export const updatePaymentType = async (req, res) => {
  try {
    const { name, isReceipt, isActive, removeQrCode } = req.body;

    const paymentType = await PaymentType.findById(req.params.id);
    if (!paymentType) {
      return res.status(404).json({ error: "Payment type not found" });
    }

    if (name !== undefined) paymentType.name = name;
    if (isReceipt !== undefined) paymentType.isReceipt = isReceipt;
    if (isActive !== undefined) paymentType.isActive = isActive;

    const wantsRemoval = removeQrCode === true || removeQrCode === "true";

    if (req.file) {
      // Replacing — delete the old image first if there was one.
      if (paymentType.qrCodePublicId) {
        await deleteFromCloudinary(paymentType.qrCodePublicId).catch(() => {});
      }
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "payment-types",
      });
      paymentType.qrCodeUrl = result.secure_url;
      paymentType.qrCodePublicId = result.public_id;
    } else if (wantsRemoval && paymentType.qrCodePublicId) {
      await deleteFromCloudinary(paymentType.qrCodePublicId).catch(() => {});
      paymentType.qrCodeUrl = null;
      paymentType.qrCodePublicId = null;
    }

    await paymentType.save();

    return res.status(200).json({
      message: "Payment type updated successfully",
      paymentType,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Delete a PaymentType by ID
export const deletePaymentType = async (req, res) => {
  try {
    const deletedPaymentType = await PaymentType.findByIdAndDelete(
      req.params.id,
    );
    if (!deletedPaymentType) {
      return res.status(404).json({ error: "Payment type not found" });
    }

    return res.status(200).json({
      message: "Payment type deleted successfully",
      paymentType: deletedPaymentType,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// DELETE /payment-types/multiple
export const deleteMultiplePaymentTypes = async (req, res) => {
  try {
    const { paymentTypeIds } = req.body;

    if (!Array.isArray(paymentTypeIds) || paymentTypeIds.length === 0) {
      return res.status(400).json({
        message: "Array of payment type IDs is required",
      });
    }

    const result = await PaymentType.deleteMany({
      _id: { $in: paymentTypeIds },
    });

    return res.status(200).json({
      message: `${result.deletedCount} payment type(s) deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
