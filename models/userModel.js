import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    contactNumber: {
      type: String,
      required: true,
      trim: true,
      match: [
        /^09\d{9}$/,
        "Contact number must start with 09 and be 11 digits",
      ],
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email address"],
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [
        /^[a-zA-Z0-9_]{8,16}$/,
        "Username must be 8-16 characters (letters, numbers, underscore)",
      ],
    },
    password: {
      type: String,
      required: true,
      select: false, // Don't return password by default
    },
    role: {
      type: String,
      enum: ["receptionist", "admin", "superadmin"],
      default: "receptionist",
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    protected: {
      type: Boolean,
      default: false, // Cannot be deleted
    },

    // Security fields for login attempts
    loginAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    lastLoginAttempt: {
      type: Date,
      default: null,
    },

    // Password reset functionality (for when users forget password)
    resetPasswordToken: {
      type: String,
      default: null,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Indexes for better performance
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ status: 1 });
userSchema.index({ role: 1 });

// Virtual for full name
userSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Check if account is locked
userSchema.methods.isLocked = function () {
  return this.lockUntil && this.lockUntil > Date.now();
};

// Increment login attempts
userSchema.methods.incLoginAttempts = async function (
  maxLoginAttempts = 5,
  lockoutDuration = 15,
) {
  const now = Date.now();

  // If lockUntil is in the past, reset attempts
  if (this.lockUntil && this.lockUntil < now) {
    this.loginAttempts = 1;
    this.lockUntil = null;
  } else {
    this.loginAttempts += 1;
  }

  this.lastLoginAttempt = now;

  // Check if we need to lock the account
  if (this.loginAttempts >= maxLoginAttempts) {
    this.lockUntil = new Date(now + lockoutDuration * 60 * 1000);
  }

  return this.save();
};

// Reset login attempts on successful login
userSchema.methods.resetLoginAttempts = async function () {
  this.loginAttempts = 0;
  this.lockUntil = null;
  this.lastLoginAttempt = null;
  return this.save();
};

// Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false;
  return bcrypt.compare(enteredPassword, this.password);
};

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Static method to find by username with password
userSchema.statics.findByUsernameWithPassword = function (username) {
  return this.findOne({ username }).select("+password");
};

const User = mongoose.model("User", userSchema);

export default User;
