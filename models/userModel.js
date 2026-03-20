import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    contactNumber: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: {
      type: String,
      enum: ["receptionist", "admin", "superadmin"],
      default: "receptionist",
    },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    protected: { type: Boolean, default: false }, // ✅ Cannot be deleted
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    lastLoginAttempt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);
userSchema.methods.isLocked = function () {
  return this.lockUntil && this.lockUntil > Date.now();
};
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

  // Check if we need to lock the account using the provided maxLoginAttempts
  if (this.loginAttempts >= maxLoginAttempts) {
    this.lockUntil = new Date(now + lockoutDuration * 60 * 1000);
  }

  return this.save();
};

// Add instance method to reset login attempts on successful login
userSchema.methods.resetLoginAttempts = async function () {
  this.loginAttempts = 0;
  this.lockUntil = null;
  return this.save();
};
// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// Virtual for full name
userSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

const User = mongoose.model("User", userSchema);

export default User;
