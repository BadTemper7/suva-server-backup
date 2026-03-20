import PaymentOption from "../models/PaymentOption.js";

// Create a new PaymentOption
export const createPaymentOption = async (req, res) => {
  try {
    const { name, paymentType, amount, isActive } = req.body;

    if (!name || !paymentType) {
      return res
        .status(400)
        .json({ error: "Name and paymentType are required" });
    }

    // Validate 'amount' only if the payment type is 'partial'
    if (
      paymentType === "partial" &&
      (amount == null || amount <= 0 || amount > 100)
    ) {
      return res.status(400).json({
        error: "Amount must be between 1 and 100 for partial payments",
      });
    }

    const existingOption = await PaymentOption.findOne({ name });
    if (existingOption) {
      return res
        .status(400)
        .json({ error: "Payment option with this name already exists" });
    }

    const paymentOption = new PaymentOption({
      name,
      paymentType,
      amount,
      isActive,
    });

    await paymentOption.save();

    return res.status(201).json({
      message: "Payment option created successfully",
      paymentOption,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Get all PaymentOptions
export const getPaymentOptions = async (req, res) => {
  try {
    const paymentOptions = await PaymentOption.find();
    return res.status(200).json(paymentOptions);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Get a PaymentOption by ID
export const getPaymentOptionById = async (req, res) => {
  try {
    const paymentOption = await PaymentOption.findById(req.params.id);
    if (!paymentOption) {
      return res.status(404).json({ error: "Payment option not found" });
    }
    return res.status(200).json(paymentOption);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Update a PaymentOption by ID
export const updatePaymentOption = async (req, res) => {
  try {
    const { name, paymentType, amount, isActive } = req.body;

    // Validate 'amount' only if the payment type is 'partial'
    if (
      paymentType === "partial" &&
      (amount == null || amount <= 0 || amount > 100)
    ) {
      return res.status(400).json({
        error: "Amount must be between 1 and 100 for partial payments",
      });
    }

    const updatedPaymentOption = await PaymentOption.findByIdAndUpdate(
      req.params.id,
      { name, paymentType, amount, isActive },
      { new: true, runValidators: true },
    );

    if (!updatedPaymentOption) {
      return res.status(404).json({ error: "Payment option not found" });
    }

    return res.status(200).json({
      message: "Payment option updated successfully",
      paymentOption: updatedPaymentOption,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Delete a PaymentOption by ID
export const deletePaymentOption = async (req, res) => {
  try {
    const deletedPaymentOption = await PaymentOption.findByIdAndDelete(
      req.params.id,
    );
    if (!deletedPaymentOption) {
      return res.status(404).json({ error: "Payment option not found" });
    }

    return res.status(200).json({
      message: "Payment option deleted successfully",
      paymentOption: deletedPaymentOption,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
// DELETE /payment-options/bulk
export const deleteMultiplePaymentOptions = async (req, res) => {
  try {
    const { paymentOptionIds } = req.body;
    console.log(req.body);
    if (!Array.isArray(paymentOptionIds) || paymentOptionIds.length === 0) {
      return res.status(400).json({
        error: "Array of payment option IDs is required",
      });
    }

    const result = await PaymentOption.deleteMany({
      _id: { $in: paymentOptionIds },
    });

    return res.json({
      message: `${result.deletedCount} payment option(s) deleted successfully.`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
