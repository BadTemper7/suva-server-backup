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
      default: null,
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
    isEmailVerified: {
      type: Boolean,
      default: false,
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
