import User from "../models/userModel.js";
import { generateToken } from "../utils/jwt.js";
import Setting from "../models/Settings.js";
/* -------------------- VALIDATION HELPERS -------------------- */
const isValidUsername = (username) => /^[a-zA-Z0-9_]{8,16}$/.test(username);

const isValidPassword = (password) =>
  /^(?=.*[A-Z])(?=.*[_!@#$%^&*])[A-Za-z\d_!@#$%^&*]{8,16}$/.test(password);

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isValidPhone = (phone) => /^09\d{9}$/.test(phone);

/* -------------------- REGISTER USER -------------------- */
// @route POST /api/users/register
export const registerUser = async (req, res) => {
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
    /* ----------- VALIDATIONS ----------- */
    if (!isValidUsername(username)) {
      return res.status(400).json({
        message: "Username must be 8–16 characters",
      });
    }

    if (!isValidPhone(contactNumber)) {
      return res.status(400).json({
        message: "Phone number must start with 09 and be exactly 11 digits",
      });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({
        message:
          "Password must be 8–16 chars, include 1 uppercase and 1 special character",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User with email or username already exists" });
    }

    const user = await User.create({
      firstName,
      lastName,
      contactNumber,
      email,
      username,
      password,
      role: role || "receptionist",
    });

    res.status(201).json({
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`,
      username: user.username,
      email: user.email,
      contactNumber: user.contactNumber,
      role: user.role,
      status: user.status,
      token: generateToken(user),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* -------------------- LOGIN USER -------------------- */
export const loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;

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

    const user = await User.findOne({ username });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check if account is locked
    if (user.isLocked()) {
      const remainingTime = Math.ceil(
        (user.lockUntil - Date.now()) / (60 * 1000),
      );
      return res.status(403).json({
        message: `Account is locked. Please try again in ${remainingTime} minutes.`,
      });
    }

    // Check password
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      // Increment failed login attempts with settings
      await user.incLoginAttempts(maxLoginAttempts, lockoutDuration);

      const attemptsLeft = maxLoginAttempts - user.loginAttempts;

      if (user.isLocked()) {
        return res.status(403).json({
          message: `Account has been locked due to too many failed login attempts. Please try again in ${lockoutDuration} minutes.`,
        });
      }

      return res.status(401).json({
        message: `Invalid credentials. ${attemptsLeft} attempt${attemptsLeft > 1 ? "s" : ""} remaining.`,
      });
    }

    // If password is correct, reset login attempts
    await user.resetLoginAttempts();

    // Generate token
    const token = generateToken(user);

    res.json({
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`,
      username: user.username,
      email: user.email,
      contactNumber: user.contactNumber,
      role: user.role,
      status: user.status,
      token: token,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
// controllers/userController.js - Add this function
/* -------------------- UNLOCK USER ACCOUNT -------------------- */
export const unlockUserAccount = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Reset login attempts
    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAttempt = null;

    await user.save();

    res.json({
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      email: user.email,
      message: "User account unlocked successfully",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* -------------------- GET USER LOGIN STATS -------------------- */
export const getUserLoginStats = async (req, res) => {
  try {
    const users = await User.find(
      {},
      "username email loginAttempts lockUntil lastLoginAttempt status",
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
      loginAttempts: user.loginAttempts,
      lockUntil: user.lockUntil,
      lastLoginAttempt: user.lastLoginAttempt,
      isLocked: user.isLocked(),
      status: user.status,
      attemptsLeft: maxLoginAttempts - user.loginAttempts,
    }));

    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
/* -------------------- GET USERS -------------------- */
export const getUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* -------------------- GET USER BY ID -------------------- */
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* -------------------- UPDATE USER -------------------- */
export const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

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

    /* ----------- VALIDATIONS (ONLY IF PROVIDED) ----------- */
    if (username && !isValidUsername(username)) {
      return res
        .status(400)
        .json({ message: "Username must be 8–16 characters" });
    }

    if (password && !isValidPassword(password)) {
      return res.status(400).json({
        message:
          "Password must be 8–16 chars, include 1 uppercase and 1 special character",
      });
    }

    if (email && !isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }

    if (contactNumber && !isValidPhone(contactNumber)) {
      return res.status(400).json({
        message: "Phone number must start with 09 and be exactly 11 digits",
      });
    }

    user.firstName = firstName ?? user.firstName;
    user.lastName = lastName ?? user.lastName;
    user.contactNumber = contactNumber ?? user.contactNumber;
    user.email = email ?? user.email;
    user.username = username ?? user.username;
    if (password) user.password = password;
    user.role = role ?? user.role;
    user.status = status ?? user.status;

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      fullName: `${updatedUser.firstName} ${updatedUser.lastName}`,
      username: updatedUser.username,
      email: updatedUser.email,
      contactNumber: updatedUser.contactNumber,
      role: updatedUser.role,
      status: updatedUser.status,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* -------------------- DELETE USER -------------------- */
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.protected || user.role === "superadmin") {
      return res
        .status(403)
        .json({ message: "Cannot delete a protected user" });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "User removed successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* -------------------- DELETE MANY USERS -------------------- */
export const deleteManyUsers = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No user IDs provided" });
    }

    // Find all users to delete
    const usersToDelete = await User.find({ _id: { $in: ids } });

    const protectedUsers = usersToDelete.filter(
      (u) => u.protected || u.role === "superadmin",
    );

    if (protectedUsers.length > 0) {
      return res.status(403).json({ message: "Cannot delete protected users" });
    }

    const result = await User.deleteMany({ _id: { $in: ids } });
    res.json({
      message: `${result.deletedCount} user(s) removed successfully`,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
