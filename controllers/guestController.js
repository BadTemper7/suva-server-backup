import Guest from "../models/Guest.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";

/* -------------------- CREATE GUEST -------------------- */
export const createGuest = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      contactNumber,
      email,
      password, // Optional
      status = "active",
    } = req.body;

    if (!firstName || !lastName || !contactNumber) {
      return res
        .status(400)
        .json({ message: "firstName, lastName, contactNumber are required" });
    }

    // If email is provided, check if it already exists
    if (email) {
      const existingGuest = await Guest.findOne({
        email: email.trim().toLowerCase(),
      });
      if (existingGuest) {
        return res.status(409).json({
          message:
            "Email already exists. Please use a different email or login.",
          exists: true,
          guest: existingGuest,
        });
      }
    }

    const guestData = {
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      contactNumber: String(contactNumber).trim(),
      email: email ? String(email).trim().toLowerCase() : null,
      status,
    };

    // If password is provided, set up account
    if (password && email) {
      guestData.password = password;
      guestData.hasAccount = true;
      guestData.accountType = "registered";
    } else {
      guestData.accountType = "walk-in";
    }

    const guest = await Guest.create(guestData);

    // Don't return password in response
    const guestResponse = guest.toObject();
    delete guestResponse.password;

    return res.status(201).json({
      success: true,
      message: password
        ? "Guest registered successfully"
        : "Walk-in guest created successfully",
      guest: guestResponse,
      hasAccount: !!password,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
export const registerGuest = async (req, res) => {
  try {
    const { firstName, lastName, contactNumber, email, password } = req.body;

    if (!firstName || !lastName || !contactNumber || !email || !password) {
      return res.status(400).json({
        message: "All fields are required for registration",
      });
    }

    // Check if email already exists
    const existingGuest = await Guest.findOne({
      email: email.trim().toLowerCase(),
    });
    if (existingGuest) {
      return res.status(409).json({
        message: "Email already registered",
        exists: true,
      });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters long",
      });
    }

    const guest = await Guest.create({
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      contactNumber: String(contactNumber).trim(),
      email: String(email).trim().toLowerCase(),
      password,
      hasAccount: true,
      accountType: "registered",
      status: "active",
    });

    const guestResponse = guest.toObject();
    delete guestResponse.password;

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      guest: guestResponse,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- LOGIN GUEST -------------------- */
export const loginGuest = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find guest with password field
    const guest = await Guest.findOne({
      email: email.trim().toLowerCase(),
    }).select("+password");

    if (!guest) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if guest has password set
    if (!guest.password) {
      return res.status(401).json({
        success: false,
        message:
          "This account doesn't have a password set. Please use the register option.",
        needsRegistration: true,
      });
    }

    // Verify password
    const isValidPassword = await guest.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Don't return password
    const guestResponse = guest.toObject();
    delete guestResponse.password;
    const token = jwt.sign(
      {
        id: guest._id,
        email: guest.email,
        firstName: guest.firstName,
        lastName: guest.lastName,
        role: "guest",
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );
    return res.status(200).json({
      success: true,
      token,
      message: "Login successful",
      guest: guestResponse,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
// Add to guestController.js
export const changePassword = async (req, res) => {
  try {
    const { guestId, newPassword } = req.body;

    if (!guestId || !newPassword) {
      return res.status(400).json({
        message: "Guest ID and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "New password must be at least 6 characters long",
      });
    }

    // Check for spaces in password
    if (/\s/.test(newPassword)) {
      return res.status(400).json({
        message: "Password cannot contain spaces",
      });
    }

    // Find guest
    const guest = await Guest.findById(guestId);

    if (!guest) {
      return res.status(404).json({ message: "Guest not found" });
    }

    // Update password
    guest.password = newPassword;
    guest.hasAccount = true;
    guest.accountType = "registered";
    await guest.save();

    // Don't return password in response
    const guestResponse = guest.toObject();
    delete guestResponse.password;

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
      guest: guestResponse,
    });
  } catch (error) {
    console.error("Error changing password:", error);
    return res.status(500).json({ message: error.message });
  }
};
/* -------------------- UPGRADE WALK-IN TO ACCOUNT -------------------- */
export const upgradeToAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required to upgrade to an account",
      });
    }

    // Check if email is already taken by another guest
    const existingGuest = await Guest.findOne({
      email: email.trim().toLowerCase(),
      _id: { $ne: id },
    });

    if (existingGuest) {
      return res.status(409).json({
        message: "Email is already registered to another account",
      });
    }

    const guest = await Guest.findById(id);
    if (!guest) {
      return res.status(404).json({ message: "Guest not found" });
    }

    // Update guest with account info
    guest.email = email.trim().toLowerCase();
    guest.password = password;
    guest.hasAccount = true;
    guest.accountType = "registered";

    await guest.save();

    const guestResponse = guest.toObject();
    delete guestResponse.password;

    return res.json({
      success: true,
      message: "Account upgraded successfully",
      guest: guestResponse,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- RESET PASSWORD REQUEST -------------------- */
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const guest = await Guest.findOne({ email: email.trim().toLowerCase() });
    if (!guest) {
      return res.status(404).json({ message: "Guest not found" });
    }

    if (!guest.hasAccount) {
      return res.status(400).json({
        message:
          "This email is not registered. Please create an account first.",
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    guest.resetPasswordToken = resetToken;
    guest.resetPasswordExpires = Date.now() + 3600000; // 1 hour

    await guest.save();

    // Here you would send the reset token via email
    // For development, return the token
    return res.json({
      success: true,
      message: "Password reset email sent",
      resetToken:
        process.env.NODE_ENV === "development" ? resetToken : undefined,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- RESET PASSWORD -------------------- */
export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        message: "Token and new password are required",
      });
    }

    const guest = await Guest.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!guest) {
      return res.status(400).json({
        message: "Invalid or expired reset token",
      });
    }

    // Update password
    guest.password = newPassword;
    guest.resetPasswordToken = null;
    guest.resetPasswordExpires = null;

    await guest.save();

    return res.json({
      success: true,
      message: "Password reset successful",
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
/* -------------------- FIND OR CREATE GUEST BY EMAIL -------------------- */
export const findOrCreateGuestByEmail = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      contactNumber,
      email,
      status = "active",
    } = req.body;

    if (!firstName || !lastName || !contactNumber || !email) {
      return res.status(400).json({
        message: "firstName, lastName, contactNumber, and email are required",
      });
    }

    // Normalize email
    const normalizedEmail = String(email).trim().toLowerCase();

    // Check if guest exists
    const existing = await Guest.findOne({ email: normalizedEmail });
    if (existing) {
      return res.json({
        mode: "existing",
        guest: existing,
        hasAccount: existing.hasAccount,
      });
    }

    // Create new guest as walk-in
    const guest = await Guest.create({
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      contactNumber: String(contactNumber).trim(),
      email: normalizedEmail,
      status,
      accountType: "walk-in",
      hasAccount: false,
    });

    return res.status(201).json({
      mode: "created",
      guest,
      hasAccount: false,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- GET GUESTS -------------------- */
export const getGuests = async (req, res) => {
  try {
    const { q, includeInactive } = req.query;

    const filter = {};
    if (q) {
      const rx = new RegExp(String(q).trim(), "i");
      filter.$or = [
        { firstName: rx },
        { lastName: rx },
        { contactNumber: rx },
        { email: rx },
      ];
    }

    if (!includeInactive) {
      filter.status = "active";
    }

    const guests = await Guest.find(filter)
      .select("-password -resetPasswordToken -resetPasswordExpires")
      .sort({ createdAt: -1 })
      .limit(200);

    return res.json(guests);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
// GET /api/guests/find-by-email?email=guest@example.com
export const getGuestByEmail = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
        error: "Email query parameter is missing",
      });
    }

    // Clean the email
    const cleanEmail = email.trim().toLowerCase();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
        error: "Please provide a valid email address",
      });
    }

    // Find guest by email
    const guest = await Guest.findOne({ email: cleanEmail })
      .select("-__v -createdAt -updatedAt") // Exclude unnecessary fields
      .lean(); // Return plain JavaScript object

    if (!guest) {
      return res.status(404).json({
        success: false,
        message: "Guest not found",
        error: `No guest found with email: ${cleanEmail}`,
        guest: null,
        exists: false,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Guest found",
      guest: {
        _id: guest._id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        contactNumber: guest.contactNumber,
        email: guest.email,
        // Add any other fields from your Guest model
      },
      exists: true,
    });
  } catch (error) {
    console.error("Error in getGuestByEmail:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/* -------------------- GET GUEST BY ID -------------------- */
export const getGuestById = async (req, res) => {
  try {
    const guest = await Guest.findById(req.params.id);
    if (!guest) return res.status(404).json({ message: "Guest not found" });
    return res.json(guest);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- UPDATE GUEST -------------------- */
export const updateGuest = async (req, res) => {
  try {
    const { firstName, lastName, contactNumber, email, status, password } =
      req.body;

    const update = {};
    if (firstName !== undefined) update.firstName = String(firstName).trim();
    if (lastName !== undefined) update.lastName = String(lastName).trim();
    if (contactNumber !== undefined)
      update.contactNumber = String(contactNumber).trim();
    if (email !== undefined)
      update.email = email ? String(email).trim().toLowerCase() : null;
    if (status !== undefined) update.status = status;
    if (password !== undefined) update.password = password;

    const guest = await Guest.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    }).select("-password -resetPasswordToken -resetPasswordExpires");

    if (!guest) return res.status(404).json({ message: "Guest not found" });
    return res.json(guest);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- DELETE GUEST -------------------- */
export const deleteGuest = async (req, res) => {
  try {
    const guest = await Guest.findByIdAndDelete(req.params.id);
    if (!guest) return res.status(404).json({ message: "Guest not found" });
    return res.json({ message: "Guest deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* -------------------- DELETE MULTIPLE GUESTS -------------------- */
export const deleteMultipleGuests = async (req, res) => {
  try {
    const { guestIds } = req.body;

    if (!guestIds || !Array.isArray(guestIds) || guestIds.length === 0) {
      return res.status(400).json({ message: "guestIds array is required" });
    }

    const result = await Guest.deleteMany({ _id: { $in: guestIds } });

    return res.json({
      message: `Deleted ${result.deletedCount} guest(s) successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
