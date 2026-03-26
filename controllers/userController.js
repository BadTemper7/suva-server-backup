import User from "../models/userModel.js";
import { generateToken } from "../utils/jwt.js";
import Setting from "../models/Settings.js";
import crypto from "crypto";
import {
  sendStaffWelcomeEmail,
  sendStaffPasswordResetEmail,
  sendStaffAccountLockedEmail,
} from "../config/email.js";

/* -------------------- VALIDATION HELPERS -------------------- */
const isValidUsername = (username) => /^[a-zA-Z0-9_]{8,16}$/.test(username);

const isValidPassword = (password) => {
  // Password must be 8-16 chars, at least 1 uppercase, 1 lowercase, 1 number, 1 special character
  const strongPasswordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[_!@#$%^&*])[A-Za-z\d_!@#$%^&*]{8,16}$/;
  return strongPasswordRegex.test(password);
};

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isValidPhone = (phone) => /^09\d{9}$/.test(phone);

/* -------------------- CREATE USER (SUPERADMIN ONLY) -------------------- */
export const createUser = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      contactNumber,
      email,
      username,
      password,
      role,
    } = req.body;

    // Validations
    if (
      !firstName ||
      !lastName ||
      !contactNumber ||
      !email ||
      !username ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({
        success: false,
        message:
          "Username must be 8-16 characters (letters, numbers, underscore)",
      });
    }

    if (!isValidPhone(contactNumber)) {
      return res.status(400).json({
        success: false,
        message: "Contact number must start with 09 and be exactly 11 digits",
      });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be 8-16 chars, include 1 uppercase, 1 lowercase, 1 number, and 1 special character",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { username: username.toLowerCase() },
      ],
    });

    if (existingUser) {
      const conflictField =
        existingUser.email === email.toLowerCase() ? "email" : "username";
      return res.status(400).json({
        success: false,
        message: `User with this ${conflictField} already exists`,
      });
    }

    // Create user
    const user = await User.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      contactNumber: contactNumber.trim(),
      email: email.toLowerCase().trim(),
      username: username.toLowerCase().trim(),
      password,
      role: role || "receptionist",
      status: "active", // Always active when created
    });

    // Send welcome email with credentials
    try {
      await sendStaffWelcomeEmail(user, password);
      console.log(`✅ Welcome email sent to ${user.email}`);
    } catch (emailError) {
      console.error(`❌ Failed to send welcome email: ${emailError.message}`);
      // Don't fail user creation if email fails
    }

    // Don't return password
    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.resetPasswordToken;
    delete userResponse.resetPasswordExpires;

    res.status(201).json({
      success: true,
      message:
        "User created successfully. Welcome email sent with credentials.",
      user: userResponse,
    });
  } catch (err) {
    console.error("Error in createUser:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* -------------------- LOGIN USER -------------------- */
export const loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    // Get security settings
    const maxLoginAttemptsSetting = await Setting.findOne({
      key: "maxLoginAttempts",
    });
    const lockoutDurationSetting = await Setting.findOne({
      key: "lockoutDuration",
    });

    const maxLoginAttempts = maxLoginAttemptsSetting
      ? parseInt(maxLoginAttemptsSetting.value)
      : 5;
    const lockoutDuration = lockoutDurationSetting
      ? parseInt(lockoutDurationSetting.value)
      : 15;

    // Find user with password
    const user = await User.findOne({
      $or: [
        { username: username.toLowerCase() },
        { email: username.toLowerCase() }, // Allow login with email too
      ],
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Check if account is active
    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Please contact an administrator.",
      });
    }

    // Check if account is locked
    if (user.isLocked()) {
      const remainingTime = Math.ceil(
        (user.lockUntil - Date.now()) / (60 * 1000),
      );

      // Send lock notification email (optional)
      try {
        await sendStaffAccountLockedEmail(user, lockoutDuration);
      } catch (emailError) {
        console.error(`Failed to send lock email: ${emailError.message}`);
      }

      return res.status(403).json({
        success: false,
        message: `Account is locked. Please try again in ${remainingTime} minutes.`,
      });
    }

    // Check password
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      // Increment failed login attempts
      await user.incLoginAttempts(maxLoginAttempts, lockoutDuration);

      const attemptsLeft = maxLoginAttempts - user.loginAttempts;

      if (user.isLocked()) {
        return res.status(403).json({
          success: false,
          message: `Account has been locked due to too many failed login attempts. Please try again in ${lockoutDuration} minutes.`,
        });
      }

      return res.status(401).json({
        success: false,
        message: `Invalid credentials. ${attemptsLeft} attempt${attemptsLeft > 1 ? "s" : ""} remaining.`,
      });
    }

    // Reset login attempts on successful login
    await user.resetLoginAttempts();

    // Generate token
    const token = generateToken(user);

    // Don't return password
    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.resetPasswordToken;
    delete userResponse.resetPasswordExpires;

    res.json({
      success: true,
      message: "Login successful",
      user: userResponse,
      token,
    });
  } catch (err) {
    console.error("Error in loginUser:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* -------------------- REQUEST PASSWORD RESET -------------------- */
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      // For security, don't reveal that email doesn't exist
      return res.status(200).json({
        success: true,
        message:
          "If your email is registered, you will receive a password reset link.",
      });
    }

    // Check if user is active
    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Please contact an administrator.",
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

    await user.save();

    // Send password reset email
    try {
      await sendStaffPasswordResetEmail(user, resetToken);
      console.log(`✅ Password reset email sent to ${user.email}`);
    } catch (emailError) {
      console.error(
        `❌ Failed to send password reset email: ${emailError.message}`,
      );
    }

    return res.status(200).json({
      success: true,
      message:
        "If your email is registered, you will receive a password reset link.",
      resetToken:
        process.env.NODE_ENV === "development" ? resetToken : undefined,
    });
  } catch (error) {
    console.error("Error in requestPasswordReset:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* -------------------- RESET PASSWORD -------------------- */
export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Token and new password are required",
      });
    }

    // Validate password strength
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be 8-16 chars, include 1 uppercase, 1 lowercase, 1 number, and 1 special character",
      });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid or expired reset token. Please request a new password reset.",
      });
    }

    // Update password
    user.password = newPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;

    await user.save();

    // Don't return password
    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.resetPasswordToken;
    delete userResponse.resetPasswordExpires;

    return res.status(200).json({
      success: true,
      message:
        "Password reset successful. You can now log in with your new password.",
      user: userResponse,
    });
  } catch (error) {
    console.error("Error in resetPassword:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* -------------------- UNLOCK USER ACCOUNT -------------------- */
export const unlockUserAccount = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Reset login attempts
    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAttempt = null;

    await user.save();

    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({
      success: true,
      message: "User account unlocked successfully",
      user: userResponse,
    });
  } catch (err) {
    console.error("Error in unlockUserAccount:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* -------------------- GET USERS -------------------- */
export const getUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("-password -resetPasswordToken -resetPasswordExpires")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      users,
    });
  } catch (err) {
    console.error("Error in getUsers:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* -------------------- GET USER BY ID -------------------- */
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      "-password -resetPasswordToken -resetPasswordExpires",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      user,
    });
  } catch (err) {
    console.error("Error in getUserById:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* -------------------- UPDATE USER -------------------- */
export const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const {
      firstName,
      lastName,
      contactNumber,
      email,
      username,
      password,
      role,
      status,
    } = req.body;

    // Validations (only if provided)
    if (username && !isValidUsername(username)) {
      return res.status(400).json({
        success: false,
        message:
          "Username must be 8-16 characters (letters, numbers, underscore)",
      });
    }

    if (password && !isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be 8-16 chars, include 1 uppercase, 1 lowercase, 1 number, and 1 special character",
      });
    }

    if (email && !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address",
      });
    }

    if (contactNumber && !isValidPhone(contactNumber)) {
      return res.status(400).json({
        success: false,
        message: "Contact number must start with 09 and be exactly 11 digits",
      });
    }

    // Check for duplicate email/username if changed
    if (email && email !== user.email) {
      const emailExists = await User.findOne({
        email: email.toLowerCase().trim(),
        _id: { $ne: user._id },
      });
      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "Email already in use by another user",
        });
      }
    }

    if (username && username !== user.username) {
      const usernameExists = await User.findOne({
        username: username.toLowerCase().trim(),
        _id: { $ne: user._id },
      });
      if (usernameExists) {
        return res.status(400).json({
          success: false,
          message: "Username already in use by another user",
        });
      }
    }

    // Update fields
    if (firstName !== undefined) user.firstName = firstName.trim();
    if (lastName !== undefined) user.lastName = lastName.trim();
    if (contactNumber !== undefined) user.contactNumber = contactNumber.trim();
    if (email !== undefined) user.email = email.toLowerCase().trim();
    if (username !== undefined) user.username = username.toLowerCase().trim();
    if (password) user.password = password;
    if (role !== undefined) user.role = role;
    if (status !== undefined) user.status = status;

    const updatedUser = await user.save();

    // Don't return sensitive data
    const userResponse = updatedUser.toObject();
    delete userResponse.password;
    delete userResponse.resetPasswordToken;
    delete userResponse.resetPasswordExpires;

    res.json({
      success: true,
      message: "User updated successfully",
      user: userResponse,
    });
  } catch (err) {
    console.error("Error in updateUser:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* -------------------- DELETE USER -------------------- */
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Prevent deletion of protected users
    if (user.protected) {
      return res.status(403).json({
        success: false,
        message: "Cannot delete a protected user",
      });
    }

    // Prevent deletion of superadmin (unless it's the only one)
    if (user.role === "superadmin") {
      const superadminCount = await User.countDocuments({ role: "superadmin" });
      if (superadminCount === 1) {
        return res.status(403).json({
          success: false,
          message: "Cannot delete the last superadmin user",
        });
      }
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (err) {
    console.error("Error in deleteUser:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* -------------------- DELETE MANY USERS -------------------- */
export const deleteManyUsers = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No user IDs provided",
      });
    }

    // Find users to delete
    const usersToDelete = await User.find({ _id: { $in: ids } });

    // Check for protected users
    const protectedUsers = usersToDelete.filter((u) => u.protected);
    if (protectedUsers.length > 0) {
      return res.status(403).json({
        success: false,
        message: "Cannot delete protected users",
      });
    }

    // Check for superadmin deletion
    const superadminUsers = usersToDelete.filter(
      (u) => u.role === "superadmin",
    );
    if (superadminUsers.length > 0) {
      const remainingSuperadminCount = await User.countDocuments({
        role: "superadmin",
        _id: { $nin: ids },
      });
      if (remainingSuperadminCount === 0) {
        return res.status(403).json({
          success: false,
          message: "Cannot delete all superadmin users",
        });
      }
    }

    const result = await User.deleteMany({ _id: { $in: ids } });

    res.json({
      success: true,
      message: `${result.deletedCount} user(s) deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    console.error("Error in deleteManyUsers:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* -------------------- GET USER LOGIN STATS -------------------- */
export const getUserLoginStats = async (req, res) => {
  try {
    const users = await User.find(
      {},
      "username email loginAttempts lockUntil lastLoginAttempt status role",
    ).sort({ lastLoginAttempt: -1 });

    // Get settings
    const maxLoginAttemptsSetting = await Setting.findOne({
      key: "maxLoginAttempts",
    });
    const maxLoginAttempts = maxLoginAttemptsSetting
      ? parseInt(maxLoginAttemptsSetting.value)
      : 5;

    const stats = users.map((user) => ({
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      loginAttempts: user.loginAttempts,
      lockUntil: user.lockUntil,
      lastLoginAttempt: user.lastLoginAttempt,
      isLocked: user.isLocked(),
      status: user.status,
      attemptsLeft: Math.max(0, maxLoginAttempts - user.loginAttempts),
    }));

    res.json({
      success: true,
      stats,
    });
  } catch (err) {
    console.error("Error in getUserLoginStats:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* -------------------- GET CURRENT USER -------------------- */
export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "-password -resetPasswordToken -resetPasswordExpires",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      user,
    });
  } catch (err) {
    console.error("Error in getCurrentUser:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
