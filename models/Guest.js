import mongoose from "mongoose";
import bcrypt from "bcryptjs"; // Install: npm install bcryptjs

const { Schema } = mongoose;

const guestSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },

    contactNumber: {
      type: String,
      required: true,
      trim: true,
      match: [
        /^09\d{9}$/,
        "Contact number must start with 09 and be 11 digits",
      ],
      index: true,
    },

    // NOT unique (walk-ins can reuse / can be null)
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 120,
      match: [/^\S+@\S+\.\S+$/, "Invalid email address"],
      default: undefined,
      set: (value) => {
        if (value === null || value === undefined) return undefined;
        const normalized = String(value).trim().toLowerCase();
        return normalized || undefined;
      },
      // index: true,
      // unique: true,
    },

    // Optional password - for registered users who create an account
    password: {
      type: String,
      trim: true,
      select: false, // Don't return password by default in queries
      default: null,
    },

    // Account status flags
    hasAccount: {
      type: Boolean,
      default: false, // True if user has set a password (registered account)
    },

    // Track if this was a walk-in or registered user
    accountType: {
      type: String,
      enum: ["walk-in", "registered"],
      default: "walk-in",
    },

    // Explicit source tag for reporting/filtering
    guestType: {
      type: String,
      enum: ["walk-in", "online"],
      default: "walk-in",
      index: true,
    },

    // For email verification (if needed)
    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    // For password reset functionality
    resetPasswordToken: {
      type: String,
      default: null,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
    },
    emailVerificationToken: {
      type: String,
      default: null,
    },

    emailVerificationExpires: {
      type: Date,
      default: null,
    },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true },
);

// Index for faster queries
guestSchema.index({ email: 1 }, { unique: true, sparse: true });

// Keep account flags and guest type consistent.
guestSchema.pre("validate", function (next) {
  // Keep email truly optional for walk-ins: avoid storing null/empty strings.
  if (!this.email || !String(this.email).trim()) {
    this.email = undefined;
  } else {
    this.email = String(this.email).trim().toLowerCase();
  }

  const isRegistered = this.accountType === "registered" || !!this.password;

  if (isRegistered) {
    this.accountType = "registered";
    this.hasAccount = true;
    this.guestType = "online";
  } else {
    this.accountType = "walk-in";
    this.hasAccount = false;
    this.guestType = "walk-in";
  }

  next();
});

// Hash password before saving if it's modified and not null
guestSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);

    // Update account flags when password is set
    if (this.password) {
      this.hasAccount = true;
      this.accountType = "registered";
      this.guestType = "online";
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
guestSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to check if guest has an account
guestSchema.methods.hasRegisteredAccount = function () {
  return this.hasAccount && this.password !== null;
};

// Static method to find by email with password
guestSchema.statics.findByEmailWithPassword = function (email) {
  return this.findOne({ email }).select("+password");
};

const Guest = mongoose.model("Guest", guestSchema);
export default Guest;
