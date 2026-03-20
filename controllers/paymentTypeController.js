import PaymentType from "../models/PaymentType.js";

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

    const paymentType = new PaymentType({
      name,
      isReceipt,
      isActive,
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
    const { name, isReceipt, isActive } = req.body;

    const updatedPaymentType = await PaymentType.findByIdAndUpdate(
      req.params.id,
      { name, isReceipt, isActive },
      { new: true, runValidators: true },
    );

    if (!updatedPaymentType) {
      return res.status(404).json({ error: "Payment type not found" });
    }

    return res.status(200).json({
      message: "Payment type updated successfully",
      paymentType: updatedPaymentType,
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
